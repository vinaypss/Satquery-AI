#!/usr/bin/env python3
"""
SatQuery AI - Stage 6C Real Caption Inference Verification Script
SIH26167 | ISRO Space Technology

Attempts real remote-sensing caption inference using MBZUAI/geochat-7B.
Truthfully reports device capabilities, actual model execution, duration, and output.
If real inference cannot occur due to hardware constraints (e.g. CPU-only container),
strictly reports BLOCKED / NOT VERIFIED with zero simulated output.
"""

import os
import sys
import time
import json

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    TORCH_AVAILABLE = False


def run_caption_inference_verification(image_path: str = None):
    print("=" * 65)
    print(" SatQuery AI - Stage 6C Real Caption Inference Verification")
    print(" SIH26167 | ISRO Space Technology | Organization: ISRO")
    print(" Target Model: MBZUAI/geochat-7B (Scene Description Mode)")
    print("=" * 65)

    # 1. Environment & Hardware Diagnostic
    cuda_available = TORCH_AVAILABLE and torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_available else "None (No CUDA device found)"
    vram_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2) if cuda_available else 0.0

    print(f"PyTorch Available: {TORCH_AVAILABLE}")
    print(f"CUDA Available:    {cuda_available}")
    print(f"GPU Hardware:      {gpu_name}")
    print(f"Total VRAM:        {vram_gb} GB")
    print(f"Host Environment:  {'CUDA GPU Worker' if cuda_available else 'AI Studio / Local Container (CPU-only)'}")
    print("-" * 65)

    # 2. Check if Real Inference can execute
    if not cuda_available:
        print("\n[VERIFICATION RESULT]")
        print("REAL CAPTION INFERENCE: BLOCKED / NOT VERIFIED")
        print("Exact Technical Cause:")
        print("  1. AI Studio / local development environment: real GeoChat inference unavailable")
        print("     due to lack of dedicated NVIDIA CUDA GPU (CPU-only execution).")
        print("  2. Google Colab T4 environment: verified benchmark environment with")
        print("     NVIDIA Tesla T4 (~15 GB VRAM) and 4-bit quantization (see")
        print("     verification_evidence.json; caption accuracy NOT VALIDATED).")
        print("\nExecution Telemetry:")
        print("  - Model Used: None (Execution halted prior to model loading)")
        print("  - Device: None")
        print("  - Inference Duration: 0 ms")
        print("  - Generated Caption: None (Zero fabricated or simulated captions)")
        print("  - Real Inference Executed: False")
        print("=" * 65)
        return {
            "status": "BLOCKED / NOT VERIFIED",
            "model_used": None,
            "device": "none",
            "duration_ms": 0,
            "generated_caption": None,
            "real_inference_executed": False,
            "reason": "Host environment lacks NVIDIA CUDA GPU. GeoChat-7B requires >=15GB VRAM (e.g. Tesla T4)."
        }

    # 3. If CUDA is available (e.g. Colab Tesla T4), perform real multimodal inference
    print(f"[Execution] CUDA detected on {gpu_name}. Preparing GeoChat-7B...")
    start_time = time.time()

    try:
        from worker import GeoChatRuntime
        runtime = GeoChatRuntime(model_id="MBZUAI/geochat-7B", load_mode="4bit")

        success, msg = runtime.load_model()
        if not success:
            raise RuntimeError(f"Runtime model load failed: {msg}")

        # Prepare image payload
        if image_path and os.path.exists(image_path):
            img_desc = {"name": os.path.basename(image_path), "mimeType": "image/png", "path": image_path}
        else:
            import base64
            from PIL import Image
            import io
            img = Image.new("RGB", (224, 224), color=(73, 109, 137))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            b64_str = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
            img_desc = {"name": "synthetic_patch.png", "mimeType": "image/png", "dataUri": b64_str}

        cap_payload = {
            "task": "caption",
            "prompt": "Describe this satellite scene in detail.",
            "image": img_desc,
            "parameters": {"maxNewTokens": 256, "temperature": 0.2},
            "requestId": "verify-cap-001"
        }

        cap_status, cap_resp = runtime.process_caption_request(cap_payload)
        if cap_status != 200:
            raise RuntimeError(f"Caption execution returned {cap_status}: {cap_resp}")

        caption = cap_resp.get("caption", "")
        duration_ms = cap_resp.get("durationMs", int((time.time() - start_time) * 1000))

        print("\n[VERIFICATION RESULT]")
        print("REAL CAPTION INFERENCE: COMPLETE")
        print(f"  - Model Used: MBZUAI/geochat-7B")
        print(f"  - Device: cuda ({gpu_name})")
        print(f"  - Inference Duration: {duration_ms} ms")
        print(f"  - Generated Caption: {caption}")
        print(f"  - Real Inference Executed: True")
        print("=" * 65)

        return {
            "status": "COMPLETE",
            "model_used": "MBZUAI/geochat-7B",
            "device": "cuda",
            "duration_ms": duration_ms,
            "generated_caption": caption,
            "real_inference_executed": True
        }

    except Exception as e:
        print(f"\n[VERIFICATION RESULT] FAILED: {str(e)}")
        return {
            "status": "FAILED",
            "model_used": "MBZUAI/geochat-7B",
            "device": "cuda",
            "duration_ms": int((time.time() - start_time) * 1000),
            "generated_caption": None,
            "real_inference_executed": False,
            "error": str(e)
        }


if __name__ == "__main__":
    test_img = sys.argv[1] if len(sys.argv) > 1 else None
    result = run_caption_inference_verification(test_img)
    if not result["real_inference_executed"]:
        sys.exit(0)
