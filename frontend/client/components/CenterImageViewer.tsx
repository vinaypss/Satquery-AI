import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Crosshair, Compass, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { UploadedImageFile, BoundingBoxEvidence } from '../types/index.js';

interface SegmentationMaskOverlay {
  encoding: string;
  width: number;
  height: number;
  data: string;
}

interface ChangeMapOverlay {
  encoding: string;
  width: number;
  height: number;
  data: string;
}

interface CenterImageViewerProps {
  image: UploadedImageFile | null;
  boxes?: BoundingBoxEvidence[];
  segmentationMask?: SegmentationMaskOverlay | null;
  changeMap?: ChangeMapOverlay | null;
  modalityComparison?: Record<string, unknown> | null;
}

export const CenterImageViewer: React.FC<CenterImageViewerProps> = ({ image, boxes, segmentationMask, changeMap, modalityComparison }) => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const [imgLoadError, setImgLoadError] = useState(false);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 300));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => setZoomLevel(100);

  const isTiff = image?.isTiff || image?.format === 'TIFF' || image?.format === 'TIF';
  const hasErrors = image?.validationStatus === 'INVALID';
  const modalityComparisonObject = modalityComparison && typeof modalityComparison === 'object' && Object.keys(modalityComparison).length > 0
    ? modalityComparison as Record<string, unknown>
    : null;

  const modalityDisplayRows = modalityComparisonObject
    ? [
        ['optical modality', modalityComparisonObject.opticalModality],
        ['SAR modality', modalityComparisonObject.sarModality],
        ['model identity', modalityComparisonObject.modelIdentity || modalityComparisonObject.modelName],
        ['geographic correspondence', modalityComparisonObject.geographicCorrespondence],
        ['comparison details', modalityComparisonObject.comparisonDetails],
        ['inference status', modalityComparisonObject.inferenceStatus],
        ['confidence', modalityComparisonObject.confidence],
        ['metrics', modalityComparisonObject.metrics]
      ].filter(([, value]) => value !== undefined && value !== null && value !== '')
    : [];

  return (
    <main className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative select-none">
      {/* Top Viewer Toolbar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 flex-wrap z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 shrink-0">
            <Crosshair className="w-3.5 h-3.5 text-blue-700" />
            Satellite Viewport
          </span>
          {image && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded border truncate max-w-[180px] lg:max-w-[260px] ${
                hasErrors
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {image.name} ({image.format})
            </span>
          )}
        </div>

        {/* Viewport Controls */}
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded p-0.5">
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono font-medium text-slate-600 px-1.5 min-w-[42px] text-center">
            {zoomLevel}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-slate-300 mx-1" />
          <button
            type="button"
            onClick={handleResetZoom}
            title="Reset Zoom"
            className="p-1 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle GIS Grid"
            className={`p-1 rounded text-xs px-2 font-mono transition-colors ${
              showGrid ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            GRID
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative overflow-auto flex items-center justify-center p-6">
        {image ? (
          hasErrors ? (
            /* Validation Error Ingestion Display */
            <div className="w-full h-full max-w-xl max-h-[420px] border-2 border-dashed border-rose-300 rounded-lg flex flex-col items-center justify-center p-8 bg-rose-50/40 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center mb-3 text-rose-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-rose-900">
                Image Ingestion Rejected
              </h3>
              <p className="text-xs text-rose-700 mt-1 max-w-md">
                The uploaded file failed security and remote-sensing ingestion validation.
              </p>
              <div className="mt-4 w-full bg-white rounded border border-rose-200 p-3 text-left">
                <p className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider mb-1">
                  Validation Errors:
                </p>
                <ul className="list-disc list-inside text-xs text-rose-700 space-y-1">
                  {image.validationErrors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : isTiff || imgLoadError ? (
            /* TIFF / Specialized Raster Placeholder without fake conversion */
            <div className="w-full h-full max-w-xl max-h-[420px] border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center p-8 bg-white/80 gis-grid-pattern relative shadow-xs">
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mb-3 text-blue-700 shadow-xs">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                TIFF loaded — preview renderer unavailable
              </h3>
              <p className="text-xs text-slate-500 max-w-md text-center mt-1.5 leading-relaxed">
                Raw remote-sensing TIFF data preserved in memory without synthetic conversion. Native canvas decoding scheduled for specialized raster visualization stage.
              </p>
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-700 flex flex-col gap-1 w-full max-w-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">FORMAT:</span>
                  <span className="font-semibold">{image.format} (GeoTIFF / TIFF)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">PAYLOAD SIZE:</span>
                  <span>{(image.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">BINARY STATE:</span>
                  <span className="text-emerald-700 font-medium">PRESERVED (Base64)</span>
                </div>
              </div>
            </div>
          ) : (
            /* Standard Raster (PNG, JPEG, WEBP) Image View */
            <div
              className={`relative transition-transform duration-150 ease-out border border-slate-300 shadow-sm bg-black/5 rounded-xs overflow-hidden ${
                showGrid ? 'gis-grid-pattern' : ''
              }`}
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center center'
              }}
            >
              <img
                src={image.previewUrl}
                alt="Satellite Analysis Scene"
                className="max-h-[60vh] max-w-[50vw] object-contain block select-none pointer-events-none"
                onError={() => setImgLoadError(true)}
              />
              {/* Coordinate Crosshairs overlay */}
              <div className="absolute inset-0 pointer-events-none border border-blue-500/20">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-blue-500/20" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-blue-500/20" />
              </div>

              {/* Truthful segmentation mask overlay only when real segmentation evidence exists. */}
              {segmentationMask && segmentationMask.encoding === 'base64' && segmentationMask.data && (
                <div className="absolute inset-0 pointer-events-none">
                  <img
                    src={`data:image/png;base64,${segmentationMask.data}`}
                    alt="Segmentation mask overlay"
                    className="absolute inset-0 w-full h-full object-contain opacity-60 mix-blend-multiply"
                    onError={() => undefined}
                  />
                </div>
              )}

              {/* Truthful change-map overlay only when real change-analysis evidence exists. */}
              {changeMap && changeMap.encoding === 'base64' && changeMap.data && changeMap.width > 0 && changeMap.height > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  <img
                    src={`data:image/png;base64,${changeMap.data}`}
                    alt="Change map overlay"
                    className="absolute inset-0 w-full h-full object-contain opacity-70 mix-blend-multiply"
                    onError={() => undefined}
                  />
                </div>
              )}

              {/* Truthful Optical-SAR modality-comparison evidence overlay only when a validated modalityComparison object exists. */}
              {modalityComparisonObject && (
                <div className="absolute left-3 top-3 max-w-[280px] rounded border border-slate-300 bg-white/90 p-2 shadow-xs font-mono text-[10px] text-slate-800 pointer-events-none">
                  <div className="font-bold uppercase text-slate-800 border-b border-slate-200 pb-1 mb-1">
                    Optical-SAR Cross-Modal
                  </div>
                  <div className="space-y-1">
                    {modalityDisplayRows.map(([label, value], idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-slate-500 min-w-[110px]">{String(label)}:</span>
                        <span className="text-slate-900 break-words">
                          {typeof value === 'number'
                            ? String(value)
                            : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grounding Bounding Boxes Overlay */}
              {boxes && boxes.length > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {boxes.map((box, idx) => {
                    const left = `${box.xmin * 100}%`;
                    const top = `${box.ymin * 100}%`;
                    const width = `${(box.xmax - box.xmin) * 100}%`;
                    const height = `${(box.ymax - box.ymin) * 100}%`;
                    return (
                      <div
                        key={idx}
                        className="absolute border-2 border-amber-400 bg-amber-400/15 shadow-xs transition-all pointer-events-auto group"
                        style={{ left, top, width, height }}
                        title={`${box.label} (${(box.confidence ? box.confidence * 100 : 0).toFixed(1)}%)`}
                      >
                        <span className="absolute -top-5 left-0 bg-amber-500 text-slate-950 text-[10px] font-bold font-mono px-1 py-0.2 rounded-xs shadow-xs whitespace-nowrap">
                          {box.label} ({(box.confidence ? box.confidence * 100 : 0).toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        ) : (
          /* Empty State */
          <div className="w-full h-full max-w-2xl max-h-[500px] border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center p-8 bg-white/60 gis-grid-pattern relative">
            <div className="w-16 h-16 rounded-full border border-slate-300 flex items-center justify-center mb-4 text-slate-400 bg-white/80 shadow-xs">
              <Crosshair className="w-8 h-8 text-slate-400 stroke-1" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 tracking-tight">
              Awaiting Satellite Imagery
            </h3>
            <p className="text-xs text-slate-500 max-w-md text-center mt-1.5 leading-relaxed">
              Upload an optical, multispectral, or SAR satellite scene using the left workspace panel to activate visual analysis.
            </p>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-400 font-mono">
              <span>LAT: --°--'--&quot; N</span>
              <span>•</span>
              <span>LON: --°--'--&quot; E</span>
              <span>•</span>
              <span>RES: UNKNOWN</span>
            </div>
          </div>
        )}

        {/* North Compass Indicator */}
        <div className="absolute top-4 right-4 bg-white/90 border border-slate-300 rounded-md p-2 shadow-xs flex flex-col items-center text-slate-700 pointer-events-none">
          <Compass className="w-5 h-5 text-blue-700 mb-0.5" />
          <span className="text-[10px] font-bold tracking-widest text-slate-800">N</span>
        </div>
      </div>

      {/* Bottom Status bar */}
      <div className="bg-white border-t border-slate-200 px-3 sm:px-4 py-1.5 text-[11px] text-slate-600 font-mono flex items-center justify-between gap-x-4 gap-y-1 flex-wrap">
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
          <span className="hidden sm:inline">COORDINATE SYSTEM: WGS84 / EPSG:4326</span>
          {image?.dimensions && (
            <span>FRAME: {image.dimensions.width} × {image.dimensions.height} PX</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="hidden md:inline">PROJECTION: ORTHORECTIFIED</span>
          <span className={image && !hasErrors ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
            {image && !hasErrors ? 'INGESTION COMPLETE' : 'VIEWPORT READY'}
          </span>
        </div>
      </div>
    </main>
  );
};
