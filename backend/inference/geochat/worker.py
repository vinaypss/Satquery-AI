#!/usr/bin/env python3
"""
SatQuery AI - Phase 7 GeoChat-7B Inference Worker
SIH26167 | ISRO Space Technology

Independent, authenticated Python worker service for Remote-Sensing
Visual Question Answering (VQA) and Scene Captioning.

Official Reference:
- GitHub: https://github.com/mbzuai-oryx/GeoChat
- Checkpoint: MBZUAI/geochat-7B

Exposes REST API endpoints:
  - GET  /health (or /v1/health)       -> Process health & hardware diagnostics
  - GET  /readiness (or /v1/readiness) -> Strict multimodal model readiness state
  - POST /v1/vqa                       -> Authenticated multimodal VQA inference
  - POST /v1/caption                   -> Authenticated multimodal Scene Caption inference
  - POST /v1/load-model                -> Explicit GPU weight & vision pipeline loader

Per SIH26167 & Phase 7 integrity guidelines:
- Evaluates hardware capabilities (GPU name, VRAM, CUDA).
- Enforces request authentication via shared secret token.
- Uses threading inference lock for GPU concurrency safety.
- Preprocesses images using official GeoChat expand2square + CLIP 504x504 pipeline.
- Uses official conversation template (llava_v1) and IMAGE_TOKEN_INDEX (-200).
- Passes image tensor directly to model.generate(input_ids=..., images=...).
- Strictly rejects unsupported modalities (e.g. SAR) with UNSUPPORTED_MODALITY.
- Never fabricates simulated VQA answers, captions, or confidence scores.
- Truthfully reports unavailable/blocked state on non-CUDA hosts.
- Tags all successful model generations with provenance: MODEL_GENERATED.
"""

import os
import re
import sys
import json
import time
import base64
import argparse
import threading
import dataclasses
from enum import auto, Enum
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Tuple, Optional, List
from PIL import Image
import io

# Optional PyTorch import with safe fallback
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    TORCH_AVAILABLE = False


# Maximum allowed base64 data length (approx 25MB binary payload)
MAX_PAYLOAD_BASE64_LENGTH = 35 * 1024 * 1024

# Official GeoChat Model Constants
IGNORE_INDEX = -100
IMAGE_TOKEN_INDEX = -200
DEFAULT_IMAGE_TOKEN = "<image>"
DEFAULT_IMAGE_PATCH_TOKEN = "<im_patch>"
DEFAULT_IM_START_TOKEN = "<im_start>"
DEFAULT_IM_END_TOKEN = "<im_end>"


class SeparatorStyle(Enum):
    """Separator styles matching official GeoChat conversation."""
    SINGLE = auto()
    TWO = auto()


@dataclasses.dataclass
class Conversation:
    """Conversation class matching official GeoChat conversation history."""
    system: str
    roles: List[str]
    messages: List[List[str]]
    offset: int
    sep_style: SeparatorStyle = SeparatorStyle.SINGLE
    sep: str = "###"
    sep2: Optional[str] = None
    version: str = "Unknown"

    def get_prompt(self) -> str:
        messages = self.messages
        if self.sep_style == SeparatorStyle.TWO:
            seps = [self.sep, self.sep2]
            ret = self.system + seps[0]
            for i, (role, message) in enumerate(messages):
                if message:
                    ret += role + ": " + message + seps[i % 2]
                else:
                    ret += role + ":"
            return ret
        elif self.sep_style == SeparatorStyle.SINGLE:
            ret = self.system + self.sep
            for role, message in messages:
                if message:
                    ret += role + ": " + message + self.sep
                else:
                    ret += role + ":"
            return ret
        raise ValueError(f"Unsupported separator style: {self.sep_style}")

    def append_message(self, role: str, message: Optional[str]):
        self.messages.append([role, message])

    def copy(self) -> "Conversation":
        return Conversation(
            system=self.system,
            roles=self.roles,
            messages=[[x, y] for x, y in self.messages],
            offset=self.offset,
            sep_style=self.sep_style,
            sep=self.sep,
            sep2=self.sep2,
            version=self.version
        )


def get_conv_template(template_name: str = "llava_v1") -> Conversation:
    """Returns official conversation template for GeoChat (default: llava_v1)."""
    try:
        from geochat.conversation import conv_templates
        if template_name in conv_templates:
            return conv_templates[template_name].copy()
    except ImportError:
        pass

    if template_name == "llava_v1":
        return Conversation(
            system="A chat between a curious human and an artificial intelligence assistant. "
                   "The assistant gives helpful, detailed, and polite answers to the human's questions.",
            roles=("USER", "ASSISTANT"),
            version="v1",
            messages=[],
            offset=0,
            sep_style=SeparatorStyle.TWO,
            sep=" ",
            sep2="</s>",
        )
    raise ValueError(f"Unknown conversation template: {template_name}")


def expand2square(pil_img: Image.Image, background_color=(122, 116, 104)) -> Image.Image:
    """
    Pads non-square images to square with background color.
    Official GeoChat preprocessing implementation in geochat/mm_utils.py.
    """
    width, height = pil_img.size
    if width == height:
        return pil_img
    elif width > height:
        result = Image.new(pil_img.mode, (width, width), background_color)
        result.paste(pil_img, (0, (width - height) // 2))
        return result
    else:
        result = Image.new(pil_img.mode, (height, height), background_color)
        result.paste(pil_img, ((height - width) // 2, 0))
        return result


def tokenizer_image_token(prompt: str, tokenizer, image_token_index: int = IMAGE_TOKEN_INDEX, return_tensors: Optional[str] = None):
    """
    Tokenizes text and substitutes <image> with the special token index (-200).
    Official GeoChat implementation in geochat/mm_utils.py.
    """
    prompt_chunks = [tokenizer(chunk).input_ids for chunk in prompt.split(DEFAULT_IMAGE_TOKEN)]

    def insert_separator(X, sep):
        return [ele for sublist in zip(X, [sep] * len(X)) for ele in sublist][:-1]

    input_ids = []
    offset = 0
    bos_id = getattr(tokenizer, "bos_token_id", None)
    if len(prompt_chunks) > 0 and len(prompt_chunks[0]) > 0 and prompt_chunks[0][0] == bos_id:
        offset = 1
        input_ids.append(prompt_chunks[0][0])

    for x in insert_separator(prompt_chunks, [image_token_index] * (offset + 1)):
        input_ids.extend(x[offset:])

    if return_tensors is not None:
        if return_tensors == "pt":
            if torch is not None:
                return torch.tensor(input_ids, dtype=torch.long)
            raise RuntimeError("PyTorch not installed; cannot return pt tensor.")
        raise ValueError(f"Unsupported tensor type: {return_tensors}")
    return input_ids


def clean_geochat_caption(text: str) -> str:
    """
    Remove GeoChat grounding/control tokens from a raw model caption while
    preserving all natural-language content.

    GeoChat is a grounded VLM and may embed the following in its outputs:
      - Oriented bounding boxes:  {<y1><x1><y2><x2>|<angle>}
      - Standard boxes:           {<y1><x1><y2><x2>}
      - Delimiter tag:            <delim>  or  <delim/>
      - Phrase wrappers:          <p>...</p>
      - Task instruction tags:    [grounding], [refer], [identify], [detection]
      - Special image tokens:     <image>, <im_start>, <im_end>, <im_patch>, <unk>

    None of these carry display-relevant semantic content; only natural text is kept.
    The function is a pure transform — it never fabricates or rewrites text.

    Args:
        text: Raw string decoded from GeoChat model output.

    Returns:
        Cleaned string with grounding/control tokens removed.
        Empty string if the raw output contained *only* such tokens.
    """
    if not isinstance(text, str):
        return ""

    # 1. Oriented bounding-box tokens: {<...><...><...><...>|<angle>} and standard {<...><...><...><...>}
    #    Matches 1-6 numeric coordinate tags optionally followed by |<angle>
    text = re.sub(
        r'\{(?:\s*<-?\d+>\s*){1,6}(?:\|<-?\d+>)?\s*\}',
        '',
        text
    )

    # 2. <delim> and <delim/> separator tokens
    text = re.sub(r'<delim\s*/?>', '', text)

    # 3. Phrase-wrapper tags: <p>...</p>  (keep inner text, remove tags)
    text = re.sub(r'</?p>', '', text)

    # 4. Task instruction tokens
    text = re.sub(r'\[(?:grounding|refer|identify|detection)\]', '', text)

    # 5. Special image / model tokens
    text = re.sub(r'<(?:image|im_start|im_end|im_patch|unk)>', '', text)

    # 6. Normalise whitespace: collapse multiples, fix space-before-punctuation
    text = re.sub(r'\s+([,.:;?!])', r'\1', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()


class KeywordsStoppingCriteria:
    """Official GeoChat stopping criteria for generation termination on separator strings."""
    def __init__(self, keywords: List[str], tokenizer, input_ids):
        self.keywords = keywords
        self.keyword_ids = []
        self.max_keyword_len = 0
        self.tokenizer = tokenizer
        self.start_len = input_ids.shape[1] if hasattr(input_ids, "shape") else len(input_ids)
        if tokenizer is not None and torch is not None:
            for keyword in keywords:
                cur_keyword_ids = tokenizer(keyword).input_ids
                bos_id = getattr(tokenizer, "bos_token_id", None)
                if len(cur_keyword_ids) > 1 and cur_keyword_ids[0] == bos_id:
                    cur_keyword_ids = cur_keyword_ids[1:]
                if len(cur_keyword_ids) > self.max_keyword_len:
                    self.max_keyword_len = len(cur_keyword_ids)
                self.keyword_ids.append(torch.tensor(cur_keyword_ids))

    def __call__(self, output_ids, scores=None, **kwargs) -> bool:
        if self.tokenizer is None or torch is None:
            return False
        offset = min(output_ids.shape[1] - self.start_len, self.max_keyword_len)
        self.keyword_ids = [k.to(output_ids.device) for k in self.keyword_ids]
        for keyword_id in self.keyword_ids:
            if (output_ids[0, -keyword_id.shape[0]:] == keyword_id).all():
                return True
        outputs = self.tokenizer.batch_decode(output_ids[:, -offset:], skip_special_tokens=True)[0]
        for keyword in self.keywords:
            if keyword in outputs:
                return True
        return False


def _find_official_load_pretrained_model():
    """Attempts to locate and import official GeoChat repository loader."""
    try:
        from geochat.model.builder import load_pretrained_model
        return load_pretrained_model
    except ImportError:
        pass

    candidate_paths = [
        os.getenv("GEOCHAT_REPO_PATH"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "GeoChat"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "GeoChat"),
        "/content/GeoChat",
        "/workspace/GeoChat",
    ]
    for path in candidate_paths:
        if path and os.path.exists(path) and path not in sys.path:
            sys.path.insert(0, path)
            try:
                from geochat.model.builder import load_pretrained_model
                return load_pretrained_model
            except ImportError:
                continue

    return None


def _get_model_name(model_path: str) -> str:
    """Extracts model name per GeoChat convention."""
    try:
        from geochat.mm_utils import get_model_name_from_path
        return get_model_name_from_path(model_path)
    except ImportError:
        clean = model_path.strip("/")
        parts = clean.split("/")
        if parts[-1].startswith("checkpoint-"):
            return parts[-2] + "_" + parts[-1]
        return parts[-1]


class GeoChatRuntime:
    """
    Manages hardware inspection, model lifecycle, vision pipeline, inference mutex,
    and official multimodal execution for GeoChat-7B.
    """
    def __init__(self, model_id: str = "MBZUAI/geochat-7B", load_mode: str = "4bit"):
        self.model_id = model_id
        self.load_mode = load_mode
        self.model = None
        self.tokenizer = None
        self.image_processor = None
        self.vision_tower = None
        self.context_len = 2048
        self.model_loaded = False
        self.load_error: Optional[str] = None
        self.inference_lock = threading.Lock()
        self._inspect_hardware()

    def _inspect_hardware(self):
        """Inspects CUDA availability and hardware capabilities."""
        if not TORCH_AVAILABLE:
            self.cuda_available = False
            self.gpu_name = "None (PyTorch not installed)"
            self.total_vram_gb = 0.0
            self.available_vram_gb = 0.0
            self.device_type = "cpu"
            return

        self.cuda_available = torch.cuda.is_available()
        if self.cuda_available:
            self.device_type = "cuda"
            self.gpu_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            self.total_vram_gb = round(props.total_memory / (1024 ** 3), 2)
            free_mem, _ = torch.cuda.mem_get_info()
            self.available_vram_gb = round(free_mem / (1024 ** 3), 2)
        else:
            self.device_type = "cpu"
            self.gpu_name = "None (No CUDA device found)"
            self.total_vram_gb = 0.0
            self.available_vram_gb = 0.0

    def is_multimodally_ready(self) -> bool:
        """
        Validates that ALL components of the multimodal pipeline are initialized:
        1. model loaded
        2. tokenizer loaded
        3. image_processor loaded
        4. vision_tower loaded and active
        """
        if not self.model_loaded or self.model is None or self.tokenizer is None:
            return False
        if self.image_processor is None:
            return False
        if self.vision_tower is None:
            return False
        if hasattr(self.vision_tower, "is_loaded") and not getattr(self.vision_tower, "is_loaded", False):
            return False
        return True

    def get_health_status(self) -> Dict[str, Any]:
        """Returns diagnostic information about the worker process, hardware, and multimodal pipeline."""
        self._inspect_hardware()
        is_ready = self.is_multimodally_ready()
        return {
            "status": "online",
            "cuda_available": self.cuda_available,
            "gpu_name": self.gpu_name,
            "total_vram_gb": self.total_vram_gb,
            "available_vram_gb": self.available_vram_gb,
            "model_loaded": is_ready,
            "model_id": self.model_id,
            "device": self.device_type,
            "load_mode": self.load_mode,
            "vision_tower_loaded": getattr(self.vision_tower, "is_loaded", False) if self.vision_tower else False,
            "image_processor_loaded": self.image_processor is not None,
            "message": (
                "GeoChat-7B multimodal pipeline ready for inference."
                if is_ready
                else (
                    "CUDA available on host. Call /v1/load-model to initialize multimodal pipeline."
                    if self.cuda_available
                    else "Host environment lacks NVIDIA CUDA GPU. GeoChat-7B requires >=15GB VRAM (e.g. Tesla T4)."
                )
            ),
            "load_error": self.load_error
        }

    def get_readiness_status(self) -> Dict[str, Any]:
        """
        Returns strict readiness assessment distinguishing process alive from fully operational multimodal model.
        Possible readinessState values:
          - RUNNABLE: Multimodal model, vision tower, and image processor are loaded and runnable on GPU
          - GPU_UNAVAILABLE: Host lacks NVIDIA CUDA device
          - MODEL_UNAVAILABLE: CUDA is present but weights are not loaded
          - MODEL_NOT_LOADABLE: Loading was attempted and failed
        """
        self._inspect_hardware()
        is_ready = self.is_multimodally_ready()

        if is_ready:
            state = "RUNNABLE"
            msg = "GeoChat-7B multimodal model, vision tower, and image processor are loaded in memory and runnable on GPU."
        elif not self.cuda_available:
            state = "GPU_UNAVAILABLE"
            msg = "Host environment lacks NVIDIA CUDA GPU. Inference is blocked."
        elif self.load_error:
            state = "MODEL_NOT_LOADABLE"
            msg = f"Failed to load {self.model_id}: {self.load_error}"
        elif self.model_loaded and not is_ready:
            state = "MODEL_NOT_LOADABLE"
            msg = "Model was loaded but vision tower or image processor is uninitialized."
        else:
            state = "MODEL_UNAVAILABLE"
            msg = "CUDA is available but model weights are not loaded into memory."

        return {
            "readinessState": state,
            "isReady": is_ready,
            "model_id": self.model_id,
            "checkpoint": self.model_id,
            "device": self.device_type,
            "gpu_name": self.gpu_name,
            "cuda_available": self.cuda_available,
            "total_vram_gb": self.total_vram_gb,
            "available_vram_gb": self.available_vram_gb,
            "vision_tower_loaded": getattr(self.vision_tower, "is_loaded", False) if self.vision_tower else False,
            "image_processor_loaded": self.image_processor is not None,
            "message": msg,
            "load_error": self.load_error
        }

    def load_model(self) -> Tuple[bool, str]:
        """
        Loads GeoChat-7B using the official repository model builder.
        Correctly initializes:
          1. LLaMA SentencePiece tokenizer
          2. GeoChat custom causal LM architecture with mm_projector
          3. Vision tower (openai/clip-vit-large-patch14-336 interpolated to 504x504)
          4. CLIP image processor
        """
        if self.is_multimodally_ready():
            return True, "GeoChat-7B multimodal model already loaded and ready."

        self._inspect_hardware()
        if not self.cuda_available:
            msg = (
                f"Cannot load {self.model_id}: CUDA is not available on this host ({self.gpu_name}). "
                "GeoChat-7B requires an NVIDIA GPU with at least 15 GB VRAM (such as a Google Colab Tesla T4)."
            )
            self.load_error = msg
            return False, msg

        try:
            load_pretrained = _find_official_load_pretrained_model()
            if load_pretrained is None:
                msg = (
                    "Official GeoChat repository not found in Python path. "
                    "Please clone https://github.com/mbzuai-oryx/GeoChat and install via 'pip install -e .'"
                )
                self.load_error = msg
                return False, msg

            model_name = _get_model_name(self.model_id)
            print(f"[GeoChat Worker] Loading {self.model_id} via official builder in {self.load_mode} mode on {self.gpu_name}...")

            tokenizer, model, image_processor, context_len = load_pretrained(
                model_path=self.model_id,
                model_base=None,
                model_name=model_name,
                load_8bit=(self.load_mode == "8bit"),
                load_4bit=(self.load_mode == "4bit"),
                device_map="auto",
                device="cuda"
            )

            self.tokenizer = tokenizer
            self.model = model
            self.image_processor = image_processor
            self.context_len = context_len
            self.vision_tower = model.get_vision_tower() if hasattr(model, "get_vision_tower") else None

            # Verify vision tower and processor are genuinely initialized
            if self.vision_tower is None or not getattr(self.vision_tower, "is_loaded", False):
                raise RuntimeError("Vision tower failed to initialize or load weights.")
            if self.image_processor is None:
                raise RuntimeError("Image processor failed to initialize.")

            self.model_loaded = True
            self.load_error = None
            return True, "GeoChat-7B multimodal model, vision tower, and processor loaded successfully."

        except Exception as e:
            self.model_loaded = False
            self.model = None
            self.tokenizer = None
            self.image_processor = None
            self.vision_tower = None
            self.load_error = str(e)
            return False, f"Failed to load {self.model_id}: {str(e)}"

    def preprocess_image(self, pil_image: Image.Image) -> "torch.Tensor":
        """
        Official GeoChat image preprocessing pipeline:
        1. RGB conversion
        2. Bounded dimensions check (max 2048x2048)
        3. expand2square: pads to square with CLIP channel mean background
        4. image_processor: preprocesses with crop_size=(504, 504), size=(504)
        Returns image tensor of shape [1, 3, 504, 504].
        """
        if self.image_processor is None:
            raise RuntimeError("Image processor is not initialized.")

        image = pil_image.convert("RGB")
        if image.width > 2048 or image.height > 2048:
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)

        mean = getattr(self.image_processor, "image_mean", (0.48145466, 0.4578275, 0.40821073))
        bg_color = tuple(int(x * 255) for x in mean)
        image_padded = expand2square(image, bg_color)

        processed = self.image_processor.preprocess(
            image_padded,
            crop_size={"height": 504, "width": 504},
            size={"shortest_edge": 504},
            return_tensors="pt"
        )
        pixel_values = processed["pixel_values"]
        if pixel_values.ndim == 3:
            pixel_values = pixel_values.unsqueeze(0)
        return pixel_values

    def _validate_common_inputs(self, payload: Dict[str, Any], expected_task: str) -> Tuple[Optional[int], Optional[Dict[str, Any]], str, Dict[str, Any]]:
        """Shared request validation for task, image, modality, size, and request ID."""
        request_id = str(payload.get("requestId") or payload.get("request_id") or f"req_{int(time.time()*1000)}")

        task = payload.get("task")
        if task != expected_task:
            return 400, {
                "error": f"Invalid task '{task}'. Expected '{expected_task}'.",
                "valid": False,
                "requestId": request_id
            }, request_id, {}

        image_obj = payload.get("image")
        if not image_obj or not isinstance(image_obj, dict):
            return 400, {
                "error": "Missing image object. Expected an object containing 'name', 'mimeType', and image data.",
                "valid": False,
                "requestId": request_id
            }, request_id, {}

        # Modality check: strictly reject SAR
        modality = str(image_obj.get("modality", "")).upper()
        if modality == "SAR":
            return 400, {
                "error": "UNSUPPORTED_MODALITY: SAR imagery is not supported by GeoChat-7B optical VLM pipeline.",
                "code": "UNSUPPORTED_MODALITY",
                "valid": False,
                "requestId": request_id
            }, request_id, {}

        data_uri = image_obj.get("dataUri") or image_obj.get("data_uri")
        img_path = image_obj.get("path")
        if not data_uri and not img_path:
            return 400, {
                "error": "Invalid image: Neither 'dataUri' nor 'path' was provided.",
                "valid": False,
                "requestId": request_id
            }, request_id, {}

        # Payload bounds check
        if data_uri and len(data_uri) > MAX_PAYLOAD_BASE64_LENGTH:
            return 413, {
                "error": "Payload Too Large: image data exceeds maximum allowable 25MB limit.",
                "code": "PAYLOAD_TOO_LARGE",
                "valid": False,
                "requestId": request_id
            }, request_id, {}

        return None, None, request_id, image_obj

    def process_vqa_request(self, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        """
        Validates request and generates genuine image-conditioned VQA response from GeoChat-7B.
        Returns (HTTP_STATUS_CODE, RESPONSE_DATA).
        """
        err_status, err_resp, request_id, image_obj = self._validate_common_inputs(payload, "vqa")
        if err_status is not None:
            return err_status, err_resp

        question = payload.get("question")
        if not question or not isinstance(question, str) or len(question.strip()) == 0:
            return 400, {
                "error": "Missing or empty question. A non-empty natural-language query is required.",
                "valid": False,
                "requestId": request_id
            }

        if not self.is_multimodally_ready():
            readiness = self.get_readiness_status()
            return 503, {
                "error": "GeoChat-7B model not loaded",
                "code": readiness["readinessState"],
                "readinessState": readiness["readinessState"],
                "detail": (
                    "Host environment lacks NVIDIA CUDA GPU. Inference is blocked on non-CUDA environments."
                    if not self.cuda_available
                    else "GeoChat-7B model is not loaded in memory. Run /v1/load-model on CUDA worker."
                ),
                "cuda_available": self.cuda_available,
                "hardware": self.gpu_name,
                "required": "NVIDIA Tesla T4 (>=15 GB VRAM) with 4-bit NF4 quantization",
                "model_id": self.model_id,
                "requestId": request_id
            }

        with self.inference_lock:
            start_time = time.time()
            try:
                data_uri = image_obj.get("dataUri") or image_obj.get("data_uri")
                img_path = image_obj.get("path")

                # SECURITY PHASE 6: only inline base64 data URIs are
                # accepted. Remote URLs are rejected (SSRF) and filesystem
                # paths are rejected (path traversal).
                if data_uri and (data_uri.startswith("http://") or data_uri.startswith("https://")):
                    return 400, {"error": "Remote image URLs are not accepted. Supply an inline base64 data URI.", "requestId": request_id}
                if data_uri and "," in data_uri:
                    _, base64_data = data_uri.split(",", 1)
                    img_bytes = base64.b64decode(base64_data)
                    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                elif data_uri:
                    img_bytes = base64.b64decode(data_uri)
                    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                elif img_path:
                    return 400, {"error": "Filesystem image paths are not accepted. Supply an inline base64 data URI.", "requestId": request_id}
                else:
                    return 400, {"error": "Failed to load image from provided URI or path.", "requestId": request_id}

                # 1. Preprocess image to official [1, 3, 504, 504] tensor
                image_tensor = self.preprocess_image(pil_image)

                # 2. Structure prompt using official llava_v1 conversation template
                conv = get_conv_template("llava_v1")
                qs = f"{DEFAULT_IMAGE_TOKEN}\n{question.strip()}"
                conv.append_message(conv.roles[0], qs)
                conv.append_message(conv.roles[1], None)
                prompt = conv.get_prompt()

                # 3. Tokenize with IMAGE_TOKEN_INDEX (-200) injection
                input_ids = tokenizer_image_token(
                    prompt,
                    self.tokenizer,
                    IMAGE_TOKEN_INDEX,
                    return_tensors="pt"
                ).unsqueeze(0).to(self.device_type)

                # 4. Stopping criteria
                stop_str = conv.sep if conv.sep_style != SeparatorStyle.TWO else conv.sep2
                stopping_criteria = KeywordsStoppingCriteria([stop_str], self.tokenizer, input_ids)

                # 5. Multimodal generation passing BOTH input_ids AND images tensor
                with torch.inference_mode():
                    output_ids = self.model.generate(
                        input_ids=input_ids,
                        images=image_tensor.half().to(self.device_type),
                        max_new_tokens=payload.get("parameters", {}).get("maxNewTokens", 512),
                        temperature=payload.get("parameters", {}).get("temperature", 0.2),
                        do_sample=False,
                        stopping_criteria=[stopping_criteria],
                        use_cache=True
                    )

                # 6. Decode and strip stop string
                input_token_len = input_ids.shape[1]
                answer = self.tokenizer.decode(output_ids[0][input_token_len:], skip_special_tokens=True).strip()
                if answer.endswith(stop_str):
                    answer = answer[:-len(stop_str)].strip()

                duration_ms = int((time.time() - start_time) * 1000)

                return 200, {
                    "answerText": answer,
                    "modelName": self.model_id,
                    "checkpoint": self.model_id,
                    "device": self.device_type,
                    "durationMs": duration_ms,
                    "provenance": "MODEL_GENERATED",
                    "validationState": "validated",
                    "requestId": request_id
                }

            except Exception as e:
                if TORCH_AVAILABLE and isinstance(e, getattr(torch.cuda, "OutOfMemoryError", type(None))):
                    torch.cuda.empty_cache()
                    return 503, {
                        "error": "GPU Out of Memory during GeoChat-7B forward pass.",
                        "code": "GPU_OOM",
                        "modelName": self.model_id,
                        "requestId": request_id
                    }
                return 500, {
                    "error": f"GeoChat-7B inference execution failed: {str(e)}",
                    "modelName": self.model_id,
                    "requestId": request_id
                }

    def process_caption_request(self, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        """
        Validates request and generates genuine image-conditioned scene description from GeoChat-7B.
        Returns (HTTP_STATUS_CODE, RESPONSE_DATA).
        """
        err_status, err_resp, request_id, image_obj = self._validate_common_inputs(payload, "caption")
        if err_status is not None:
            return err_status, err_resp

        if not self.is_multimodally_ready():
            readiness = self.get_readiness_status()
            return 503, {
                "error": "GeoChat-7B model not loaded",
                "code": readiness["readinessState"],
                "readinessState": readiness["readinessState"],
                "detail": (
                    "Host environment lacks NVIDIA CUDA GPU. Inference is blocked on non-CUDA environments."
                    if not self.cuda_available
                    else "GeoChat-7B model is not loaded in memory. Run /v1/load-model on CUDA worker."
                ),
                "cuda_available": self.cuda_available,
                "hardware": self.gpu_name,
                "required": "NVIDIA Tesla T4 (>=15 GB VRAM) with 4-bit NF4 quantization",
                "model_id": self.model_id,
                "requestId": request_id
            }

        with self.inference_lock:
            start_time = time.time()
            try:
                data_uri = image_obj.get("dataUri") or image_obj.get("data_uri")
                img_path = image_obj.get("path")

                # SECURITY PHASE 6: only inline base64 data URIs are
                # accepted. Remote URLs are rejected (SSRF) and filesystem
                # paths are rejected (path traversal).
                if data_uri and (data_uri.startswith("http://") or data_uri.startswith("https://")):
                    return 400, {"error": "Remote image URLs are not accepted. Supply an inline base64 data URI.", "requestId": request_id}
                if data_uri and "," in data_uri:
                    _, base64_data = data_uri.split(",", 1)
                    img_bytes = base64.b64decode(base64_data)
                    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                elif data_uri:
                    img_bytes = base64.b64decode(data_uri)
                    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                elif img_path:
                    return 400, {"error": "Filesystem image paths are not accepted. Supply an inline base64 data URI.", "requestId": request_id}
                else:
                    return 400, {"error": "Failed to load image from provided URI or path.", "requestId": request_id}

                # 1. Preprocess image to official [1, 3, 504, 504] tensor
                image_tensor = self.preprocess_image(pil_image)

                custom_prompt = payload.get("prompt")
                caption_prompt = (
                    custom_prompt.strip()
                    if (custom_prompt and isinstance(custom_prompt, str) and len(custom_prompt.strip()) > 0)
                    else "Describe this satellite scene in detail."
                )

                # 2. Structure prompt using official llava_v1 conversation template
                conv = get_conv_template("llava_v1")
                qs = f"{DEFAULT_IMAGE_TOKEN}\n{caption_prompt}"
                conv.append_message(conv.roles[0], qs)
                conv.append_message(conv.roles[1], None)
                prompt = conv.get_prompt()

                # 3. Tokenize with IMAGE_TOKEN_INDEX (-200) injection
                input_ids = tokenizer_image_token(
                    prompt,
                    self.tokenizer,
                    IMAGE_TOKEN_INDEX,
                    return_tensors="pt"
                ).unsqueeze(0).to(self.device_type)

                # 4. Stopping criteria
                stop_str = conv.sep if conv.sep_style != SeparatorStyle.TWO else conv.sep2
                stopping_criteria = KeywordsStoppingCriteria([stop_str], self.tokenizer, input_ids)

                # 5. Multimodal generation passing BOTH input_ids AND images tensor
                with torch.inference_mode():
                    output_ids = self.model.generate(
                        input_ids=input_ids,
                        images=image_tensor.half().to(self.device_type),
                        max_new_tokens=payload.get("parameters", {}).get("maxNewTokens", 512),
                        temperature=payload.get("parameters", {}).get("temperature", 0.2),
                        do_sample=False,
                        stopping_criteria=[stopping_criteria],
                        use_cache=True
                    )

                # 6. Decode and strip stop string
                input_token_len = input_ids.shape[1]
                raw_caption = self.tokenizer.decode(output_ids[0][input_token_len:], skip_special_tokens=True).strip()
                if raw_caption.endswith(stop_str):
                    raw_caption = raw_caption[:-len(stop_str)].strip()

                # 7. Post-process: remove GeoChat grounding/control tokens
                #    rawCaption is preserved for provenance/debugging.
                clean_caption = clean_geochat_caption(raw_caption)

                if not clean_caption:
                    # Model output consisted solely of grounding tokens — fail truthfully.
                    return 500, {
                        "error": (
                            "Caption post-processing produced an empty result: "
                            "model output contained only grounding/control tokens with no natural-language text."
                        ),
                        "code": "EMPTY_CAPTION_AFTER_CLEANUP",
                        "rawCaption": raw_caption,
                        "modelName": self.model_id,
                        "requestId": request_id
                    }

                duration_ms = int((time.time() - start_time) * 1000)

                return 200, {
                    "caption": clean_caption,
                    "rawCaption": raw_caption,
                    "modelName": self.model_id,
                    "checkpoint": self.model_id,
                    "device": self.device_type,
                    "durationMs": duration_ms,
                    "provenance": "MODEL_GENERATED",
                    "validationState": "validated",
                    "requestId": request_id
                }

            except Exception as e:
                if TORCH_AVAILABLE and isinstance(e, getattr(torch.cuda, "OutOfMemoryError", type(None))):
                    torch.cuda.empty_cache()
                    return 503, {
                        "error": "GPU Out of Memory during GeoChat-7B forward pass.",
                        "code": "GPU_OOM",
                        "modelName": self.model_id,
                        "requestId": request_id
                    }
                return 500, {
                    "error": f"GeoChat-7B caption inference failed: {str(e)}",
                    "modelName": self.model_id,
                    "requestId": request_id
                }


class WorkerRequestHandler(BaseHTTPRequestHandler):
    """Authenticated HTTP Request handler for GeoChat Worker API."""
    runtime: GeoChatRuntime = None

    def _check_auth(self) -> bool:
        """Enforces shared token authentication on worker requests."""
        expected_key = os.getenv("GEOCHAT_AUTH_KEY", "satquery-geochat-worker-secret")
        if not expected_key:
            return True

        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if token == expected_key:
                return True

        worker_key = self.headers.get("X-Worker-Auth-Key", "")
        if worker_key == expected_key:
            return True

        return False

    def _set_headers(self, status: int = 200, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Worker-Auth-Key")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        if self.path in ("/health", "/v1/health"):
            data = self.runtime.get_health_status()
            self._set_headers(200)
            self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))
        elif self.path in ("/readiness", "/v1/readiness"):
            data = self.runtime.get_readiness_status()
            self._set_headers(200)
            self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": f"Not found: {self.path}"}).encode("utf-8"))

    def do_POST(self):
        if not self._check_auth():
            self._set_headers(401)
            self.wfile.write(json.dumps({
                "error": "Unauthorized: Invalid or missing worker authentication token.",
                "code": "UNAUTHORIZED"
            }).encode("utf-8"))
            return

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            payload = json.loads(post_data.decode("utf-8")) if post_data else {}
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid JSON payload."}).encode("utf-8"))
            return

        if self.path == "/v1/vqa":
            status, response_data = self.runtime.process_vqa_request(payload)
            self._set_headers(status)
            self.wfile.write(json.dumps(response_data, indent=2).encode("utf-8"))
        elif self.path == "/v1/caption":
            status, response_data = self.runtime.process_caption_request(payload)
            self._set_headers(status)
            self.wfile.write(json.dumps(response_data, indent=2).encode("utf-8"))
        elif self.path == "/v1/load-model":
            success, message = self.runtime.load_model()
            status = 200 if success else 503
            self._set_headers(status)
            self.wfile.write(json.dumps({"success": success, "message": message}).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": f"Not found: {self.path}"}).encode("utf-8"))

    def log_message(self, format, *args):
        sys.stderr.write(f"[GeoChat Worker] {self.address_string()} - {format % args}\n")


def run_worker(host: str = "0.0.0.0", port: int = 8088, model_id: str = "MBZUAI/geochat-7B", load_mode: str = "4bit"):
    runtime = GeoChatRuntime(model_id=model_id, load_mode=load_mode)
    WorkerRequestHandler.runtime = runtime
    server = HTTPServer((host, port), WorkerRequestHandler)
    print("==================================================")
    print(" SatQuery AI - Phase 7 GeoChat-7B Worker Service")
    print(" SIH26167 | ISRO Space Technology")
    print(f" Listening on http://{host}:{port}")
    print(f" CUDA Available: {runtime.cuda_available}")
    print(f" Hardware: {runtime.gpu_name}")
    print(f" Model ID: {runtime.model_id}")
    print(f" Load Mode: {runtime.load_mode}")
    print(" Multimodal Pipeline: GeoChat expand2square + CLIP-504px + mm_projector")
    print(" Authentication: Enabled (GEOCHAT_AUTH_KEY)")
    print("==================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down GeoChat worker...")
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SatQuery AI GeoChat-7B Worker Service")
    parser.add_argument("--host", default="0.0.0.0", help="Binding host")
    parser.add_argument("--port", type=int, default=8088, help="Port to listen on")
    parser.add_argument("--model-id", default=os.getenv("GEOCHAT_MODEL_ID", "MBZUAI/geochat-7B"))
    parser.add_argument("--load-mode", default=os.getenv("GEOCHAT_LOAD_MODE", "4bit"))
    args = parser.parse_args()

    run_worker(host=args.host, port=args.port, model_id=args.model_id, load_mode=args.load_mode)
