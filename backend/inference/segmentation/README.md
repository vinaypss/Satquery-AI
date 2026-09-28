# SatQuery AI — Remote Sensing Semantic Segmentation Service
**SIH26167 | ISRO / Department of Space | Team IMPOSTERS**

> **GPU verification status: REAL INFERENCE VERIFIED on NVIDIA Tesla T4.** A genuine SegFormer-B0 forward pass on a real Sentinel-2 L2A optical scene is recorded in `verification_evidence.json` (`MODEL_GENERATED` provenance). **Accuracy / RS specialization: NOT VALIDATED** — SegFormer-B0 remains a general ADE20K baseline; no pixel-level accuracy claim is made against ground truth.

## Overview
This standalone Python microservice provides pixel-level semantic segmentation for overhead optical remote-sensing imagery using **SegFormer-B0** (`nvidia/segformer-b0-finetuned-ade-512-512`).

## Architecture & Baseline Specification
- **Model ID**: `nvidia/segformer-b0-finetuned-ade-512-512`
- **Architecture**: SegFormer (Mix Vision Transformer Encoder + All-MLP Decoder, ~3.7M parameters)
- **Specialization Status**: General Semantic Segmentation Baseline (ADE20K 150 terrestrial classes); **not** remote-sensing specialized
- **Inference Engine**: PyTorch + Hugging Face Transformers (`AutoImageProcessor`, `AutoModelForSemanticSegmentation`)
- **Default Port**: 8003 (configurable via `SEGMENTATION_WORKER_PORT`)
- **Supported Modality**: OPTICAL only (strictly rejects SAR)

## Endpoints
| Method | Endpoint | Description |
|---|---|---|
| GET, POST | /health or /v1/health | Diagnostic status of worker process and hardware |
| GET | /v1/readiness | Strict model readiness state (RUNNABLE, GPU_UNAVAILABLE, MODEL_UNAVAILABLE) |
| POST | /v1/load-model | Explicitly loads model weights and processor into GPU VRAM |
| POST | /v1/segmentation | Semantic segmentation forward pass returning base64 PNG mask |

## Files
- `worker.py` — HTTP inference worker
- `test_worker.py` — worker test suite
- `verify_segmentation_inference.py` — real CUDA forward-pass verification script
- `run_colab_verification.py` — Tesla T4 Colab verification entrypoint
- `verification_evidence.json` — permanent real-T4 evidence record (real Sentinel-2 run, `MODEL_GENERATED`)
- `segmentation_real_sentinel2_building_mask.png` — binary building mask from the verified run (visual evidence)

## Truthfulness & Model Integrity (SIH26167)
- Evaluated strictly as a general baseline (ADE20K 150 classes); **not** remote-sensing specialized.
- Strictly rejects SAR imagery (`UNSUPPORTED_MODALITY`).
- Never fabricates simulated masks, placeholder arrays, or synthetic overlays.
- On non-CUDA hosts, returns HTTP 503 (`GPU_UNAVAILABLE` / model not loaded).
- When model is loaded on CUDA, executes a genuine forward pass and returns `provenance: "MODEL_GENERATED"`.

## Colab T4 Verification (VERIFIED — Real Sentinel-2)
A real forward pass was executed on an NVIDIA Tesla T4 GPU against a real Sentinel-2 L2A scene and recorded as the permanent evidence in `verification_evidence.json`:

- **verification_id**: `satquery-segformer-b0-tesla-t4-real-sentinel2-1790216772`
- **Environment**: Tesla T4, CUDA 13.0, PyTorch 2.11.0+cu130, device `cuda`
- **Model**: `nvidia/segformer-b0-finetuned-ade-512-512` (SegFormer-B0, general ADE20K baseline)
- **Scene**: real Sentinel-2 L2A image `2019-06-03-00_00_2019-06-03-23_59_Sentinel-2_L2A_Moisture_Stress.jpg` (696×564, OPTICAL, target `building`)
- **Result**: forward pass completed, **5,692 segmented pixels**, mask 696×564, **confidence 0.2311**, `provenance: "MODEL_GENERATED"`, `synthetic_fake_masks: false`
- **Visual evidence**: `segmentation_real_sentinel2_building_mask.png` (binary building mask from this run)
- **Accuracy**: `accuracy_validated: false` — execution verified; pixel-level accuracy against ground truth is **NOT VALIDATED**, and RS specialization is **NOT** claimed.

To re-run verification on a Tesla T4 GPU:

```bash
python inference/segmentation/verify_segmentation_inference.py   # or run_colab_verification.py
```