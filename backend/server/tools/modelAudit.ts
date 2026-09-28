/**
 * SatQuery AI - Stage 6A Specialist Model & Capability Audit
 * Problem Statement: SIH26167 | Organization: ISRO
 *
 * Truthful, evidence-grounded capability audit for all six specialist workflows.
 * Evaluates repository validity, checkpoint availability, remote-sensing adaptation,
 * hardware constraints, license compliance, and fallback strategies.
 *
 * In accordance with SIH26167 protocol:
 * - No model inference is performed.
 * - No fake or fabricated benchmark metrics are produced.
 * - Hardware environment limits (Intel Iris Xe laptop vs. Colab Tesla T4) are strictly enforced.
 */

import {
  ModelAuditEntry,
  ModelAuditMatrixSummary,
  ModelAuditResponse,
  ParsedQueryTaskType
} from '../types/index.js';

export const HARDWARE_ENVIRONMENT_AUDIT = {
  primaryDevelopmentMachine: {
    type: 'Local Workstation / AI Studio Development Environment',
    os: 'Linux (Cloud Container) / Node.js Runtime',
    graphics: 'Intel Iris Xe / Cloud Container vCPU (No CUDA)',
    cudaSupport: false,
    status: 'blocked_for_cuda_inference',
    notes:
      'AI Studio / local development environment: real GeoChat inference unavailable due to lack of dedicated NVIDIA CUDA GPU. Suitable for orchestration, validation, routing, and testing.'
  },
  gpuTestEnvironment: {
    platform: 'Google Colab Cloud GPU',
    gpu: 'NVIDIA Tesla T4',
    vram: '15.36 GB GDDR6',
    status: 'conditionally_suitable',
    notes:
      'Google Colab T4 environment: verified real-inference environment with CUDA support and ~15 GB VRAM (4-bit quantized GeoChat-7B VQA + caption forward passes verified on a real Sentinel-2 scene; MODEL_GENERATED; answer/caption accuracy NOT VALIDATED).'
  }
} as const;

export const SPECIALIST_MODEL_AUDIT_REGISTRY: Record<
  Extract<
    ParsedQueryTaskType,
    'vqa' | 'caption' | 'grounding' | 'segmentation' | 'change_analysis' | 'optical_sar'
  >,
  ModelAuditEntry
> = {
  vqa: {
    taskType: 'vqa',
    displayName: 'Remote-Sensing Visual Question Answering (VQA)',
    modelName: 'GeoChat-7B',
    repository: 'https://github.com/mbzuai-oryx/GeoChat',
    checkpoint: 'MBZUAI/geochat-7b',
    taskCapability:
      'Multimodal visual question answering on high/medium-resolution overhead optical and multispectral remote-sensing imagery.',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL'],
    expectedImageCount: 1,
    requiredMetadata: ['sensorModality', 'spatialResolution (recommended)'],
    trainingFineTuningContext:
      'Fine-tuned from Vicuna-v1.5-7B base using remote-sensing instruction tuning (~318k conversations) across RSVQA-LR, RSVQA-HR, RSIVQA, and aerial object datasets. Native remote-sensing vision-language adaptation.',
    inferenceFramework: 'PyTorch / Hugging Face Transformers / LLaVA runtime (vLLM or Hugging Face)',
    minimumRecommendedHardware:
      'NVIDIA GPU with >= 16 GB VRAM (FP16) or >= 10-12 GB VRAM (4-bit/8-bit quantization). AI Studio / local dev environment: real inference unavailable (CPU-only, no CUDA); Google Colab Tesla T4 (15 GB VRAM): verified real-inference environment via 4-bit bitsandbytes quantization (VQA + caption forward passes verified on a real Sentinel-2 scene; accuracy NOT VALIDATED).',
    estimatedMemoryRequirement: '~14 GB VRAM (FP16 weights), ~5-6 GB VRAM (4-bit quantized)',
    license: 'Llama 2 Community License / Vicuna terms',
    licenseNotes:
      'Permissible for SIH26167 academic and research hackathon demonstration. Commercial use subject to Meta Llama 2 monthly active user limits.',
    checkpointAvailability: 'available',
    deploymentStatus: 'conditionally_suitable',
    confidence: 0.85,
    verificationNotes:
      'Repository verified (MBZUAI/GeoChat); checkpoint availability confirmed on Hugging Face (MBZUAI/geochat-7b); real model inference VERIFIED on NVIDIA Tesla T4 (4-bit) against a real Sentinel-2 L2A scene (696x564): VQA answer + scene caption returned with MODEL_GENERATED provenance — recorded in inference/geochat/verification_evidence.json (verification_id satquery-geochat-7b-tesla-t4-real-sentinel2). Answer/caption accuracy against ground truth is NOT VALIDATED. AI Studio / local development environment: real GeoChat inference unavailable (CPU-only).',
    risks: [
      'High VRAM footprint (~14 GB unquantized) approaches Colab T4 15 GB ceiling without quantization',
      'Prompt hallucination risk on fine sub-pixel structures without high Ground Sample Distance (GSD)',
      'Lacks native complex/polarimetric SAR backscatter interpretation; pseudo-RGB SAR inputs degrade reliability'
    ],
    fallbackModel: 'google/paligemma-3b-pt-448 or RS-Cap-VQA',
    fallbackNotes:
      'PaliGemma-3B parameter model requires significantly less VRAM (~6 GB FP16, ~3 GB 4-bit) and can run on lower compute environments, but requires remote-sensing domain prompt engineering.'
  },

  caption: {
    taskType: 'caption',
    displayName: 'Remote-Sensing Scene Captioning & Description',
    modelName: 'GeoChat-7B (Scene Description Mode)',
    repository: 'https://github.com/mbzuai-oryx/GeoChat',
    checkpoint: 'MBZUAI/geochat-7b',
    taskCapability:
      'Dense and concise remote-sensing scene-level description, land-use categorization, and aerial context captioning.',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL'],
    expectedImageCount: 1,
    requiredMetadata: ['sensorModality'],
    trainingFineTuningContext:
      'Instruction fine-tuned on RSICD, UCM-Captions, and Sydney-Captions benchmark datasets converted into multimodal instruction dialogues.',
    inferenceFramework: 'PyTorch / Hugging Face Transformers / LLaVA',
    minimumRecommendedHardware:
      'NVIDIA GPU with >= 16 GB VRAM (FP16) or >= 8 GB (4-bit). Blocked on local Intel Iris Xe; conditionally suitable on Colab Tesla T4 with quantization.',
    estimatedMemoryRequirement: '~14 GB VRAM (FP16), ~5-6 GB (4-bit quantized)',
    license: 'Llama 2 Community License / Vicuna terms',
    licenseNotes: 'Permissible for SIH26167 academic evaluation.',
    checkpointAvailability: 'available',
    deploymentStatus: 'conditionally_suitable',
    confidence: 0.85,
    verificationNotes:
      'Repository verified; remote-sensing captioning capability verified on RSICD/UCM benchmarks; checkpoint confirmed on Hugging Face; real inference VERIFIED on NVIDIA Tesla T4 (4-bit) against a real Sentinel-2 L2A scene (696x564): scene caption with grounding tokens returned with MODEL_GENERATED provenance — recorded in inference/geochat/verification_evidence.json (verification_id satquery-geochat-7b-tesla-t4-real-sentinel2). Caption accuracy against ground truth is NOT VALIDATED.',
    risks: [
      'Over-generalized scene descriptions when spatial resolution (GSD) is coarse (>10m/pixel)',
      'Inference latency on single GPU worker (~3-5 seconds per generation)'
    ],
    fallbackModel: 'Salesforce/blip-image-captioning-large (fine-tuned on RSICD) or GIT-base-rsicd',
    fallbackNotes:
      'Under 1.5 GB VRAM requirement, significantly faster generation (<1 sec), but yields shorter and less detailed descriptive vocabulary.'
  },

  grounding: {
    taskType: 'grounding',
    displayName: 'Remote-Sensing Visual Grounding & Localization',
    modelName: 'Grounding DINO (General-purpose baseline with RS zero-shot)',
    repository: 'https://github.com/IDEA-Research/GroundingDINO',
    checkpoint: 'groundingdino_swint_ogc.pth (IDEA-Research/grounding-dino-base)',
    taskCapability:
      'Text-guided bounding-box object localization and spatial coordinates regression on overhead imagery.',
    supportedModalities: ['OPTICAL'],
    expectedImageCount: 1,
    requiredMetadata: ['sensorModality', 'targetFeatures / textPrompt'],
    trainingFineTuningContext:
      'General checkpoint trained on natural image datasets (Objects365, COCO, GoldG). General-purpose checkpoint only; remote-sensing specialization not verified. Academic RS fine-tuned variants (e.g. DIOR-RSVG) exist only in standalone research repositories.',
    inferenceFramework: 'PyTorch / CUDA / Hugging Face Transformers',
    minimumRecommendedHardware:
      'NVIDIA GPU with >= 6-8 GB VRAM. Requires CUDA compilation for MultiScaleDeformableAttention C++ operators.',
    estimatedMemoryRequirement: '~4 GB VRAM',
    license: 'Apache-2.0',
    licenseNotes: 'Permissible for academic and commercial use under Apache-2.0.',
    checkpointAvailability: 'available',
    deploymentStatus: 'conditionally_suitable',
    confidence: 0.65,
    verificationNotes:
      'General Grounding DINO checkpoint (IDEA-Research/grounding-dino-base) is verified on Hugging Face, but is trained on natural images (COCO/O365) and NOT remote-sensing specialized. It requires CUDA C++ extension compilation. Academic remote-sensing fine-tuned checkpoints (DIOR-RSVG) lack unified Hugging Face distribution.',
    risks: [
      'General checkpoint suffers from severe false negatives and scale degradation on small dense nadir objects (e.g. tiny vehicles, building footprints)',
      'Requires CUDA C++ compiler tools during setup which complicates container builds',
      'Not remote-sensing adapted out-of-the-box'
    ],
    fallbackModel: 'google/owlvit-base-patch32 or YOLO-World with remote-sensing text prompts',
    fallbackNotes:
      'OWL-ViT provides pure Hugging Face Transformers implementation without custom CUDA C++ kernels, running cleanly on Colab T4 or CPU, though with similar natural-to-aerial domain gap.'
  },

  segmentation: {
    taskType: 'segmentation',
    displayName: 'Remote-Sensing Semantic Segmentation',
    modelName: 'SegFormer-B0 (General Semantic-Segmentation Baseline - ADE20K)',
    repository: 'https://github.com/NVlabs/SegFormer',
    checkpoint: 'nvidia/segformer-b0-finetuned-ade-512-512',
    taskCapability:
      'Dense pixel-level semantic segmentation for ADE20K 150-class natural scene categories. Evaluated strictly as a general baseline; lacks overhead remote-sensing adaptation.',
    supportedModalities: ['OPTICAL'],
    expectedImageCount: 1,
    requiredMetadata: ['sensorModality', 'spatialResolution (recommended)'],
    trainingFineTuningContext:
      'Fine-tuned exclusively on the ADE20K natural scene benchmark (150 terrestrial classes: building, sky, floor, tree, road, bed, windowpane, grass, etc.). General computer vision semantic segmentation baseline; NOT fine-tuned or adapted on satellite or aerial remote-sensing datasets (e.g., LoveDA, ISPRS Potsdam, or OpenEarthMap). Community fine-tunes exist on Hugging Face, but no authoritative institutional checkpoint is officially published.',
    inferenceFramework: 'PyTorch / Hugging Face Transformers',
    minimumRecommendedHardware:
      'NVIDIA GPU >= 4 GB VRAM or CPU. Executes on Colab Tesla T4 (~1.5 GB VRAM footprint for SegFormer-B0) or CPU inference.',
    estimatedMemoryRequirement: '~1.5-2 GB VRAM',
    license: 'NVIDIA Source Code License / Apache-2.0 wrapper',
    licenseNotes:
      'Permissible for non-commercial research and evaluation under NVIDIA license terms.',
    checkpointAvailability: 'available',
    deploymentStatus: 'conditionally_suitable',
    confidence: 0.5,
    verificationNotes:
      'Real SegFormer-B0 forward pass VERIFIED on NVIDIA Tesla T4 against a real Sentinel-2 L2A optical scene (696x564, target building): 5,692 segmented pixels, confidence 0.2311, provenance MODEL_GENERATED — recorded in inference/segmentation/verification_evidence.json (verification_id satquery-segformer-b0-tesla-t4-real-sentinel2-1790216772; accuracy_validated: false). The checkpoint nvidia/segformer-b0-finetuned-ade-512-512 is an official NVIDIA release on Hugging Face, but is trained strictly on ADE20K terrestrial scenes (150 classes) and is NOT remote-sensing specialized; segmentation accuracy on satellite imagery is NOT VALIDATED. An authoritative RS-specialized SegFormer checkpoint (e.g. from NVIDIA or an official remote-sensing benchmark consortium) could not be verified from an authoritative source; community uploads exist but lack official validation. The model is therefore classified as conditionally_suitable for real-inference execution, NOT as an RS-validated production candidate. General SegFormer serves solely as an unadapted baseline. Queries requesting remote-sensing land-cover categories (e.g. agricultural field, barren soil, runway) require task-aware rejection or fallback.',
    risks: [
      'Not remote-sensing adapted: trained on ADE20K natural scenes; poor feature extraction for overhead/nadir satellite perspective',
      'Segmentation accuracy on real satellite imagery NOT VALIDATED: real T4 forward pass verified execution only (5,692 pixels, confidence 0.2311), not pixel-level accuracy against ground truth',
      'Class ontology mismatch: ADE20K 150 classes do not align with standard remote sensing LULC categories (e.g., LoveDA 7-class or ISPRS 6-class)',
      'RS production checkpoint unverified: no authoritative pre-trained remote-sensing SegFormer checkpoint available from official vendor/organization',
      'Fixed class ontology constraint: arbitrary user queries cannot be segmented zero-shot without an open-vocabulary prompt pipeline',
      'Requires task-aware rejection or fallback for unsupported remote-sensing categories'
    ],
    fallbackModel:
      'SAM (Segment Anything Model) + Grounding DINO zero-shot pipeline, or local MMSegmentation fine-tuning on LoveDA/Potsdam',
    fallbackNotes:
      'Open-vocabulary mask promptability via SAM prompted by bounding boxes, mitigating fixed-ontology limits at the expense of higher compute cost; or local fine-tuning of SegFormer encoder using MMSegmentation on LoveDA.'
  },

  change_analysis: {
    taskType: 'change_analysis',
    displayName: 'Bi-Temporal Change Analysis & Detection',
    modelName: 'TinyCD (Lightweight Bi-Temporal Change Detection)',
    repository: 'https://github.com/AndreaCodegoni/TinyCD',
    checkpoint: 'TinyCD-LEVIR_CD.pth / TinyCD-WHU_CD.pth',
    taskCapability:
      'Pixel-level binary change detection mask (changed vs. unchanged) between co-registered bi-temporal optical image pairs.',
    supportedModalities: ['OPTICAL'],
    expectedImageCount: 2,
    requiredMetadata: [
      'acquisitionDate (t1 != t2)',
      'geographicArea / spatial co-registration (same bbox/footprint)',
      'identical spatial dimensions'
    ],
    trainingFineTuningContext:
      'Trained on LEVIR-CD (building construction/demolition) and WHU-CD building change benchmark datasets. Binary change detection only.',
    inferenceFramework: 'PyTorch',
    minimumRecommendedHardware:
      'Lightweight architecture (~0.3M parameters). Runs on Colab Tesla T4 (<1 GB VRAM) and can execute on standard CPU.',
    estimatedMemoryRequirement: '< 1 GB VRAM',
    license: 'MIT',
    licenseNotes: 'Fully permissive MIT license; unrestricted for academic and commercial use.',
    checkpointAvailability: 'available',
    deploymentStatus: 'unverified',
    confidence: 0.5,
    verificationNotes:
      'Repository verified (AndreaCodegoni/TinyCD); pre-trained weights available on GitHub releases for LEVIR-CD; real GPU inference pending and marked unverified until execution evidence exists.',
    risks: [
      'Assumes perfect geometric co-registration; spatial shift causes false-positive edge changes',
      'Sensitive to seasonal illumination and vegetation shifts',
      'Binary change only; cannot differentiate semantic change types without auxiliary VLM'
    ],
    fallbackModel: 'BIT (Bitemporal Image Transformer, justchenhao/BIT_CD) or SSIM/difference-threshold baseline',
    fallbackNotes:
      'BIT provides transformer-level spatial context; difference-thresholding provides zero-dependency algorithmic baseline.'
  },

  optical_sar: {
    taskType: 'optical_sar',
    displayName: 'Optical + SAR Cross-Modal Fusion Analysis',
    modelName: 'Dual-Stream Multimodal Optical-SAR Fusion Architecture',
    repository: 'unverified (Multiple academic research implementations: MCNet, SEN1-2 dual-stream, SpaceNet 6 baseline)',
    checkpoint: 'none verified for general inference (requires external verification)',
    taskCapability:
      'Cross-modal feature alignment, complementary optical-radar complementary analysis, and all-weather surface characterization.',
    supportedModalities: ['OPTICAL', 'SAR'],
    expectedImageCount: 2,
    requiredMetadata: [
      'modality: exactly one OPTICAL and one SAR',
      'geographicArea / spatial co-registration',
      'polarization channel information for SAR (VV/VH)'
    ],
    trainingFineTuningContext:
      'Academic research context (SpaceNet 6, SEN1-2 dataset). Dual-stream CNN/Transformer architectures trained for SAR-to-optical translation or joint building extraction, but no standardized foundation model checkpoint exists for generalized cross-modal reasoning.',
    inferenceFramework: 'PyTorch',
    minimumRecommendedHardware:
      'NVIDIA GPU >= 8 GB VRAM. Google Colab Tesla T4 could host a custom dual-branch PyTorch model, but no standard checkpoint is verified.',
    estimatedMemoryRequirement: '~4-8 GB VRAM (estimated for dual-branch feature extractor)',
    license: 'unverified (Academic research code with varying non-standard licenses)',
    licenseNotes: 'Varies across academic research repositories; no single unified permissive license package verified.',
    checkpointAvailability: 'unverified',
    deploymentStatus: 'research_only',
    confidence: 0.3,
    verificationNotes:
      'Candidate architecture — not yet verified for deployment. Academic research papers (e.g. SpaceNet 6 / SEN1-2 dual-stream networks) propose optical-SAR fusion architectures, but no verified, plug-and-play public checkpoint is available for generalized multimodal remote-sensing reasoning.',
    risks: [
      'No standardized pre-trained checkpoint exists for general cross-modal Q&A or unified inference',
      'Extreme radiometric disparity between speckle-rich radar backscatter and optical spectral bands',
      'Complex spatial co-registration requirements between varying orbit geometry and optical perspective'
    ],
    fallbackModel:
      'Decoupled Modality Pipeline: Independent optical analysis + SAR backscatter thresholding/speckle filtering, synthesized via VLM reasoning',
    fallbackNotes:
      'Process the optical image through the optical specialist and extract SAR radar backscatter metrics (VV/VH roughness, surface water penetration) separately, fusing the results via the rule-based result integrator.'
  }
};

/**
 * Returns a high-level, human-readable summary matrix of the audited specialists.
 */
export function getModelAuditMatrix(): ModelAuditMatrixSummary[] {
  return Object.values(SPECIALIST_MODEL_AUDIT_REGISTRY).map((entry) => ({
    task: entry.displayName,
    taskType: entry.taskType,
    primaryCandidate: entry.modelName,
    backup: entry.fallbackModel,
    modalities: entry.supportedModalities,
    images: entry.expectedImageCount,
    checkpoint: entry.checkpoint,
    license: entry.license,
    hardware: entry.minimumRecommendedHardware,
    deploymentStatus: entry.deploymentStatus,
    confidence: entry.confidence,
    verificationState: entry.verificationNotes
  }));
}

/**
 * Returns the full structured capability audit report response.
 */
export function getFullModelAuditResponse(): ModelAuditResponse {
  const matrix = getModelAuditMatrix();

  let verifiedCount = 0;
  let conditionallySuitableCount = 0;
  let researchOnlyCount = 0;
  let unverifiedOrBlockedCount = 0;

  for (const entry of Object.values(SPECIALIST_MODEL_AUDIT_REGISTRY)) {
    if (entry.deploymentStatus === 'verified_candidate') {
      verifiedCount++;
    } else if (entry.deploymentStatus === 'conditionally_suitable') {
      conditionallySuitableCount++;
    } else if (entry.deploymentStatus === 'research_only') {
      researchOnlyCount++;
    } else {
      unverifiedOrBlockedCount++;
    }
  }

  return {
    valid: true,
    timestamp: new Date().toISOString(),
    sihProblemId: 'SIH26167',
    environmentAudit: HARDWARE_ENVIRONMENT_AUDIT,
    matrix,
    specialists: SPECIALIST_MODEL_AUDIT_REGISTRY,
    verificationSummary: {
      totalAudited: matrix.length,
      verifiedCandidates: verifiedCount,
      conditionallySuitable: conditionallySuitableCount,
      researchOnly: researchOnlyCount,
      unverifiedOrBlocked: unverifiedOrBlockedCount
    }
  };
}

/**
 * Retrieves the audit entry for a specific task.
 */
export function getSpecialistAuditEntry(taskType: ParsedQueryTaskType): ModelAuditEntry | undefined {
  if (taskType === 'uncertain') {
    return undefined;
  }
  return SPECIALIST_MODEL_AUDIT_REGISTRY[taskType];
}
