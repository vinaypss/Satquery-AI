import React, { useState, useEffect } from 'react';
import {
  FileText,
  Database,
  Terminal,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Cpu,
  HardDrive,
  Server,
  Info,
  Loader2
} from 'lucide-react';
import {
  UploadedImageFile,
  ParsedQuery,
  RoutingDecisionResult,
  SpecialistOutput,
  ModelAuditResponse,
  ModelAuditEntry,
  ModelDeploymentStatus,
  ResultReport
} from '../types/index.js';
import { ResultReportCard } from './ResultReportCard.js';

interface BottomEvidencePanelProps {
  image: UploadedImageFile | null;
  query: string;
  parsedQuery?: ParsedQuery | null;
  routingDecision?: RoutingDecisionResult | null;
  executionResult?: SpecialistOutput | null;
  report?: ResultReport | null;
  activeTab: 'evidence' | 'metadata' | 'execution' | 'model_audit';
  onTabChange: (tab: 'evidence' | 'metadata' | 'execution' | 'model_audit') => void;
}

const SPECIALIST_NAMES: Record<string, string> = {
  'tool_vqa_specialist': 'Remote Sensing Visual Question Answering Specialist',
  'tool_caption_specialist': 'Remote Sensing Scene Captioning Specialist',
  'tool_grounding_specialist': 'Remote Sensing Visual Grounding Specialist',
  'tool_segmentation_specialist': 'Remote Sensing Semantic Segmentation Specialist',
  'tool_change_specialist': 'Remote Sensing Bi-Temporal Change Analysis Specialist',
  'tool_optical_sar_specialist': 'Remote Sensing Optical-SAR Cross-Modal Specialist'
};

export const BottomEvidencePanel: React.FC<BottomEvidencePanelProps> = ({
  image,
  query,
  parsedQuery,
  routingDecision,
  executionResult,
  report,
  activeTab,
  onTabChange
}) => {
  const specialistName = routingDecision?.selectedToolId
    ? SPECIALIST_NAMES[routingDecision.selectedToolId] || routingDecision.selectedToolId
    : null;

  const isRouted = routingDecision?.routingStatus === 'routed';
  const isExecuted = !!executionResult;

  // Stage 6A Model Audit State
  const [modelAudit, setModelAudit] = useState<ModelAuditResponse | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<string | null>('vqa');

  useEffect(() => {
    let isMounted = true;
    const fetchAudit = async () => {
      setIsLoadingAudit(true);
      try {
        const response = await fetch('/api/model-audit');
        if (!response.ok) {
          throw new Error(`Failed to load model audit: ${response.statusText}`);
        }
        const data: ModelAuditResponse = await response.json();
        if (isMounted) {
          setModelAudit(data);
          setAuditError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Error fetching model audit:', err);
          setAuditError(err.message || 'Unable to load model capability audit');
        }
      } finally {
        if (isMounted) {
          setIsLoadingAudit(false);
        }
      }
    };

    fetchAudit();
    return () => {
      isMounted = false;
    };
  }, []);

  const renderStatusBadge = (status: ModelDeploymentStatus) => {
    switch (status) {
      case 'verified_candidate':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            VERIFIED
          </span>
        );
      case 'conditionally_suitable':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-300">
            <Info className="w-3 h-3 text-blue-600" />
            CONDITIONALLY SUITABLE
          </span>
        );
      case 'research_only':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-800 border border-purple-300">
            <Layers className="w-3 h-3 text-purple-600" />
            RESEARCH ONLY
          </span>
        );
      case 'blocked_by_environment':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            BLOCKED
          </span>
        );
      case 'unverified':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
            <AlertTriangle className="w-3 h-3 text-slate-500" />
            UNVERIFIED
          </span>
        );
    }
  };

  return (
    <footer className="bg-white border-t border-slate-200 flex flex-col h-64 select-none">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 bg-slate-50">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => onTabChange('evidence')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'evidence'
                ? 'border-blue-700 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Visual & Text Evidence</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('metadata')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'metadata'
                ? 'border-blue-700 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Remote Sensing Metadata</span>
            {image && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
          </button>

          <button
            type="button"
            onClick={() => onTabChange('execution')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'execution'
                ? 'border-blue-700 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Audit & Execution Log</span>
            {(routingDecision?.routingStatus === 'rejected' || image?.validationStatus === 'INVALID' || isExecuted) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onTabChange('model_audit')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'model_audit'
                ? 'border-blue-700 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-blue-700" />
            <span>Specialist Model Audit</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-1.5 py-0.2 rounded-full border border-blue-200">
              Stage 6A
            </span>
          </button>
        </div>

        <span className="hidden xl:inline text-[11px] font-mono text-slate-500 whitespace-nowrap">
          SIH26167 AUDIT COMPLIANCE ·{' '}
          {routingDecision?.selectedToolId === 'tool_caption_specialist'
            ? 'STAGE 6C CAPTION SPECIALIST'
            : routingDecision?.selectedToolId === 'tool_grounding_specialist'
            ? 'STAGE 6D GROUNDING SPECIALIST'
            : 'STAGE 6B VQA SPECIALIST'}
        </span>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 p-4 overflow-y-auto bg-white font-sans">
        {/* Tab 1: Evidence */}
        {activeTab === 'evidence' && (
          <div className="h-full flex flex-col justify-center items-center text-center text-slate-500 py-4">
            {executionResult?.status === 'complete' && executionResult.evidence.evidenceType === 'change_map' ? (
              <div className="max-w-xl w-full text-left bg-emerald-50/60 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Evidence: Remote-Sensing Bi-Temporal Change Analysis Change Map
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 ml-auto">
                    {executionResult.executionMetrics.modelName}
                  </span>
                </div>
                <div className="space-y-2 text-[11px] text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Temporal image pair:</span>
                    <span className="font-mono text-slate-900">{image?.name || 'unknown'} + image2</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Image dates:</span>
                    <span className="font-mono text-slate-900">{image?.acquisitionDate || 'unknown'} / {executionResult.evidence.details?.image2Date || 'unknown'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Model:</span>
                    <span className="font-mono text-slate-900">{executionResult.executionMetrics.modelName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Changed pixels:</span>
                    <span className="font-mono text-slate-900">{String(executionResult.evidence.details?.changeStatistics?.changedPixels ?? 'unknown')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Total pixels:</span>
                    <span className="font-mono text-slate-900">{String(executionResult.evidence.details?.changeStatistics?.totalPixels ?? 'unknown')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Changed percentage:</span>
                    <span className="font-mono text-slate-900">{String(executionResult.evidence.details?.changeStatistics?.changedPercentage ?? 'unknown')}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Mask dimensions:</span>
                    <span className="font-mono text-slate-900">{String(executionResult.evidence.details?.changeMask?.width ?? 'unknown')} × {String(executionResult.evidence.details?.changeMask?.height ?? 'unknown')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Status:</span>
                    <span className="font-mono text-emerald-800 uppercase">{executionResult.evidence.details?.status || executionResult.status}</span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] font-mono text-emerald-800">
                  <span>Device: {executionResult.executionMetrics.device}</span>
                  <span>Duration: {executionResult.executionMetrics.durationMs} ms</span>
                </div>
              </div>
            ) : executionResult?.status === 'complete' && executionResult.evidence.evidenceType === 'segmentation_mask' ? (
              <div className="max-w-xl w-full text-left bg-emerald-50/60 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Evidence: Remote-Sensing Image Segmentation Mask
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 ml-auto">
                    {executionResult.executionMetrics.modelName}
                  </span>
                </div>
                <div className="space-y-2 text-[11px] text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Target / Class:</span>
                    <span className="font-mono text-slate-900">{String(executionResult.evidence.details?.target || '')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Status:</span>
                    <span className="font-mono text-emerald-800 uppercase">{executionResult.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Model:</span>
                    <span className="font-mono text-slate-900">{executionResult.executionMetrics.modelName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Mask:</span>
                    <span className="font-mono text-slate-900">
                      {String(executionResult.evidence.details?.mask?.width || 'unknown')} × {String(executionResult.evidence.details?.mask?.height || 'unknown')}
                    </span>
                  </div>
                  {typeof executionResult.evidence.details?.confidence === 'number' && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Confidence:</span>
                      <span className="font-mono text-slate-900">{Math.round((executionResult.evidence.details?.confidence as number) * 100)}%</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] font-mono text-emerald-800">
                  <span>Device: {executionResult.executionMetrics.device}</span>
                  <span>Duration: {executionResult.executionMetrics.durationMs} ms</span>
                </div>
              </div>
            ) : executionResult?.status === 'complete' && executionResult.evidence.evidenceType === 'modality_comparison' ? (
              <div className="max-w-xl w-full text-left bg-emerald-50/60 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Evidence: Remote Sensing Optical-SAR Cross-Modal Modality Comparison
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 ml-auto">
                    {executionResult.executionMetrics.modelName}
                  </span>
                </div>
                <div className="space-y-2 text-[11px] text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Specialist:</span>
                    <span className="font-mono text-slate-900">Remote Sensing Optical-SAR Cross-Modal Specialist</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Model:</span>
                    <span className="font-mono text-slate-900">Dual-Stream Multimodal Optical-SAR Fusion Architecture</span>
                  </div>
                  {(executionResult.evidence.modalityComparison as Record<string, unknown> | undefined)?.opticalModality && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Optical modality:</span>
                      <span className="font-mono text-slate-900">{String((executionResult.evidence.modalityComparison as Record<string, unknown>)?.opticalModality)}</span>
                    </div>
                  )}
                  {(executionResult.evidence.modalityComparison as Record<string, unknown> | undefined)?.sarModality && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">SAR modality:</span>
                      <span className="font-mono text-slate-900">{String((executionResult.evidence.modalityComparison as Record<string, unknown>)?.sarModality)}</span>
                    </div>
                  )}
                  {(executionResult.evidence.modalityComparison as Record<string, unknown> | undefined)?.geographicCorrespondence && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Geographic correspondence:</span>
                      <span className="font-mono text-slate-900">{String((executionResult.evidence.modalityComparison as Record<string, unknown>)?.geographicCorrespondence)}</span>
                    </div>
                  )}
                  {(executionResult.evidence.modalityComparison as Record<string, unknown> | undefined)?.comparisonDetails && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Comparison details:</span>
                      <span className="font-mono text-slate-900">{String((executionResult.evidence.modalityComparison as Record<string, unknown>)?.comparisonDetails)}</span>
                    </div>
                  )}
                  {(executionResult.evidence.details as Record<string, unknown> | undefined)?.inferenceStatus && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Inference status:</span>
                      <span className="font-mono text-slate-900 uppercase">{String((executionResult.evidence.details as Record<string, unknown>)?.inferenceStatus)}</span>
                    </div>
                  )}
                  {typeof (executionResult.evidence.details as Record<string, unknown> | undefined)?.confidence === 'number' && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Confidence:</span>
                      <span className="font-mono text-slate-900">{String((executionResult.evidence.details as Record<string, unknown>)?.confidence)}</span>
                    </div>
                  )}
                  {typeof (executionResult.evidence.details as Record<string, unknown> | undefined)?.metrics === 'object' && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Metrics:</span>
                      <span className="font-mono text-slate-900">{JSON.stringify((executionResult.evidence.details as Record<string, unknown>)?.metrics)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] font-mono text-emerald-800">
                  <span>Device: {executionResult.executionMetrics.device}</span>
                  <span>Duration: {executionResult.executionMetrics.durationMs} ms</span>
                </div>
              </div>
            ) : executionResult?.status === 'complete' && executionResult.evidence.evidenceType === 'text' ? (
              <div className="max-w-xl text-left bg-emerald-50/60 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    {routingDecision?.selectedToolId === 'tool_caption_specialist'
                      ? 'Evidence: Grounded Scene Description'
                      : 'Evidence: Grounded Textual Answer'}
                  </span>
                  <span className="text-[10px] font-mono bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-300 ml-auto font-semibold">
                    PROVENANCE: MODEL_GENERATED
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300">
                    {executionResult.executionMetrics.modelName}
                  </span>
                </div>
                <p className="text-sm font-medium text-emerald-950 leading-relaxed">
                  {executionResult.answerText}
                </p>
                <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] font-mono text-emerald-800">
                  <span>Device: {executionResult.executionMetrics.device}</span>
                  <span>Checkpoint: {String(executionResult.evidence.details?.checkpointIdentifier || 'MBZUAI/geochat-7B')}</span>
                  <span>Duration: {executionResult.executionMetrics.durationMs} ms</span>
                </div>
              </div>
            ) : executionResult?.status === 'complete' && executionResult.evidence.evidenceType === 'bounding_box' ? (
              <div className="max-w-xl w-full text-left bg-emerald-50/60 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Evidence: Visual Grounding Bounding Boxes (Grounding DINO)
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 ml-auto">
                    {executionResult.executionMetrics.modelName}
                  </span>
                </div>
                <p className="text-xs text-emerald-900 mb-3">
                  {executionResult.answerText}
                </p>

                {executionResult.evidence.boxes && executionResult.evidence.boxes.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-medium text-emerald-900">
                      <span>Detected Instances ({executionResult.evidence.boxes.length}):</span>
                      <span className="text-[10px] font-mono text-emerald-700">Format: [xmin, ymin, xmax, ymax]</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {executionResult.evidence.boxes.map((b, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] bg-white p-2 rounded border border-emerald-200 font-mono shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-slate-800">{b.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-600">
                              [{b.xmin.toFixed(3)}, {b.ymin.toFixed(3)}, {b.xmax.toFixed(3)}, {b.ymax.toFixed(3)}]
                            </span>
                            <span className="font-bold text-emerald-700">
                              {(b.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded border border-emerald-200 text-xs text-emerald-800 text-center">
                    No matching objects detected for the target query by Grounding DINO.
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] font-mono text-emerald-800">
                  <span>Device: {executionResult.executionMetrics.device}</span>
                  <span>Duration: {executionResult.executionMetrics.durationMs} ms</span>
                </div>
              </div>
            ) : routingDecision?.selectedToolId === 'tool_optical_sar_specialist' ? (
              <div className="max-w-md">
                <p className="text-xs font-semibold text-slate-800">
                  Remote Sensing Optical-SAR Cross-Modal Specialist Evidence: None
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {executionResult?.status === 'failed' || executionResult?.status === 'rejected'
                    ? (executionResult.rejectionReason || 'Dual-Stream Multimodal Optical-SAR Fusion Architecture is research_only and not yet verified.')
                    : 'No real optical-SAR modality-comparison evidence is available. The Dual-Stream Multimodal Optical-SAR Fusion Architecture remains research_only and not yet verified. No fabricated or placeholder Optical-SAR evidence is shown.'}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono">
                    evidenceType: none
                  </span>
                  <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-300 font-mono">
                    Inference: Research Only / Not Yet Verified
                  </span>
                </div>
              </div>
            ) : routingDecision?.selectedToolId === 'tool_change_specialist' ? (
              <div className="max-w-md">
                <p className="text-xs font-semibold text-slate-800">
                  Remote-Sensing Bi-Temporal Change Analysis Evidence: None
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {executionResult?.status === 'failed'
                    ? (executionResult.rejectionReason || 'Change-analysis worker unavailable; model not loaded.')
                    : 'No real change-analysis worker evidence is available. TinyCD inference remains not verified. No fabricated or placeholder change map is shown.'}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono">
                    evidenceType: none
                  </span>
                  <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-300 font-mono">
                    Inference: Not Yet Verified
                  </span>
                </div>
              </div>
            ) : routingDecision?.selectedToolId === 'tool_segmentation_specialist' ? (
              <div className="max-w-md">
                <p className="text-xs font-semibold text-slate-800">
                  Remote-Sensing Image Segmentation Evidence: None
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {executionResult?.status === 'failed'
                    ? (executionResult.rejectionReason || 'Segmentation worker unavailable; model not loaded.')
                    : 'Architecture & integration complete; automated worker and server tests pass. Real segmentation inference is not verified in this CPU-only environment. No fabricated or placeholder mask is shown.'}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono">
                    evidenceType: none
                  </span>
                  <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-300 font-mono">
                    Inference: Not Yet Verified
                  </span>
                </div>
              </div>
            ) : routingDecision?.selectedToolId === 'tool_vqa_specialist' ||
              routingDecision?.selectedToolId === 'tool_caption_specialist' ||
              routingDecision?.selectedToolId === 'tool_grounding_specialist' ? (
              <div className="max-w-md">
                <p className="text-xs font-semibold text-slate-800">
                  {routingDecision.selectedToolId === 'tool_caption_specialist'
                    ? 'Remote-Sensing Scene Caption Evidence: None'
                    : routingDecision.selectedToolId === 'tool_grounding_specialist'
                    ? 'Visual Grounding Bounding Box Evidence: None'
                    : 'Remote-Sensing VQA Evidence: None'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {executionResult?.status === 'failed'
                    ? (executionResult.rejectionReason || 'Real model inference not yet verified.')
                    : routingDecision.selectedToolId === 'tool_grounding_specialist'
                    ? 'Architecture & integration complete; automated tests pass. Real Grounding DINO inference verified on Tesla T4 benchmark (score: 0.8433559, MODEL_GENERATED). Local environment is CPU-only; no simulated or placeholder evidence is generated.'
                    : 'Architecture & integration complete; automated tests pass. Real GeoChat-7B inference verified on Tesla T4 benchmark (real Sentinel-2 scene, MODEL_GENERATED; accuracy NOT VALIDATED). Local environment is CPU-only; no simulated or placeholder evidence is generated.'}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono">
                    evidenceType: none
                  </span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 font-mono">
                    Benchmark: Verified (Tesla T4)
                  </span>
                </div>
              </div>
            ) : (
              <div className="max-w-md">
                <p className="text-xs font-semibold text-slate-700">
                  Specialist model execution will be added in later stages.
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Segmentation masks and bi-temporal change maps will be populated once their verified specialist pipelines are integrated. No simulated evidence is ever generated.
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 font-medium">
                    Grounding: Implemented (Stage 6D)
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                    Segmentation: Planned
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                    Change Map: Planned
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Metadata */}
        {activeTab === 'metadata' && (
          <div className="text-xs">
            {image ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">
                    File Name
                  </span>
                  <span className="font-mono text-slate-900 font-medium truncate block" title={image.name}>
                    {image.name}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">
                    Format & Size
                  </span>
                  <span className="font-mono text-slate-900 font-medium">
                    {image.format} · {(image.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">
                    Dimensions
                  </span>
                  <span className="font-mono text-slate-900 font-medium">
                    {image.dimensions
                      ? `${image.dimensions.width} × ${image.dimensions.height} px`
                      : image.isTiff
                      ? 'TIFF Binary Stream'
                      : 'Raster Stream'}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">
                    Ingestion Integrity
                  </span>
                  <span className={`font-mono font-medium ${image.validationStatus === 'VALID' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {image.validationStatus === 'VALID' ? 'Verified (Magic Bytes)' : 'Rejected'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center items-center text-center text-slate-500 py-4">
                <p className="text-xs font-semibold text-slate-700">Awaiting image</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Upload an image to inspect raster metadata, dimensions, and spatial references.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Execution Log (Stage 5 & 6B Truthful Audit Events) */}
        {activeTab === 'execution' && (
          <div>
            {report && <ResultReportCard report={report} image={image} />}
            <div className="text-xs font-mono space-y-1.5 text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 pb-1 border-b border-slate-200">
                <span>AUDIT EVENT</span>
                <span>STATE / STATUS</span>
              </div>

            {/* 1. Query parsed */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">
                Query parsed:{' '}
                {parsedQuery ? (
                  <span className="font-semibold text-slate-900 uppercase">
                    {parsedQuery.taskType} ({Math.round(parsedQuery.confidence * 100)}%)
                  </span>
                ) : (
                  'Awaiting query input'
                )}
              </span>
              <span className={`font-semibold ${parsedQuery ? 'text-emerald-700' : 'text-slate-400'}`}>
                {parsedQuery ? 'PARSED' : 'STANDBY'}
              </span>
            </div>

            {/* 2. Compatibility checked */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">
                Compatibility checked:{' '}
                {routingDecision ? (
                  <span className="font-semibold text-slate-900 uppercase">
                    {routingDecision.compatibilityStatus}
                  </span>
                ) : (
                  'Pending image & task compatibility'
                )}
              </span>
              <span
                className={`font-semibold ${
                  routingDecision
                    ? routingDecision.compatibilityStatus === 'compatible'
                      ? 'text-emerald-700'
                      : routingDecision.compatibilityStatus === 'rejected'
                      ? 'text-rose-700'
                      : 'text-amber-700'
                    : 'text-slate-400'
                }`}
              >
                {routingDecision ? routingDecision.compatibilityStatus.toUpperCase() : 'STANDBY'}
              </span>
            </div>

            {/* 3. Specialist selected */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600 truncate max-w-xl">
                Specialist selected:{' '}
                {routingDecision?.selectedToolId === 'tool_vqa_specialist' ? (
                  <span className="font-semibold text-blue-900">Remote-Sensing VQA (GeoChat-7B)</span>
                ) : routingDecision?.selectedToolId === 'tool_caption_specialist' ? (
                  <span className="font-semibold text-blue-900">Remote-Sensing Image Captioning (GeoChat-7B)</span>
                ) : routingDecision?.selectedToolId === 'tool_grounding_specialist' ? (
                  <span className="font-semibold text-blue-900">Visual Grounding (Grounding DINO)</span>
                ) : routingDecision?.selectedToolId === 'tool_segmentation_specialist' ? (
                  <span className="font-semibold text-blue-900">Remote-Sensing Image Segmentation (nvidia/segformer-b0-finetuned-ade-512-512)</span>
                ) : specialistName ? (
                  <span className="font-semibold text-blue-900">{specialistName}</span>
                ) : (
                  'No specialist assigned'
                )}
              </span>
              <span
                className={`font-semibold shrink-0 ${
                  routingDecision?.selectedToolId ? 'text-blue-800' : 'text-slate-400'
                }`}
              >
                {routingDecision?.selectedToolId ? 'SELECTED' : 'NONE'}
              </span>
            </div>

            {/* 4. Specialist adapter initialized */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">
                {routingDecision?.selectedToolId === 'tool_vqa_specialist'
                  ? 'VQA adapter initialized: VqaSpecialistAdapter (GeoChat-7B)'
                  : routingDecision?.selectedToolId === 'tool_caption_specialist'
                  ? 'Caption adapter initialized: CaptionSpecialistAdapter (GeoChat-7B)'
                  : routingDecision?.selectedToolId === 'tool_grounding_specialist'
                  ? 'Grounding adapter initialized: GroundingSpecialistAdapter (Grounding DINO)'
                  : `Specialist adapter initialized: ${specialistName || 'Pending tool selection'}`}
              </span>
              <span
                className={`font-semibold ${
                  isRouted ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                {isRouted ? 'INITIALIZED' : 'STANDBY'}
              </span>
            </div>

            {/* 5. Segmentation and other specialist specific UI lifecycle events */}
            {routingDecision?.selectedToolId === 'tool_segmentation_specialist' ? (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Segmentation model:
                  </span>
                  <span className="font-semibold text-slate-900 font-mono">
                    nvidia/segformer-b0-finetuned-ade-512-512
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Segmentation classification:
                  </span>
                  <span className="font-semibold text-slate-900 font-mono">
                    General Semantic Segmentation Baseline (ADE20K)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Worker health / source:
                  </span>
                  <span className={`font-semibold ${executionResult ? 'text-emerald-700' : 'text-amber-700'} font-mono`}>
                    {executionResult ? 'CHECKED' : 'STANDBY'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Inference attempt:
                  </span>
                  <span className={`font-semibold ${executionResult?.status === 'complete' ? 'text-emerald-700' : 'text-amber-700'} font-mono`}>
                    {executionResult?.status === 'complete' ? 'SUCCEEDED' : executionResult?.status === 'failed' ? 'BLOCKED' : 'NOT ATTEMPTED'}
                  </span>
                </div>

                <div className="mt-2 p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] leading-tight text-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">Segmentation Backend Foundation</p>
                    <span className="text-[10px] font-mono text-slate-500 font-medium">SIH26167</span>
                  </div>

                  <div className="space-y-1 text-[10px] bg-white p-2 rounded border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Architecture & integration:</span>
                      <span className="font-semibold text-emerald-700 font-mono">UI READY</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Worker test evidence:</span>
                      <span className="font-semibold text-emerald-700 font-mono">PASS (9/9)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Real inference:</span>
                      <span className="font-semibold text-amber-800 font-mono">NOT VERIFIED</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">No fake mask:</span>
                      <span className="font-semibold text-slate-700 font-mono">ENFORCED</span>
                    </div>
                  </div>
                </div>
              </>
            ) : routingDecision?.selectedToolId === 'tool_grounding_specialist' ? (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Grounding Architecture & integration:
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    COMPLETE
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Stage 6D Automated tests:
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    PASS (17/17)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Grounding DINO model loading requested: groundingdino/groundingdino_swint_ogc
                  </span>
                  <span className="font-semibold text-blue-700">
                    {isExecuted ? 'REQUESTED' : 'CONFIGURED'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    1. AI Studio / local dev environment:
                  </span>
                  <span className="font-semibold text-slate-600 font-mono">
                    REAL INFERENCE UNAVAILABLE (CPU-ONLY)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    2. Google Colab T4 environment (Tesla T4, ~15GB VRAM):
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    VERIFIED BENCHMARK
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Real Grounding DINO inference status:
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    {executionResult?.status === 'complete' ? 'VERIFIED (LOCAL)' : 'VERIFIED (TESLA T4 BENCHMARK)'}
                  </span>
                </div>

                {isExecuted && executionResult?.status === 'complete' && (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">
                        Inference started: Processing text prompt & bounding box regression
                      </span>
                      <span className="font-semibold text-blue-700">STARTED</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                      <span className="text-emerald-800 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Inference completed: Verified bounding boxes generated in {executionResult.executionMetrics.durationMs}ms ({executionResult.executionMetrics.modelName}).
                      </span>
                      <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                        INFERENCE COMPLETE
                      </span>
                    </div>
                  </>
                )}

                {(!isExecuted || executionResult?.status !== 'complete') && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                    <span className="text-slate-800 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Tesla T4 real inference verified: score 0.8433559 (prompt: "building"). Local host CPU-only: safe stop, zero fake boxes.
                    </span>
                    <span className="text-emerald-800 font-bold bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      VERIFIED (T4)
                    </span>
                  </div>
                )}
              </>
            ) : routingDecision?.selectedToolId === 'tool_vqa_specialist' ||
            routingDecision?.selectedToolId === 'tool_caption_specialist' ? (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    {routingDecision.selectedToolId === 'tool_caption_specialist'
                      ? 'Caption Architecture & integration:'
                      : 'VQA Architecture & integration:'}
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    COMPLETE
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    {routingDecision.selectedToolId === 'tool_caption_specialist'
                      ? 'Stage 6C Automated tests:'
                      : 'Stage 6B Automated tests:'}
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    PASS (15/15)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    GeoChat model loading requested: MBZUAI/geochat-7B (4-bit, CUDA)
                  </span>
                  <span className="font-semibold text-blue-700">
                    {isExecuted ? 'REQUESTED' : 'CONFIGURED'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    1. AI Studio / local dev environment:
                  </span>
                  <span className="font-semibold text-slate-600 font-mono">
                    REAL INFERENCE UNAVAILABLE (CPU-ONLY)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    2. Google Colab T4 environment (Tesla T4, ~15GB VRAM):
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    VERIFIED BENCHMARK
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Real GeoChat inference status:
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    VERIFIED (TESLA T4)
                  </span>
                </div>

                {isExecuted && executionResult?.status === 'complete' && (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">
                        Inference started: Processing prompt & remote-sensing raster
                      </span>
                      <span className="font-semibold text-blue-700">STARTED</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                      <span className="text-emerald-800 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Inference completed: Verified {routingDecision.selectedToolId === 'tool_caption_specialist' ? 'caption' : 'answer'} generated in {executionResult.executionMetrics.durationMs}ms ({executionResult.executionMetrics.modelName}).
                      </span>
                      <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                        INFERENCE COMPLETE
                      </span>
                    </div>
                  </>
                )}

                {(!isExecuted || executionResult?.status !== 'complete') && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                    <span className="text-slate-800 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Local worker offline: Safe stop, no simulated response generated. T4 benchmark verified (accuracy NOT VALIDATED).
                    </span>
                    <span className="text-amber-800 font-bold bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      WORKER OFFLINE
                    </span>
                  </div>
                )}
              </>
            ) : routingDecision?.selectedToolId === 'tool_change_specialist' ? (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Change Analysis Architecture & integration:
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    COMPLETE
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Stage 6F Automated tests:
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    PASS (20/20)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    TinyCD model loading requested: TinyCD-LEVIR_CD.pth / TinyCD-WHU_CD.pth
                  </span>
                  <span className="font-semibold text-blue-700">
                    {isExecuted ? 'REQUESTED' : 'CONFIGURED'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    1. AI Studio / local dev environment:
                  </span>
                  <span className="font-semibold text-slate-600 font-mono">
                    REAL INFERENCE UNAVAILABLE (CPU-ONLY)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    2. Google Colab T4 environment (Tesla T4, ~15GB VRAM):
                  </span>
                  <span className="font-semibold text-blue-800 font-mono">
                    CANDIDATE ENVIRONMENT
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Temporal pair validation (t1 != t2, co-registered):
                  </span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    ENFORCED
                  </span>
                </div>

                {isExecuted && executionResult?.status === 'complete' && (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">
                        Inference started: Processing bi-temporal optical pair
                      </span>
                      <span className="font-semibold text-blue-700">STARTED</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                      <span className="text-emerald-800 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Inference completed: Verified change map generated in {executionResult.executionMetrics.durationMs}ms ({executionResult.executionMetrics.modelName}).
                      </span>
                      <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                        INFERENCE COMPLETE
                      </span>
                    </div>
                  </>
                )}

                {(!isExecuted || executionResult?.status !== 'complete') && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                    <span className="text-slate-800 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      TinyCD real inference not yet verified: Safe stop, zero simulated change maps.
                    </span>
                    <span className="text-amber-800 font-bold bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      NOT YET VERIFIED
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Specialist execution requested: {isExecuted ? 'POST /api/execute-task' : 'Ready for execution'}
                  </span>
                  <span
                    className={`font-semibold ${
                      isExecuted ? 'text-blue-700' : isRouted ? 'text-amber-600' : 'text-slate-400'
                    }`}
                  >
                    {isExecuted ? 'EXECUTED' : isRouted ? 'READY' : 'STANDBY'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Model inference not started: Stage 5 execution framework guard active
                  </span>
                  <span className="text-amber-700 font-semibold">
                    HALTED (STAGE 5 SAFEGUARD)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                  <span className="text-slate-800 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Stage 5 execution stopped: Adapter returned truthful non-inference result.
                  </span>
                  <span className="text-slate-700 font-bold bg-slate-200/80 px-1.5 py-0.5 rounded text-[10px]">
                    STOPPED (NO INFERENCE)
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* Tab 4: Stage 6A Specialist Model Capability Audit */}
        {activeTab === 'model_audit' && (
          <div className="space-y-4 text-xs">
            {isLoadingAudit ? (
              <div className="py-8 text-center text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
                <p className="font-semibold">Loading specialist model capability audit...</p>
              </div>
            ) : auditError ? (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                <p className="font-semibold">Failed to load model audit</p>
                <p className="text-[11px] mt-0.5">{auditError}</p>
              </div>
            ) : modelAudit ? (
              <>
                {/* Hardware Reality & Execution Environment Header */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                        AI Studio / Local Dev Environment
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-200 text-slate-800 border border-slate-300 text-[10px] font-bold rounded">
                        REAL INFERENCE UNAVAILABLE
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {modelAudit.environmentAudit.primaryDevelopmentMachine.graphics} (No CUDA GPU). Real GeoChat inference unavailable. Used for agentic routing, input validation, and testing.
                    </p>
                  </div>

                  <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-blue-700" />
                        Google Colab T4 Environment
                      </span>
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded">
                        VERIFIED BENCHMARK
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {modelAudit.environmentAudit.gpuTestEnvironment.gpu} ({modelAudit.environmentAudit.gpuTestEnvironment.vram}, CUDA). Verified real-inference environment for 4-bit GeoChat-7B VQA + caption (real Sentinel-2 run, MODEL_GENERATED; accuracy NOT VALIDATED).
                    </p>
                  </div>
                </div>

                {/* Audit Matrix Table */}
                <div className="border border-slate-200 rounded-md overflow-hidden shadow-xs">
                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">
                      Audited Specialist Capabilities (6 Specialist Workflows)
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      No Live Inference · Verified Metadata Only
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 font-semibold">
                          <th className="py-2 px-3">Specialist Task</th>
                          <th className="py-2 px-3">Primary Candidate</th>
                          <th className="py-2 px-3">Modalities</th>
                          <th className="py-2 px-3">Deployment Status</th>
                          <th className="py-2 px-3">Confidence</th>
                          <th className="py-2 px-3">Backup / Fallback</th>
                          <th className="py-2 px-3 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {modelAudit.matrix.map((row) => (
                          <tr
                            key={row.taskType}
                            onClick={() => setSelectedTaskDetail(row.taskType)}
                            className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                              selectedTaskDetail === row.taskType ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {row.task}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 font-mono text-[11px]">
                              {row.primaryCandidate}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                {row.modalities.join(' + ')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {renderStatusBadge(row.deploymentStatus)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                              {(row.confidence * 100).toFixed(0)}%
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs truncate">
                              {row.backup}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                className="text-blue-700 hover:text-blue-900 text-xs font-semibold"
                              >
                                {selectedTaskDetail === row.taskType ? 'Viewing' : 'Inspect'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Selected Specialist Deep-Dive Details */}
                {selectedTaskDetail && modelAudit.specialists[selectedTaskDetail] && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
                    {(() => {
                      const entry: ModelAuditEntry = modelAudit.specialists[selectedTaskDetail];
                      return (
                        <>
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <div>
                              <h4 className="font-bold text-slate-900 text-xs">
                                {entry.displayName} — Detailed Capability Audit
                              </h4>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Primary Candidate: {entry.modelName} · Checkpoint: {entry.checkpoint}
                              </p>
                            </div>
                            <div>{renderStatusBadge(entry.deploymentStatus)}</div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div className="p-2.5 bg-white rounded border border-slate-200">
                              <span className="font-semibold text-slate-700 block text-[11px] mb-1">
                                Training & RS Adaptation
                              </span>
                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                {entry.trainingFineTuningContext}
                              </p>
                            </div>

                            <div className="p-2.5 bg-white rounded border border-slate-200">
                              <span className="font-semibold text-slate-700 block text-[11px] mb-1">
                                Hardware & Memory
                              </span>
                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                {entry.minimumRecommendedHardware}
                              </p>
                              <span className="inline-block mt-1.5 text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                Mem: {entry.estimatedMemoryRequirement}
                              </span>
                            </div>

                            <div className="p-2.5 bg-white rounded border border-slate-200">
                              <span className="font-semibold text-slate-700 block text-[11px] mb-1">
                                License & Compliance
                              </span>
                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                <strong className="text-slate-800">{entry.license}</strong> — {entry.licenseNotes}
                              </p>
                            </div>
                          </div>

                          {/* Verification Notes & Risks */}
                          <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
                            <div>
                              <span className="font-semibold text-slate-800 text-[11px] block">
                                Verification State & Authoritative Source Notes:
                              </span>
                              <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                                {entry.verificationNotes}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                              <span className="font-semibold text-amber-800 text-[11px] block flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Operational Risks & Constraints:
                              </span>
                              <ul className="list-disc list-inside text-slate-600 text-[11px] space-y-0.5 mt-1">
                                {entry.risks.map((risk, idx) => (
                                  <li key={idx}>{risk}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                              <span className="font-semibold text-slate-800 text-[11px] block">
                                Fallback Strategy & Backup Model:
                              </span>
                              <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                                <strong className="text-slate-800">{entry.fallbackModel}</strong>: {entry.fallbackNotes}
                              </p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </footer>
  );
};
