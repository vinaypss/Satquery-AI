# SatQuery AI — Optical-SAR Fusion Specialist Worker

**Stage 6G | SIH26167 | ISRO Space Technology | Team IMPOSTERS**

> **GPU verification status: PENDING.** The dual-stream architecture, worker, and server tests are complete, but no verified unified pre-trained checkpoint exists and a real NVIDIA-CUDA inference forward pass has not yet been recorded as verification evidence. The specialist is classified `research_only`; no fused metrics are shown until genuine GPU evidence exists.

## Overview

Independent Python HTTP worker for the **Dual-Stream Multimodal Optical-SAR Fusion Architecture**.

This worker handles cross-modal analysis tasks where co-registered Optical (RGB/Multispectral) and SAR (Synthetic Aperture Radar) imagery are fused to extract complementary modality features.

**Truthful contract** — per SIH26167 anti-fabrication rules:
- Real CUDA inference: produces genuine cross-modal metrics via dual-stream CNN + cross-attention (`provenance: MODEL_GENERATED`)
- CPU / model unavailable: returns HTTP 503 with `evidence: null` — zero fake fusion results

---

## Architecture

```
Optical Image (RGB, 3-channel)        SAR Image (Grayscale backscatter, 1-channel)
         │                                           │
  [Optical CNN Encoder]                    [SAR CNN Encoder]
  Conv2d(3→32→64→128)                      Conv2d(1→32→64→128)
  AdaptiveAvgPool2d(8×8)                  AdaptiveAvgPool2d(8×8)
         │                                           │
  f_optical [1, 128, 8, 8]               f_sar [1, 128, 8, 8]
         └────────────┬──────────────────────┘
                      │
            [Cross-Modal Fusion Head]
           Cosine Similarity → cross_modal_correlation
           SAR Spatial Variance → surface_roughness_index
           Linear(2×8192→256→64→1) → all_weather_feature_alignment
```

---

## Endpoints

| Method | Path               | Description                         |
|--------|--------------------|-------------------------------------|
| GET    | `/health`          | Worker health and model state       |
| POST   | `/health`          | Worker health (POST variant)        |
| GET    | `/v1/readiness`    | Model readiness check               |
| POST   | `/v1/load-model`   | Load model into GPU memory          |
| POST   | `/v1/optical-sar`  | Run Optical-SAR cross-modal fusion  |

---

## Request / Response

### POST `/v1/optical-sar`

**Request body:**
```json
{
  "task": "optical_sar",
  "opticalImage": {
    "name": "optical_scene.png",
    "mimeType": "image/png",
    "dataUri": "data:image/png;base64,...",
    "modality": "OPTICAL"
  },
  "sarImage": {
    "name": "sar_backscatter.png",
    "mimeType": "image/png",
    "dataUri": "data:image/png;base64,...",
    "modality": "SAR"
  },
  "geographicArea": "Delhi",
  "query": "Analyze optical-SAR cross-modal correspondence for flood mapping.",
  "parameters": {
    "requireGeographicCorrespondence": true
  }
}
```

**Response (CUDA success):**
```json
{
  "task": "optical_sar",
  "model": "Dual-Stream Multimodal Optical-SAR Fusion Architecture",
  "status": "success",
  "deploymentStatus": "research_only",
  "device": "cuda",
  "durationMs": 45,
  "evidence": {
    "opticalModality": "OPTICAL",
    "sarModality": "SAR",
    "modelIdentity": "Dual-Stream Multimodal Optical-SAR Fusion Architecture",
    "geographicCorrespondence": "VERIFIED_CORRESPONDENT",
    "metrics": {
      "opticalSpectralMean": 0.3842,
      "sarBackscatterMean": 0.2156,
      "crossModalCorrelation": 0.7634,
      "surfaceRoughnessIndex": 0.4521,
      "allWeatherFeatureAlignment": 0.8012
    },
    "provenance": "MODEL_GENERATED"
  }
}
```

**Response (unavailable / research-only):**
```json
{
  "task": "optical_sar",
  "status": "unavailable",
  "deploymentStatus": "research_only",
  "evidence": null,
  "error": "No verified unified Optical-SAR inference model is available."
}
```

---

## Running Locally (CPU — diagnostic only)

```bash
cd inference/opticalSar
pip install -r requirements.txt
python worker.py --port 8005
```

On CPU, all requests return `HTTP 503` with `evidence: null` — this is correct and expected.

---

## Tesla T4 Colab Verification

To verify **real CUDA inference** on a Tesla T4 GPU (currently **pending**):

```bash
# In Google Colab (Runtime → T4 GPU)
!python inference/opticalSar/verify_optical_sar_inference.py
```

or the convenience entrypoint:

```bash
!python inference/opticalSar/run_colab_verification.py
```

This will:
1. Verify CUDA + Tesla T4 GPU hardware
2. Initialize the `DualStreamOpticalSarFusionCore` model on CUDA
3. Decode co-registered Optical + SAR test scene pair (512×512)
4. Execute a genuine dual-stream forward pass
5. Compute real cross-modal metrics
6. Write `verification_evidence.json` as benchmark evidence

> The verification remains **pending** until real GPU inference evidence is recorded and stored in this directory.

---

## Stage 6A Audit Statement

| Property              | Value                                                                     |
|-----------------------|---------------------------------------------------------------------------|
| **Model ID**          | Dual-Stream Multimodal Optical-SAR Fusion Architecture                   |
| **Checkpoint**        | none verified for general inference (requires external verification)      |
| **Deployment Status** | `research_only`                                                           |
| **Fake Evidence**     | STRICTLY FORBIDDEN — zero tolerance per SIH26167                         |
| **Modalities**        | OPTICAL (3-ch RGB) + SAR (1-ch grayscale backscatter)                    |
| **Default Port**      | 8005 (configurable via `OPTICAL_SAR_WORKER_URL` env var)                 |

---

*SIH26167 | ISRO / Department of Space | Team IMPOSTERS*
