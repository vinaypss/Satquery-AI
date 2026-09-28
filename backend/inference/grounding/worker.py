#!/usr/bin/env python3
"""
SatQuery AI - Phase 8 Grounding DINO Tiny Inference Worker
SIH26167 | ISRO Space Technology

Independent, authenticated Python worker service for Open-Vocabulary
Remote-Sensing Visual Grounding & Object Localization.

Official References:
- GitHub: https://github.com/IDEA-Research/GroundingDINO
- Checkpoint: IDEA-Research/grounding-dino-tiny (groundingdino_swint_ogc)

Exposes REST API endpoints:
  - GET  /health (or /v1/health)       -> Process health & hardware diagnostics
  - GET  /readiness (or /v1/readiness) -> Strict model readiness state
  - POST /v1/load-model                -> Explicit GPU weight & processor loader
  - POST /v1/grounding                 -> Authenticated visual grounding inference

Per SIH26167 & Phase 8 integrity guidelines:
- Model: IDEA-Research/grounding-dino-tiny with Swin-T backbone.
- Natural-image trained baseline evaluated with zero-shot transfer on overhead imagery.
- Evaluates hardware capabilities (GPU name, VRAM, CUDA).
- Enforces request authentication via shared secret token (GROUNDING_AUTH_KEY / GEOCHAT_AUTH_KEY).
- Uses threading inference lock for GPU concurrency safety.
- Strictly rejects unsupported modalities (e.g. SAR) with UNSUPPORTED_MODALITY.
- Formats text prompt with lowercase period-terminated syntax required by Grounding DINO.
- Preprocesses input image with RGB conversion and bounds check.
- Normalizes output bounding boxes to [0, 1] xyxy coordinates with strict geometry validation.
- Zero detections is a legitimate HTTP 200 result with detections: [].
- Never fabricates simulated bounding boxes, coordinates, or confidence scores.
- Truthfully reports unavailable/blocked state on non-CUDA hosts.
- Tags all successful model generations with provenance: MODEL_GENERATED.
"""

import os
import sys
import json
import time
import math
import re
import base64
import argparse
import threading
from io import BytesIO
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Tuple, Optional, List

# Optional PyTorch import with safe fallback
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    TORCH_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    PIL_AVAILABLE = False


# Maximum allowed base64 data length (approx 25MB binary payload)
MAX_PAYLOAD_BASE64_LENGTH = 35 * 1024 * 1024


class GroundingDINORuntime:
    """
    Manages hardware inspection, model lifecycle, inference mutex, and official
    Hugging Face Transformers execution for Grounding DINO Tiny.
    """
    def __init__(
        self,
        model_id: str = "IDEA-Research/grounding-dino-tiny",
        checkpoint: str = "groundingdino_swint_ogc"
    ):
        self.model_id = model_id
        self.checkpoint = checkpoint
        self.model = None
        self.processor = None
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

    def is_model_ready(self) -> bool:
        """Validates that both model and processor are initialized and loaded."""
        return bool(self.model_loaded and self.model is not None and self.processor is not None)

    def get_health_status(self) -> Dict[str, Any]:
        """Returns diagnostic information about the worker and hardware."""
        self._inspect_hardware()
        is_ready = self.is_model_ready()
        return {
            "status": "online",
            "cuda_available": self.cuda_available,
            "gpu_name": self.gpu_name,
            "total_vram_gb": self.total_vram_gb,
            "available_vram_gb": self.available_vram_gb,
            "model_loaded": is_ready,
            "model_id": self.model_id,
            "checkpoint": self.checkpoint,
            "device": self.device_type,
            "message": (
                f"Grounding DINO ({self.model_id}) ready for inference."
                if is_ready
                else (
                    "CUDA available on host. Call /v1/load-model to initialize."
                    if self.cuda_available
                    else "Host environment lacks NVIDIA CUDA GPU. Grounding DINO requires CUDA for practical inference."
                )
            ),
            "load_error": self.load_error
        }

    def get_readiness_status(self) -> Dict[str, Any]:
        """
        Returns strict readiness assessment distinguishing process alive from fully operational model.
        Possible readinessState values:
          - RUNNABLE: Grounding model and processor are loaded in memory and runnable on GPU
          - GPU_UNAVAILABLE: Host lacks NVIDIA CUDA device
          - MODEL_UNAVAILABLE: CUDA is present but weights are not loaded
          - MODEL_NOT_LOADABLE: Loading was attempted and failed
        """
        self._inspect_hardware()
        is_ready = self.is_model_ready()

        if is_ready:
            state = "RUNNABLE"
            msg = f"Grounding DINO ({self.model_id}) model and processor are loaded in memory and runnable on {self.device_type}."
        elif not self.cuda_available:
            state = "GPU_UNAVAILABLE"
            msg = "Host environment lacks NVIDIA CUDA GPU. Grounding DINO inference is blocked on non-CUDA environments."
        elif self.load_error:
            state = "MODEL_NOT_LOADABLE"
            msg = f"Failed to load {self.model_id}: {self.load_error}"
        else:
            state = "MODEL_UNAVAILABLE"
            msg = "CUDA is available on host but model weights are not loaded into memory. Call /v1/load-model to initialize."

        return {
            "readinessState": state,
            "isReady": is_ready,
            "model_id": self.model_id,
            "checkpoint": self.checkpoint,
            "device": self.device_type,
            "gpu_name": self.gpu_name,
            "cuda_available": self.cuda_available,
            "total_vram_gb": self.total_vram_gb,
            "available_vram_gb": self.available_vram_gb,
            "message": msg,
            "load_error": self.load_error
        }

    def load_model(self) -> Tuple[bool, str]:
        """
        Loads Grounding DINO Tiny weights and processor via Hugging Face Transformers.
        Must only run on CUDA-capable hardware (or CPU for testing).
        """
        if self.is_model_ready():
            return True, f"Grounding DINO ({self.model_id}) already loaded and ready on {self.device_type}."

        self._inspect_hardware()
        if not self.cuda_available:
            msg = (
                f"Cannot load {self.model_id}: CUDA is not available on this host ({self.gpu_name}). "
                "Grounding DINO requires an NVIDIA GPU with CUDA support (e.g. Tesla T4)."
            )
            self.load_error = msg
            return False, msg

        try:
            from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
            print(f"[Grounding Worker] Loading {self.model_id} on {self.gpu_name} ({self.device_type})...")
            self.processor = AutoProcessor.from_pretrained(self.model_id)
            self.model = AutoModelForZeroShotObjectDetection.from_pretrained(self.model_id).to(self.device_type)
            self.model_loaded = True
            self.load_error = None
            return True, f"Grounding DINO ({self.model_id}) loaded successfully on {self.device_type}."
        except Exception as e:
            self.model_loaded = False
            self.model = None
            self.processor = None
            self.load_error = str(e)
            return False, f"Failed to load {self.model_id}: {str(e)}"

    def format_target_query(self, target: str) -> str:
        """
        Formats text target query to comply with Grounding DINO expectations:
        - Lowercase
        - Strip common conversational verbs
        - Terminate with a period ('.')
        """
        clean = (target or "").strip().lower()
        clean = re.sub(r'^(locate|find|where\s+is|where\s+are|show\s+me|pinpoint|detect)\s+(the\s+)?', '', clean)
        clean = clean.rstrip('?.!').strip()
        if not clean:
            clean = (target or "").strip().lower()
        if not clean.endswith('.'):
            clean += '.'
        return clean

    def process_grounding_request(self, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        """
        Validates request and generates genuine bounding box detections from Grounding DINO.
        Returns (HTTP_STATUS_CODE, RESPONSE_DATA).
        """
        request_id = str(payload.get("requestId") or payload.get("request_id") or f"grd_req_{int(time.time() * 1000)}")

        # 1. Validate task
        task = payload.get("task")
        if task != "grounding":
            return 400, {
                "error": f"Invalid task '{task}'. Expected 'grounding'.",
                "valid": False,
                "requestId": request_id
            }

        # 2. Validate target query
        target = payload.get("target")
        if not target or not isinstance(target, str) or len(target.strip()) == 0:
            return 400, {
                "error": "Missing or empty target query. A non-empty natural-language target is required.",
                "valid": False,
                "requestId": request_id
            }

        # 3. Validate image object
        image_obj = payload.get("image")
        if not image_obj or not isinstance(image_obj, dict):
            return 400, {
                "error": "Missing image object. Expected an object containing 'name', 'mimeType', and image data.",
                "valid": False,
                "requestId": request_id
            }

        # Modality check: strictly reject SAR inside worker
        modality = str(image_obj.get("modality", "")).upper()
        if modality == "SAR":
            return 400, {
                "error": "UNSUPPORTED_MODALITY: SAR imagery is not supported by Grounding DINO optical grounding pipeline.",
                "code": "UNSUPPORTED_MODALITY",
                "valid": False,
                "requestId": request_id
            }

        data_uri = image_obj.get("dataUri") or image_obj.get("data_uri")
        img_path = image_obj.get("path")
        if not data_uri and not img_path:
            return 400, {
                "error": "Invalid image: Neither 'dataUri' nor 'path' was provided.",
                "valid": False,
                "requestId": request_id
            }

        # Payload bounds check
        if data_uri and len(data_uri) > MAX_PAYLOAD_BASE64_LENGTH:
            return 413, {
                "error": "Payload Too Large: image data exceeds maximum allowable 25MB limit.",
                "code": "PAYLOAD_TOO_LARGE",
                "valid": False,
                "requestId": request_id
            }

        # 4. Check model readiness
        if not self.is_model_ready():
            if self.cuda_available and self.load_error is None:
                self.load_model()

        if not self.is_model_ready():
            readiness = self.get_readiness_status()
            return 503, {
                "error": "Grounding DINO model not loaded",
                "code": readiness["readinessState"],
                "readinessState": readiness["readinessState"],
                "detail": (
                    "Host environment lacks NVIDIA CUDA GPU. Inference is blocked on non-CUDA environments."
                    if not self.cuda_available
                    else "Grounding DINO model is not loaded in memory. Call /v1/load-model on CUDA worker."
                ),
                "cuda_available": self.cuda_available,
                "hardware": self.gpu_name,
                "required": "NVIDIA GPU with CUDA support (>=6 GB VRAM, e.g. Tesla T4)",
                "model_id": self.model_id,
                "requestId": request_id,
                "model_loaded": False
            }

        # 5. Real Model Inference Execution (Thread-Safe Mutex)
        with self.inference_lock:
            start_time = time.time()
            try:
                # Decode image (inline base64 only).
                # SECURITY PHASE 6: remote URLs are rejected (SSRF) and
                # filesystem paths are rejected (path traversal). Only
                # inline base64 data URIs are accepted as image carriers.
                if data_uri and (data_uri.startswith("http://") or data_uri.startswith("https://")):
                    return 400, {
                        "error": "Remote image URLs are not accepted. Supply an inline base64 data URI.",
                        "valid": False,
                        "requestId": request_id
                    }
                if data_uri and "," in data_uri:
                    _, b64data = data_uri.split(",", 1)
                    img_bytes = base64.b64decode(b64data)
                    raw_image = Image.open(BytesIO(img_bytes)).convert("RGB")
                elif data_uri:
                    img_bytes = base64.b64decode(data_uri)
                    raw_image = Image.open(BytesIO(img_bytes)).convert("RGB")
                elif img_path:
                    return 400, {
                        "error": "Filesystem image paths are not accepted. Supply an inline base64 data URI.",
                        "valid": False,
                        "requestId": request_id
                    }
                else:
                    return 400, {
                        "error": "Image path does not exist on worker host.",
                        "valid": False,
                        "requestId": request_id
                    }

                width, height = raw_image.size
                if width <= 0 or height <= 0:
                    return 400, {
                        "error": "Invalid image dimensions.",
                        "valid": False,
                        "requestId": request_id
                    }

                # Bounded dimension check (max 2048x2048 to prevent memory exhaustion)
                if width > 2048 or height > 2048:
                    raw_image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                    width, height = raw_image.size

                # Format query
                formatted_target = self.format_target_query(target)

                # Threshold parameters
                params = payload.get("parameters", {})
                box_threshold = float(params.get("boxThreshold", 0.35))
                text_threshold = float(params.get("textThreshold", 0.25))

                # Prepare processor inputs
                inputs = self.processor(
                    images=raw_image,
                    text=formatted_target,
                    return_tensors="pt"
                )
                if hasattr(inputs, "to"):
                    inputs = inputs.to(self.device_type)

                input_ids = inputs.get("input_ids") if isinstance(inputs, dict) else getattr(inputs, "input_ids", None)

                if isinstance(inputs, dict):
                    if torch is not None:
                        with torch.no_grad():
                            outputs = self.model(**inputs)
                    else:
                        outputs = self.model(**inputs)
                else:
                    if torch is not None:
                        with torch.no_grad():
                            outputs = self.model(inputs)
                    else:
                        outputs = self.model(inputs)

                # Post-process detections into target sizes
                results = self.processor.post_process_grounded_object_detection(
                    outputs,
                    input_ids,
                    box_threshold=box_threshold,
                    text_threshold=text_threshold,
                    target_sizes=[(height, width)]
                )[0]

                detections: List[Dict[str, Any]] = []
                scores = results.get("scores", [])
                labels = results.get("labels", [])
                boxes = results.get("boxes", [])

                for score_tensor, label_str, box_tensor in zip(scores, labels, boxes):
                    score_val = float(score_tensor.item() if hasattr(score_tensor, "item") else score_tensor)

                    # Validate confidence is finite and between 0 and 1
                    if math.isnan(score_val) or math.isinf(score_val) or not (0.0 <= score_val <= 1.0):
                        continue

                    box_coords = box_tensor.tolist() if hasattr(box_tensor, "tolist") else list(box_tensor)
                    if len(box_coords) != 4:
                        continue

                    p_x1, p_y1, p_x2, p_y2 = float(box_coords[0]), float(box_coords[1]), float(box_coords[2]), float(box_coords[3])
                    if any(math.isnan(v) or math.isinf(v) for v in (p_x1, p_y1, p_x2, p_y2)):
                        continue

                    # Convert pixel coordinates to normalized [0, 1] xyxy
                    x_min = max(0.0, min(1.0, round(p_x1 / width, 4)))
                    y_min = max(0.0, min(1.0, round(p_y1 / height, 4)))
                    x_max = max(0.0, min(1.0, round(p_x2 / width, 4)))
                    y_max = max(0.0, min(1.0, round(p_y2 / height, 4)))

                    # Strict geometry validation: x_max > x_min and y_max > y_min
                    if x_max <= x_min or y_max <= y_min:
                        continue

                    # Label validation
                    clean_label = str(label_str).strip() if label_str else target.strip()
                    if not clean_label:
                        clean_label = target.strip()

                    detections.append({
                        "label": clean_label,
                        "confidence": round(score_val, 4),
                        "box": {
                            "xMin": x_min,
                            "yMin": y_min,
                            "xMax": x_max,
                            "yMax": y_max
                        }
                    })

                duration_ms = int((time.time() - start_time) * 1000)

                return 200, {
                    "task": "grounding",
                    "model": self.model_id,
                    "checkpoint": self.checkpoint,
                    "status": "success",
                    "provenance": "MODEL_GENERATED",
                    "coordinateFormat": "normalized_xyxy",
                    "imageDimensions": {
                        "width": width,
                        "height": height
                    },
                    "detections": detections,
                    "durationMs": duration_ms,
                    "device": self.device_type,
                    "requestId": request_id
                }

            except Exception as e:
                if TORCH_AVAILABLE and isinstance(e, getattr(torch.cuda, "OutOfMemoryError", type(None))):
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    return 503, {
                        "error": "GPU Out of Memory during Grounding DINO forward pass.",
                        "code": "GPU_OOM",
                        "model": self.model_id,
                        "requestId": request_id
                    }
                return 500, {
                    "error": f"Grounding inference failed: {str(e)}",
                    "valid": False,
                    "requestId": request_id
                }


class GroundingWorkerRequestHandler(BaseHTTPRequestHandler):
    """
    Authenticated HTTP Request handler for the Grounding DINO worker service.
    """
    runtime: GroundingDINORuntime = None

    def _check_auth(self) -> bool:
        """Enforces shared token authentication on worker requests."""
        expected_key = os.getenv("GROUNDING_AUTH_KEY") or os.getenv("GEOCHAT_AUTH_KEY", "satquery-grounding-worker-secret")
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

    def _send_json(self, status_code: int, data: Dict[str, Any]):
        response_bytes = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Worker-Auth-Key")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Worker-Auth-Key")
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/v1/health"):
            status = self.runtime.get_health_status()
            self._send_json(200, status)
        elif self.path in ("/readiness", "/v1/readiness"):
            readiness = self.runtime.get_readiness_status()
            self._send_json(200, readiness)
        else:
            self._send_json(404, {"error": f"Not found: {self.path}"})

    def do_POST(self):
        if not self._check_auth():
            self._send_json(401, {
                "error": "Unauthorized: Invalid or missing worker authentication token.",
                "code": "UNAUTHORIZED"
            })
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload in request body."})
            return

        if self.path == "/v1/load-model":
            success, msg = self.runtime.load_model()
            status_code = 200 if success else 503
            self._send_json(status_code, {
                "success": success,
                "message": msg,
                "status": self.runtime.get_health_status()
            })
        elif self.path == "/v1/grounding":
            code, resp = self.runtime.process_grounding_request(payload)
            self._send_json(code, resp)
        else:
            self._send_json(404, {"error": f"Endpoint '{self.path}' not found."})

    def log_message(self, format, *args):
        """Suppress default verbose HTTP logging."""
        pass


def create_server(host: str = "127.0.0.1", port: int = 8002, model_id: str = "IDEA-Research/grounding-dino-tiny") -> HTTPServer:
    runtime = GroundingDINORuntime(model_id=model_id)
    GroundingWorkerRequestHandler.runtime = runtime
    server = HTTPServer((host, port), GroundingWorkerRequestHandler)
    return server


def run_worker():
    parser = argparse.ArgumentParser(description="SatQuery AI Grounding DINO Tiny Worker")
    parser.add_argument("--host", default=os.getenv("GROUNDING_WORKER_HOST", "0.0.0.0"), help="Bind host")
    parser.add_argument("--port", type=int, default=int(os.getenv("GROUNDING_WORKER_PORT", "8002")), help="Bind port")
    parser.add_argument("--model-id", default=os.getenv("GROUNDING_MODEL_ID", "IDEA-Research/grounding-dino-tiny"), help="Model identifier")
    args = parser.parse_args()

    runtime = GroundingDINORuntime(model_id=args.model_id)
    GroundingWorkerRequestHandler.runtime = runtime
    server = HTTPServer((args.host, args.port), GroundingWorkerRequestHandler)

    print("==================================================")
    print(" SatQuery AI - Phase 8 Grounding DINO Worker Service")
    print(" SIH26167 | ISRO Space Technology")
    print(f" Listening on http://{args.host}:{args.port}")
    print(f" CUDA Available: {runtime.cuda_available}")
    print(f" Hardware: {runtime.gpu_name}")
    print(f" Model ID: {runtime.model_id}")
    print(f" Checkpoint: {runtime.checkpoint}")
    print(" Architecture: Swin-T + Grounding DINO zero-shot detection")
    print(" Authentication: Enabled (GROUNDING_AUTH_KEY / GEOCHAT_AUTH_KEY)")
    print("==================================================")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Grounding Worker] Shutting down...")
        server.server_close()


if __name__ == "__main__":
    run_worker()
