import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header.js';
import { LeftInputPanel } from '../components/LeftInputPanel.js';
import { CenterImageViewer } from '../components/CenterImageViewer.js';
import { RightAnalysisPanel } from '../components/RightAnalysisPanel.js';
import { BottomEvidencePanel } from '../components/BottomEvidencePanel.js';
import { UploadedImageFile, ParsedQuery, RoutingDecisionResult, SpecialistOutput, ResultReport } from '../types/index.js';
import { Info, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

const SPECIALIST_LABELS: Record<string, string> = {
  'tool_vqa_specialist': 'Remote Sensing Visual Question Answering Specialist',
  'tool_caption_specialist': 'Remote Sensing Scene Captioning Specialist',
  'tool_grounding_specialist': 'Remote Sensing Visual Grounding Specialist',
  'tool_segmentation_specialist': 'Remote Sensing Semantic Segmentation Specialist',
  'tool_change_specialist': 'Remote Sensing Bi-Temporal Change Analysis Specialist',
  'tool_optical_sar_specialist': 'Remote Sensing Optical-SAR Cross-Modal Specialist'
};

const SPECIALIST_STATUS_LABELS: Record<string, string> = {
  'tool_vqa_specialist': 'GeoChat-7B VQA',
  'tool_caption_specialist': 'GeoChat-7B Caption',
  'tool_grounding_specialist': 'Grounding DINO',
  'tool_segmentation_specialist': 'General Semantic Segmentation Baseline (ADE20K)',
  'tool_change_specialist': 'TinyCD (Lightweight Bi-Temporal Change Detection)',
  'tool_optical_sar_specialist': 'Dual-Stream Multimodal Optical-SAR Fusion Architecture'
};

function createExecutionNotification(output: SpecialistOutput, selectedToolId: string | null): {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
} {
  if (!output) {
    return { type: 'info', message: 'Specialist model execution will be added in a later stage.' };
  }

  const hasEvidenceType = output.evidence?.evidenceType && output.evidence.evidenceType !== 'none';
  const actualEvidenceObject = output.evidence?.evidenceType === 'modality_comparison'
    ? output.evidence.modalityComparison
    : output.evidence?.evidenceType === 'bounding_box'
    ? output.evidence.boxes
    : output.evidence?.evidenceType === 'segmentation_mask'
    ? output.evidence.details?.mask
    : output.evidence?.evidenceType === 'change_map'
    ? output.evidence.details?.changeMap
    : output.evidence?.text || output.evidence?.caption || output.evidence?.details;

  if (output.status === 'complete') {
    if (!hasEvidenceType || !actualEvidenceObject) {
      return {
        type: 'warning',
        message: `${SPECIALIST_LABELS[selectedToolId || 'tool_vqa_specialist'] || 'Selected specialist'} returned a complete status without verified evidence.`
      };
    }

    const genericSpecialist = SPECIALIST_LABELS[selectedToolId || 'tool_vqa_specialist'] || 'Selected specialist';
    const modelName = SPECIALIST_STATUS_LABELS[selectedToolId || 'tool_vqa_specialist'] || 'Model';

    return {
      type: 'success',
      message: `${genericSpecialist}: ${modelName} returned validated ${output.evidence.evidenceType} evidence.`
    };
  }

  if (output.status === 'failed') {
    return {
      type: 'error',
      message: output.rejectionReason || `${SPECIALIST_LABELS[selectedToolId || 'tool_vqa_specialist'] || 'Specialist'} failed before model inference.`
    };
  }

  if (output.status === 'rejected') {
    return {
      type: 'warning',
      message: output.rejectionReason || `${SPECIALIST_LABELS[selectedToolId || 'tool_vqa_specialist'] || 'Specialist'} rejected the request.`
    };
  }

  return {
    type: 'info',
    message: `${SPECIALIST_LABELS[selectedToolId || 'tool_vqa_specialist'] || 'Selected specialist'} is unavailable or not yet verified.`
  };
}

export const WorkspacePage: React.FC = () => {
  const [image, setImage] = useState<UploadedImageFile | null>(null);
  const [query, setQuery] = useState<string>('');
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [routingDecision, setRoutingDecision] = useState<RoutingDecisionResult | null>(null);
  const [executionResult, setExecutionResult] = useState<SpecialistOutput | null>(null);
  const [report, setReport] = useState<ResultReport | null>(null);
  const [isParsingQuery, setIsParsingQuery] = useState<boolean>(false);
  const [isRouting, setIsRouting] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'evidence' | 'metadata' | 'execution' | 'model_audit'>('metadata');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  } | null>(null);

  // 1. Debounced Query Parser Trigger (Stage 3)
  useEffect(() => {
    const trimmed = query.trim();
    setExecutionResult(null);
    setReport(null);
    if (!trimmed) {
      setParsedQuery(null);
      setRoutingDecision(null);
      setIsParsingQuery(false);
      return;
    }

    setIsParsingQuery(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/parse-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed })
        });

        const data = await response.json();
        if (data.valid && data.parsedQuery) {
          setParsedQuery(data.parsedQuery);
        } else {
          setParsedQuery(null);
          setRoutingDecision(null);
        }
      } catch (err) {
        console.error('Failed to parse query via API:', err);
      } finally {
        setIsParsingQuery(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // 2. Agentic Task Routing Trigger (Stage 4)
  useEffect(() => {
    setExecutionResult(null);
    setReport(null);
    if (!parsedQuery) {
      setRoutingDecision(null);
      setIsRouting(false);
      return;
    }

    const fetchRouteDecision = async () => {
      setIsRouting(true);
      try {
        const imagesPayload = image && image.validationStatus === 'VALID'
          ? [
              {
                id: 'img-primary',
                name: image.name,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
                modality: image.modality || (image.name.toLowerCase().includes('sar') ? 'SAR' : 'OPTICAL'),
                acquisitionDate: image.acquisitionDate || '2024-05-12',
                geographicArea: image.geographicArea || 'Delhi'
              }
            ]
          : [];

        const response = await fetch('/api/route-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parsedQuery,
            images: imagesPayload
          })
        });

        const data = await response.json();
        if (data.valid && data.routingResult) {
          setRoutingDecision(data.routingResult);
        }
      } catch (err) {
        console.error('Failed to route task via API:', err);
      } finally {
        setIsRouting(false);
      }
    };

    fetchRouteDecision();
  }, [parsedQuery, image]);

  const handleAnalyzeClick = async () => {
    if (!image && !query.trim()) {
      setNotification({
        type: 'info',
        message: 'Please upload a remote-sensing image and enter a natural-language query.'
      });
      return;
    }

    if (!image) {
      setNotification({
        type: 'info',
        message: 'Please upload a remote-sensing image before initiating analysis.'
      });
      return;
    }

    // Stage 2 Validation Check
    if (image.validationStatus === 'INVALID') {
      setNotification({
        type: 'error',
        message: 'Input rejected — fix validation errors'
      });
      setActiveBottomTab('execution');
      return;
    }

    if (!query.trim()) {
      setNotification({
        type: 'info',
        message: 'Please enter a natural-language query or select a sample query.'
      });
      return;
    }

    // Stage 4 Routing & Compatibility Assessment
    if (routingDecision) {
      if (routingDecision.routingStatus === 'rejected') {
        setNotification({
          type: 'error',
          message: 'Request rejected — supplied imagery is incompatible with this task.'
        });
        setActiveBottomTab('execution');
        return;
      }

      if (routingDecision.routingStatus === 'uncertain') {
        setNotification({
          type: 'warning',
          message: 'Query is ambiguous. Please specify what you want to analyze.'
        });
        setActiveBottomTab('execution');
        return;
      }

      // Stage 5 Controlled Specialist Execution
      if (routingDecision.routingStatus === 'routed') {
        setExecutionResult(null);
        setReport(null);
        setNotification(null);
        setIsExecuting(true);
        try {
          const imagesPayload = [
            {
              id: 'img-primary',
              name: image.name,
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes,
              modality: image.modality || (image.name.toLowerCase().includes('sar') ? 'SAR' : 'OPTICAL'),
              acquisitionDate: image.acquisitionDate || '2024-05-12',
              geographicArea: image.geographicArea || 'Delhi',
              dataUri: image.dataUri
            }
          ];

          const response = await fetch('/api/execute-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              routingResult: routingDecision,
              parsedQuery,
              images: imagesPayload
            })
          });

          const data = await response.json();
          if (data.valid && data.output) {
            const output = data.output as SpecialistOutput;
            setExecutionResult(output);

            const notification = createExecutionNotification(output, routingDecision.selectedToolId);
            setNotification({
              type: notification.type,
              message: notification.message
            });
          } else {
            setExecutionResult(null);
            setNotification({
              type: 'info',
              message: 'Specialist execution returned no validated evidence object.'
            });
          }

          // Stage 7: Fetch unified ResultReport for integrated reporting
          try {
            const analyzeRes = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: query.trim(),
                images: imagesPayload
              })
            });
            const analyzeData = await analyzeRes.json();
            if (analyzeData.valid && analyzeData.report) {
              setReport(analyzeData.report as ResultReport);
            }
          } catch (reportErr) {
            console.warn('Unified analysis reporting non-fatal error:', reportErr);
          }
        } catch (err) {
          console.error('Specialist execution error:', err);
          setExecutionResult(null);
          setReport(null);
          setNotification({
            type: 'error',
            message: 'Failed to invoke specialist adapter.'
          });
        } finally {
          setIsExecuting(false);
          setActiveBottomTab('execution');
        }
        return;
      }
    }

    setNotification({
      type: 'info',
      message: 'Specialist model execution will be added in a later stage.'
    });
    setActiveBottomTab('execution');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 text-slate-900 overflow-hidden font-sans">
      {/* Header Bar */}
      <Header />

      {/* Notification Banner */}
      {notification && (
        <div
          className={`px-4 py-2 border-b flex items-center justify-between text-xs transition-all ${
            notification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : notification.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : notification.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-700 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-semibold px-2 py-0.5 rounded hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Middle Main Workspace (Left Input + Center Viewer + Right Inspector) */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0">
        <LeftInputPanel
          image={image}
          onImageSelect={(newImg) => {
            setImage(newImg);
            setExecutionResult(null);
            setReport(null);
            if (newImg) {
              setActiveBottomTab('metadata');
              if (newImg.validationStatus === 'INVALID') {
                setNotification({
                  type: 'error',
                  message: 'Input rejected — fix validation errors'
                });
              } else {
                setNotification(null);
              }
            }
          }}
          query={query}
          onQueryChange={setQuery}
          onAnalyzeClick={handleAnalyzeClick}
          isAnalyzing={isExecuting}
          parsedQuery={parsedQuery}
          isParsingQuery={isParsingQuery}
        />

        <CenterImageViewer
          image={image}
          boxes={
            executionResult?.evidence?.evidenceType === 'bounding_box'
              ? executionResult.evidence.boxes
              : undefined
          }
          segmentationMask={
            executionResult?.evidence?.evidenceType === 'segmentation_mask'
              ? (executionResult.evidence.details?.mask as {
                  encoding: string;
                  width: number;
                  height: number;
                  data: string;
                } | undefined)
              : undefined
          }
          changeMap={
            executionResult?.evidence?.evidenceType === 'change_map'
              ? (executionResult.evidence.details?.changeMask as {
                  encoding: string;
                  width: number;
                  height: number;
                  data: string;
                } | undefined)
              : undefined
          }
          modalityComparison={
            executionResult?.evidence?.evidenceType === 'modality_comparison'
              ? (executionResult.evidence.modalityComparison as Record<string, unknown> | undefined)
              : undefined
          }
        />

        <RightAnalysisPanel
          image={image}
          query={query}
          parsedQuery={parsedQuery}
          routingDecision={routingDecision}
          executionResult={executionResult}
          isParsingQuery={isParsingQuery}
          isRouting={isRouting}
          isExecuting={isExecuting}
        />
      </div>

      {/* Bottom Panel (Evidence, Metadata, Execution) */}
      <BottomEvidencePanel
        image={image}
        query={query}
        parsedQuery={parsedQuery}
        routingDecision={routingDecision}
        executionResult={executionResult}
        report={report}
        activeTab={activeBottomTab}
        onTabChange={setActiveBottomTab}
      />
    </div>
  );
};
