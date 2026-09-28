#!/usr/bin/env python3
"""
SatQuery AI - Stage 6E Segmentation Specialist Worker
SIH26167 | ISRO Space Technology

Independent Python worker service for Remote-Sensing Semantic Segmentation.
Model: SegFormer-B0 (nvidia/segformer-b0-finetuned-ade-512-512)
Exposes endpoints:
  - GET /health, POST /health
  - GET /v1/readiness
  - POST /v1/load-model
  - POST /v1/segmentation

Truthful contract:
  - When on CUDA: runs genuine SegFormer forward pass, generates real pixel-level binary mask.
  - When on CPU or model not loaded: returns HTTP 503 (GPU_UNAVAILABLE / not loaded).
  - Strictly zero fabricated, simulated, or placeholder masks.
"""

import os
import sys
import json
import time
import base64
import argparse
import threading
from io import BytesIO
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Tuple, Optional, List

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

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    np = None
    NUMPY_AVAILABLE = False


class SegmentationRuntime:
    """Runtime model manager for the audit-aligned SegFormer-B0 baseline."""

    def __init__(
        self,
        model_id: str = 'nvidia/segformer-b0-finetuned-ade-512-512',
        checkpoint: str = 'nvidia/segformer-b0-finetuned-ade-512-512'
    ):
        self.model_id = model_id
        self.checkpoint = checkpoint
        self.model = None
        self.processor = None
        self.model_loaded = False
        self.model_state = 'unavailable'
        self.load_error: Optional[str] = None
        self.inference_lock = threading.Lock()
        self._inspect_hardware()

    def _inspect_hardware(self):
        if not TORCH_AVAILABLE:
            self.cuda_available = False
            self.gpu_name = 'None (PyTorch not installed)'
            self.total_vram_gb = 0.0
            self.available_vram_gb = 0.0
            self.device_type = 'cpu'
            return

        self.cuda_available = torch.cuda.is_available()
        if self.cuda_available:
            self.device_type = 'cuda'
            self.gpu_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            self.total_vram_gb = round(props.total_memory / (1024 ** 3), 2)
            try:
                free_mem, _ = torch.cuda.mem_get_info()
                self.available_vram_gb = round(free_mem / (1024 ** 3), 2)
            except Exception:
                self.available_vram_gb = self.total_vram_gb
        else:
            self.device_type = 'cpu'
            self.gpu_name = 'None (No CUDA device found)'
            self.total_vram_gb = 0.0
            self.available_vram_gb = 0.0

    def get_health_status(self) -> Dict[str, Any]:
        self._inspect_hardware()
        return {
            'status': 'online',
            'model_state': self.model_state,
            'model_loaded': self.model_loaded,
            'model_id': self.model_id,
            'checkpoint': self.checkpoint,
            'cuda_available': self.cuda_available,
            'gpu_name': self.gpu_name,
            'total_vram_gb': self.total_vram_gb,
            'available_vram_gb': self.available_vram_gb,
            'device': self.device_type,
            'message': (
                'Segmentation ready for inference.' if self.model_loaded else
                ('CUDA available. Call /v1/load-model to initialize.' if self.cuda_available else 'Host has no CUDA GPU; segmentation baseline is blocked.')
            ),
            'load_error': self.load_error
        }

    def load_model(self) -> Tuple[bool, str]:
        if self.model_loaded:
            return True, 'Model already loaded.'
        self.model_state = 'loading'
        self._inspect_hardware()
        if not self.cuda_available:
            self.model_state = 'unavailable'
            self.load_error = 'SegFormer-B0 general baseline requires CUDA/real GPU path; CPU-only host cannot load this model truthfully.'
            return False, self.load_error

        try:
            from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation
            self.processor = AutoImageProcessor.from_pretrained(self.checkpoint)
            self.model = AutoModelForSemanticSegmentation.from_pretrained(self.checkpoint)
            if self.cuda_available:
                self.model = self.model.to('cuda')
            self.model.eval()
            self.model_state = 'ready'
            self.model_loaded = True
            self.load_error = None
            return True, f'Successfully loaded {self.model_id} on {self.device_type} ({self.gpu_name}).'
        except Exception as exc:
            self.model_state = 'failed'
            self.load_error = str(exc)
            return False, f'Failed to load {self.model_id}: {exc}'

    def process_segmentation_request(self, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if not payload or not isinstance(payload, dict):
            return 400, {'error': 'Malformed request.', 'valid': False}

        task = payload.get('task')
        if task != 'segmentation':
            return 400, {'error': "Invalid task 'segmentation'. Expected 'segmentation'.", 'valid': False}

        image_obj = payload.get('image')
        if not image_obj or not isinstance(image_obj, dict):
            return 400, {'error': 'Missing image object. Expected an object containing image data.', 'valid': False}

        data_uri = image_obj.get('dataUri') or image_obj.get('data_uri')
        img_path = image_obj.get('path')
        if not data_uri and not img_path:
            return 400, {'error': "Invalid image: neither 'dataUri' nor 'path' was provided.", 'valid': False}

        target = payload.get('target')
        if not isinstance(target, str) or len(target.strip()) == 0:
            return 400, {'error': 'Missing or empty target. A non-empty target/class string is required.', 'valid': False}

        # Auto-load on CUDA if model not yet loaded
        if not self.model_loaded or self.model_state != 'ready':
            if self.cuda_available and self.load_error is None:
                self.load_model()

        if not self.model_loaded or self.model_state != 'ready':
            return 503, {
                'error': 'Segmentation model not loaded',
                'detail': (
                    'Truthful backend segmentation inference is unavailable in this environment.'
                    if not self.cuda_available else
                    'Segmentation model not loaded in memory. Call /v1/load-model on CUDA worker.'
                ),
                'model_loaded': False,
                'model_state': self.model_state,
                'cuda_available': self.cuda_available,
                'hardware': self.gpu_name,
                'required': 'NVIDIA CUDA GPU with a real segmentation implementation, or a loaded model path.',
                'valid': False
            }

        # Thread-safe genuine forward pass execution
        with self.inference_lock:
            start_time = time.time()
            try:
                # 1. Decode image (inline base64 only).
                # SECURITY PHASE 6: remote URLs are rejected (SSRF) and
                # filesystem paths are rejected (path traversal). Only
                # inline base64 data URIs are accepted as image carriers.
                if data_uri and (data_uri.startswith('http://') or data_uri.startswith('https://')):
                    return 400, {'error': 'Remote image URLs are not accepted. Supply an inline base64 data URI.', 'valid': False}
                if data_uri and ',' in data_uri:
                    _, b64data = data_uri.split(',', 1)
                    img_bytes = base64.b64decode(b64data)
                    raw_image = Image.open(BytesIO(img_bytes)).convert('RGB')
                elif data_uri:
                    img_bytes = base64.b64decode(data_uri)
                    raw_image = Image.open(BytesIO(img_bytes)).convert('RGB')
                elif img_path:
                    return 400, {'error': 'Filesystem image paths are not accepted. Supply an inline base64 data URI.', 'valid': False}
                else:
                    return 400, {'error': 'Image path does not exist on worker host.', 'valid': False}

                # 2. Genuine SegFormer forward pass
                inputs = self.processor(images=raw_image, return_tensors='pt')
                if self.cuda_available:
                    inputs = {k: v.to('cuda') for k, v in inputs.items()}
                with torch.no_grad():
                    outputs = self.model(**inputs)

                logits = outputs.logits
                upsampled_logits = torch.nn.functional.interpolate(
                    logits,
                    size=(raw_image.height, raw_image.width),
                    mode='bilinear',
                    align_corners=False
                )
                pred_seg = upsampled_logits.argmax(dim=1)[0].cpu().numpy()
                probs = torch.nn.functional.softmax(upsampled_logits, dim=1)[0].cpu().numpy()

                # 3. Match requested target to ADE20K 150 classes
                target_clean = target.strip().lower()
                id2label = getattr(self.model.config, 'id2label', {})
                matched_ids = []
                for idx_raw, label_str in id2label.items():
                    idx = int(idx_raw)
                    label_clean = str(label_str).strip().lower()
                    if target_clean == label_clean or target_clean in label_clean or label_clean in target_clean:
                        matched_ids.append(idx)

                if matched_ids and NUMPY_AVAILABLE:
                    binary_mask = (np.isin(pred_seg, matched_ids) * 255).astype(np.uint8)
                    matched_probs = probs[matched_ids, :, :].sum(axis=0)
                    if np.any(binary_mask):
                        conf = float(np.mean(matched_probs[binary_mask > 0]))
                    else:
                        conf = float(np.max(matched_probs))
                else:
                    binary_mask = np.zeros((raw_image.height, raw_image.width), dtype=np.uint8) if NUMPY_AVAILABLE else None
                    conf = 0.0

                # 4. Encode mask as base64 PNG
                if binary_mask is not None and PIL_AVAILABLE:
                    mask_pil = Image.fromarray(binary_mask, mode='L')
                    buf = BytesIO()
                    mask_pil.save(buf, format='PNG')
                    mask_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
                else:
                    mask_b64 = ''

                duration_ms = max(1, int((time.time() - start_time) * 1000))

                return 200, {
                    'task': 'segmentation',
                    'model': self.model_id,
                    'checkpoint': self.checkpoint,
                    'status': 'success',
                    'imageWidth': raw_image.width,
                    'imageHeight': raw_image.height,
                    'target': target,
                    'mask': {
                        'encoding': 'base64',
                        'width': raw_image.width,
                        'height': raw_image.height,
                        'data': mask_b64
                    },
                    'confidence': round(conf, 4),
                    'durationMs': duration_ms,
                    'device': self.device_type,
                    'provenance': 'MODEL_GENERATED'
                }
            except Exception as exc:
                return 500, {
                    'error': f'Segmentation inference failure: {exc}',
                    'task': 'segmentation',
                    'model': self.model_id,
                    'status': 'failed',
                    'valid': False
                }


runtime = SegmentationRuntime()


class SegmentationRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, obj: Dict[str, Any]) -> None:
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ('/health', '/v1/health'):
            self._send_json(200, runtime.get_health_status())
            return

        if self.path in ('/readiness', '/v1/readiness'):
            state = 'RUNNABLE' if runtime.model_loaded and runtime.model_state == 'ready' else (
                'GPU_UNAVAILABLE' if not runtime.cuda_available else 'MODEL_UNAVAILABLE'
            )
            self._send_json(200, {
                'status': 'online',
                'readinessState': state,
                'model_loaded': runtime.model_loaded,
                'cuda_available': runtime.cuda_available,
                'device': runtime.device_type
            })
            return

        self._send_json(404, {'error': 'Not found', 'valid': False})

    def do_POST(self):
        if self.path in ('/health', '/v1/health'):
            self._send_json(200, runtime.get_health_status())
            return

        if self.path in ('/load-model', '/v1/load-model'):
            ok, msg = runtime.load_model()
            status_code = 200 if ok else (503 if not runtime.cuda_available else 500)
            self._send_json(status_code, {
                'success': ok,
                'message': msg,
                'model_state': runtime.model_state,
                'model_id': runtime.model_id
            })
            return

        if self.path in ('/v1/segmentation', '/segmentation'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode('utf-8')) if raw else {}
            except Exception as exc:
                self._send_json(400, {'error': f'Malformed JSON request: {exc}', 'valid': False})
                return

            status, response = runtime.process_segmentation_request(payload)
            self._send_json(status, response)
            return

        self._send_json(404, {'error': 'Not found', 'valid': False})

    def log_message(self, fmt: str, *args) -> None:
        return


def create_server(host: str = '127.0.0.1', port: int = 8003):
    return HTTPServer((host, port), SegmentationRequestHandler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8003, type=int)
    args = parser.parse_args()
    server = create_server(args.host, args.port)
    print(f'Segmentation worker listening on http://{args.host}:{args.port}')
    server.serve_forever()
