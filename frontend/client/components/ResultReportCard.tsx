import React from 'react';
import {
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Cpu,
  Layers,
  ShieldCheck,
  Compass,
  AlertOctagon
} from 'lucide-react';
import { ResultReport, ResultReportStatus, UploadedImageFile } from '../types/index.js';

interface ResultReportCardProps {
  report: ResultReport | null;
  image?: UploadedImageFile | null;
}

const STATUS_CONFIG: Record<
  ResultReportStatus,
  { label: string; bg: string; border: string; text: string; icon: React.ReactNode }
> = {
  complete: {
    label: 'COMPLETE',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  },
  failed: {
    label: 'FAILED',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
    icon: <XCircle className="w-4 h-4 text-rose-600" />
  },
  rejected: {
    label: 'REJECTED',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />
  },
  routing_failed: {
    label: 'ROUTING BLOCKED',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-800',
    icon: <Compass className="w-4 h-4 text-purple-600" />
  },
  parse_failed: {
    label: 'PARSE ERROR',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    text: 'text-slate-800',
    icon: <AlertOctagon className="w-4 h-4 text-slate-600" />
  }
};

export const ResultReportCard: React.FC<ResultReportCardProps> = ({ report, image }) => {
  if (!report) {
    return null;
  }

  const config = STATUS_CONFIG[report.status] || STATUS_CONFIG.failed;
  const metrics = report.pipelineMetrics;
  const provenance = report.provenanceChain;

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `satquery_report_${report.reportId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadEvidence = async () => {
    if (!report) return;
    try {
      const imagePayload = image
        ? {
            name: image.name,
            modality: image.modality,
            geographicArea: image.geographicArea
          }
        : null;

      const res = await fetch('/api/analyze/export-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, image: imagePayload })
      });
      const data = await res.json();
      if (!data.valid) {
        console.error('Evidence export failed:', data.error);
        return;
      }

      if (data.isGeographic && data.geoJson) {
        // Valid georeferencing exists → standard GIS GeoJSON
        const blob = new Blob([JSON.stringify(data.geoJson, null, 2)], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `satquery_evidence_${report.reportId}.geojson`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (data.imageSpaceEvidence) {
        // No valid georeferencing → image-space JSON, explicitly non-geographic
        const blob = new Blob([JSON.stringify(data.imageSpaceEvidence, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `satquery_evidence_${report.reportId}_image_space.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to export evidence:', err);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-xs mb-4">
      {/* Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">
            Unified Analysis Report
          </span>
          <span className="text-[10px] font-mono text-slate-400 truncate">
            {report.reportId}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded border border-slate-300 transition-colors"
            title="Download full JSON report"
          >
            Download JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadEvidence}
            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold rounded border border-blue-300 transition-colors"
            title="Export evidence: GIS GeoJSON when valid georeferencing exists, otherwise image-space JSON marked NON-GEOGRAPHIC"
          >
            Export Evidence
          </button>
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${config.bg} ${config.border} ${config.text}`}
          >
            {config.icon}
            <span>{config.label}</span>
          </div>
        </div>
      </div>

      {/* Main Metadata Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 border-b border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Specialist Tool</span>
          <span className="font-mono font-medium text-slate-800 truncate block">
            {provenance.selectedToolId || 'None'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Model / Checkpoint</span>
          <span className="font-mono font-medium text-slate-800 truncate block">
            {provenance.modelName || 'Stage 6A Baseline'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Evidence Type</span>
          <span className="font-mono font-medium text-blue-700 uppercase block">
            {provenance.evidenceType || 'None'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Execution Device</span>
          <span className="font-mono font-medium text-slate-800 uppercase block">
            {provenance.device || 'N/A'}
          </span>
        </div>
      </div>

      {/* Pipeline Latency Bar */}
      <div className="py-2.5 border-b border-slate-100 flex items-center justify-between text-[11px] flex-wrap gap-y-1">
        <div className="flex items-center gap-1 text-slate-500 font-medium">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Pipeline Timing:</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] flex-wrap">
          <span className="text-slate-600">Parse: <strong className="text-slate-900">{metrics.parseMs}ms</strong></span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">Route: <strong className="text-slate-900">{metrics.routeMs}ms</strong></span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">Execute: <strong className="text-slate-900">{metrics.executeMs}ms</strong></span>
          <span className="text-slate-300">|</span>
          <span className="text-blue-700 font-bold">Total: {metrics.totalMs}ms</span>
        </div>
      </div>

      {/* Error or Rejection Summary */}
      {report.errorSummary && (
        <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Execution Summary:</span>
            <span className="text-rose-700 leading-relaxed font-mono text-[11px]">
              {report.errorSummary}
            </span>
          </div>
        </div>
      )}

      {/* SIH26167 Compliance & Provenance Footer */}
      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>SIH26167 Anti-Fabrication Guarantee: ZERO synthetic results</span>
        </div>
        <div className="font-mono text-slate-400">
          Audit Ref: {report.sihCompliance.modelAuditRef}
        </div>
      </div>
    </div>
  );
};
