#!/usr/bin/env python3
"""
SatQuery AI - Dual-Stream Optical-SAR Fusion Google Colab Tesla T4 Verification Script
SIH26167 | ISRO Space Technology | Team IMPOSTERS

Instructions for Google Colab:
  1. Open a Google Colab notebook (Runtime -> Change runtime type -> T4 GPU).
  2. Upload/clone the satquiry ai codebase.
  3. Run:
       !python inference/opticalSar/run_colab_verification.py
  4. The script will:
       - Verify CUDA and Tesla T4 GPU
       - Initialize DualStreamOpticalSarFusionCore (Optical CNN + SAR CNN + cross-modal head)
       - Decode co-registered Optical (RGB) and SAR (grayscale backscatter) test image pair
       - Perform a genuine dual-stream forward pass (Optical encoder + SAR encoder + cross-attention)
       - Compute real cross-modal metrics: crossModalCorrelation, surfaceRoughnessIndex,
         allWeatherFeatureAlignment, opticalSpectralMean, sarBackscatterMean
       - Write verification_evidence.json as benchmark evidence artifact
"""

import os
import sys
import subprocess


def main():
    print("=" * 70)
    print("SatQuery AI — Dual-Stream Optical-SAR Fusion Colab Tesla T4 Benchmark")
    print("SIH26167 | ISRO / Department of Space | Team IMPOSTERS")
    print("=" * 70)

    try:
        import torch
        if not torch.cuda.is_available():
            print("\n[ERROR] CUDA is not available. In Colab, go to:")
            print("  Runtime -> Change runtime type -> Hardware accelerator -> T4 GPU")
            sys.exit(1)
        gpu_name = torch.cuda.get_device_name(0)
        print(f"GPU Detected: {gpu_name}")
        props = torch.cuda.get_device_properties(0)
        vram_gb = round(props.total_memory / (1024 ** 3), 2)
        print(f"VRAM Total:   {vram_gb} GB")
    except ImportError:
        print("Installing torch & dependencies...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install",
            "torch", "torchvision", "pillow", "numpy"
        ])
        import torch
        if not torch.cuda.is_available():
            print("[ERROR] CUDA unavailable even after torch install.")
            sys.exit(1)

    import verify_optical_sar_inference
    evidence_file = os.path.join(os.path.dirname(__file__), "verification_evidence.json")
    print("\nRunning genuine Dual-Stream Optical-SAR forward pass on CUDA...")
    evidence = verify_optical_sar_inference.run_benchmark_forward_pass(
        device="cuda",
        output_evidence_file=evidence_file
    )

    hw = evidence.get('hardware', {})
    res = evidence.get('inferenceResult', {})
    met = res.get('metrics', {})

    print("\n" + "=" * 70)
    print("TESLA T4 REAL OPTICAL-SAR INFERENCE VERIFICATION COMPLETED")
    print(f"Model ID                 : {evidence.get('model', {}).get('modelId')}")
    print(f"Architecture             : {evidence.get('model', {}).get('architecture')}")
    print(f"GPU Hardware             : {hw.get('gpuName')} ({hw.get('totalVramGb')} GB VRAM)")
    print(f"PyTorch Version          : {hw.get('pytorchVersion')}")
    print(f"Inference Duration       : {res.get('durationMs')} ms")
    print(f"Cross-Modal Correlation  : {met.get('crossModalCorrelation')}")
    print(f"Surface Roughness Index  : {met.get('surfaceRoughnessIndex')}")
    print(f"All-Weather Alignment    : {met.get('allWeatherFeatureAlignment')}")
    print(f"Optical Spectral Mean    : {met.get('opticalSpectralMean')}")
    print(f"SAR Backscatter Mean     : {met.get('sarBackscatterMean')}")
    print(f"Provenance               : {res.get('provenance')}")
    print(f"Zero Fake Results        : {res.get('zeroFabricatedEvidence')}")
    print(f"Evidence File            : {evidence_file}")
    print("=" * 70)


if __name__ == '__main__':
    main()
