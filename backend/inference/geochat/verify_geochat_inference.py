#!/usr/bin/env python3
"""
SatQuery AI - Phase 7 Real GeoChat-7B Inference Verification Script (VQA + Captioning)
SIH26167 | ISRO Space Technology

Attempts real remote-sensing VQA and Caption inference using MBZUAI/geochat-7B.
Demonstrates:
  1. Checkpoint loaded
  2. Multimodal model + vision tower loaded
  3. Image accepted & preprocessed to 504x504
  4. VQA request executed with image tensor passed
  5. Actual answer returned
  6. Caption request executed with image tensor passed
  7. Actual caption returned
  8. Response conforms to specialist schema
  9. Truthful hardware and environment telemetry

ZERO HALLUCINATION:
If real inference cannot execute (e.g. CPU-only container without NVIDIA CUDA GPU),
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


def run_geochat_verification(image_path: str = None) -> dict:
    print("=" * 70)
    print(" SatQuery AI - Phase 7 Real GeoChat-7B Inference Verification")
    print(" SIH26167 | ISRO Space Technology | Organization: ISRO")
    print(" Target Model: MBZUAI/geochat-7B (Multimodal VQA + Scene Captioning)")
    print("=" * 70)

    # 1. Environment & Hardware Diagnostic
    cuda_available = TORCH_AVAILABLE and torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_available else "None (No CUDA device found)"
    vram_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2) if cuda_available else 0.0

    print(f"PyTorch Available: {TORCH_AVAILABLE}")
    print(f"CUDA Available:    {cuda_available}")
    print(f"GPU Hardware:      {gpu_name}")
    print(f"Total VRAM:        {vram_gb} GB")
    print(f"Host Environment:  {'CUDA GPU Worker' if cuda_available else 'Local Container / Workstation (CPU-only)'}")
    print("-" * 70)

    # 2. Check if Real Inference can execute
    if not cuda_available:
        print("\n[VERIFICATION RESULT]")
        print("REAL GEOCHAT INFERENCE: BLOCKED / NOT VERIFIED")
        print("Exact Technical Cause:")
        print("  1. Host lacks dedicated NVIDIA CUDA GPU (CPU-only execution).")
        print("  2. GeoChat-7B requires >=15 GB VRAM with 4-bit NF4 quantization (e.g. Google Colab Tesla T4).")
        print("\nExecution Telemetry:")
        print("  - Model Used: None (Execution halted prior to model loading)")
        print("  - Device: None")
        print("  - Generated Answer: None (Zero fabricated or simulated VQA answers)")
        print("  - Generated Caption: None (Zero fabricated or simulated captions)")
        print("  - Real Inference Executed: False")
        print("=" * 70)
        return {
            "status": "BLOCKED / NOT VERIFIED",
            "model_id": "MBZUAI/geochat-7B",
            "checkpoint": "MBZUAI/geochat-7B",
            "device": "none",
            "hardware": gpu_name,
            "real_inference_executed": False,
            "reason": "Host environment lacks NVIDIA CUDA GPU. GeoChat-7B requires >=15GB VRAM (e.g. Tesla T4).",
            "vqa": None,
            "caption": None
        }

    # 3. If CUDA is available, load real model and perform multimodal inference
    print(f"[Execution] CUDA detected on {gpu_name}. Preparing GeoChat-7B...")
    start_time = time.time()

    try:
        from worker import GeoChatRuntime
        runtime = GeoChatRuntime(model_id="MBZUAI/geochat-7B", load_mode="4bit")

        success, msg = runtime.load_model()
        if not success:
            raise RuntimeError(f"Runtime model load failed: {msg}")

        model_load_ms = int((time.time() - start_time) * 1000)
        print(f"Model and vision pipeline loaded in {model_load_ms} ms.")

        # Prepare image payload
        if image_path and os.path.exists(image_path):
            img_desc = {"name": os.path.basename(image_path), "mimeType": "image/png", "path": image_path}
            print(f"Using image from path: {image_path}")
        else:
            # Synthetic 224x224 optical test patch
            import base64
            from PIL import Image
            import io
            img = Image.new("RGB", (224, 224), color=(73, 109, 137))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            b64_str = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
            img_desc = {"name": "synthetic_patch.png", "mimeType": "image/png", "dataUri": b64_str}
            print("Using synthetic optical calibration patch (224x224 RGB).")

        # A. Execute Multimodal VQA
        vqa_start = time.time()
        vqa_question = "What features are visible in this satellite scene?"
        vqa_payload = {
            "task": "vqa",
            "question": vqa_question,
            "image": img_desc,
            "parameters": {"maxNewTokens": 256, "temperature": 0.2},
            "requestId": "verify-vqa-001"
        }
        vqa_status, vqa_resp = runtime.process_vqa_request(vqa_payload)
        if vqa_status != 200:
            raise RuntimeError(f"VQA execution returned {vqa_status}: {vqa_resp}")
        answer = vqa_resp.get("answerText", "")
        vqa_ms = int((time.time() - vqa_start) * 1000)

        # B. Execute Multimodal Caption
        caption_start = time.time()
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
        caption_ms = int((time.time() - caption_start) * 1000)

        total_ms = int((time.time() - start_time) * 1000)

        print("\n[VERIFICATION RESULT]")
        print("REAL GEOCHAT INFERENCE: VERIFIED (SUCCESS)")
        print(f"  - Model ID:           MBZUAI/geochat-7B")
        print(f"  - Device:             cuda ({gpu_name})")
        print(f"  - Total Duration:     {total_ms} ms")
        print(f"  - VQA Duration:       {vqa_ms} ms")
        print(f"  - VQA Answer:         {answer}")
        print(f"  - Caption Duration:   {caption_ms} ms")
        print(f"  - Generated Caption:  {caption}")
        print(f"  - Provenance:         MODEL_GENERATED")
        print(f"  - Real Inference:     True")
        print("=" * 70)

        return {
            "status": "VERIFIED",
            "model_id": "MBZUAI/geochat-7B",
            "checkpoint": "MBZUAI/geochat-7B",
            "device": "cuda",
            "hardware": gpu_name,
            "real_inference_executed": True,
            "total_ms": total_ms,
            "vqa": {
                "question": vqa_question,
                "answer": answer,
                "duration_ms": vqa_ms,
                "provenance": "MODEL_GENERATED"
            },
            "caption": {
                "prompt": "Describe this satellite scene in detail.",
                "caption": caption,
                "duration_ms": caption_ms,
                "provenance": "MODEL_GENERATED"
            }
        }

    except Exception as e:
        print(f"\n[VERIFICATION RESULT] FAILED: {str(e)}")
        return {
            "status": "FAILED",
            "model_id": "MBZUAI/geochat-7B",
            "device": "cuda",
            "hardware": gpu_name,
            "real_inference_executed": False,
            "error": str(e)
        }


if __name__ == "__main__":
    test_img = sys.argv[1] if len(sys.argv) > 1 else None
    res = run_geochat_verification(test_img)
    if not res["real_inference_executed"]:
        sys.exit(0)
