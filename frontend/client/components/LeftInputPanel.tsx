import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileImage,
  X,
  AlertCircle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  HelpCircle,
  Satellite
} from 'lucide-react';
import { UploadedImageFile, ParsedQuery } from '../types/index.js';
import { STACDiscoveryModal } from './STACDiscoveryModal.js';

interface LeftInputPanelProps {
  image: UploadedImageFile | null;
  onImageSelect: (image: UploadedImageFile | null) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onAnalyzeClick: () => void;
  isAnalyzing: boolean;
  parsedQuery?: ParsedQuery | null;
  isParsingQuery?: boolean;
}

const SUPPORTED_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff'];
const SAMPLE_QUERIES = [
  'Where are the buildings?',
  'Describe this satellite image.',
  'Find the runway.',
  'Segment the roads.',
  'What changed between these two images?',
  'Compare optical and SAR imagery.'
];

export const LeftInputPanel: React.FC<LeftInputPanelProps> = ({
  image,
  onImageSelect,
  query,
  onQueryChange,
  onAnalyzeClick,
  isAnalyzing,
  parsedQuery,
  isParsingQuery
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSTACModalOpen, setIsSTACModalOpen] = useState(false);

  const processFile = async (file: File) => {
    setIsValidating(true);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isTiff = extension === 'tif' || extension === 'tiff' || file.type.includes('tiff');
    const previewUrl = URL.createObjectURL(file);

    // Initial local format check
    if (!SUPPORTED_FORMATS.includes(extension)) {
      onImageSelect({
        file,
        name: file.name,
        sizeBytes: file.size,
        format: extension ? extension.toUpperCase() : 'UNKNOWN',
        mimeType: file.type || 'application/octet-stream',
        dataUri: '',
        previewUrl,
        isTiff,
        validationStatus: 'INVALID',
        validationErrors: [
          `Unsupported format ".${extension || 'unknown'}". Supported formats: PNG, JPEG, WEBP, TIFF.`
        ],
        validationWarnings: []
      });
      setIsValidating(false);
      return;
    }

    // Read full file as Data URI to preserve original payload and run backend validation
    const reader = new FileReader();
    reader.onerror = () => {
      onImageSelect({
        file,
        name: file.name,
        sizeBytes: file.size,
        format: extension.toUpperCase(),
        mimeType: file.type || 'application/octet-stream',
        dataUri: '',
        previewUrl,
        isTiff,
        validationStatus: 'INVALID',
        validationErrors: ['Failed to read image file stream.'],
        validationWarnings: []
      });
      setIsValidating(false);
    };

    reader.onload = async () => {
      const dataUri = reader.result as string;

      // Extract image dimensions for raster formats where supported natively
      let dimensions: { width: number; height: number } | undefined;
      if (!isTiff) {
        try {
          const imgElement = new Image();
          await new Promise<void>((resolve) => {
            imgElement.onload = () => {
              dimensions = {
                width: imgElement.naturalWidth,
                height: imgElement.naturalHeight
              };
              resolve();
            };
            imgElement.onerror = () => resolve();
            imgElement.src = previewUrl;
          });
        } catch {
          // Non-blocking dimension check
        }
      }

      // Call Backend API: POST /api/validate-image
      try {
        const response = await fetch('/api/validate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || (isTiff ? 'image/tiff' : `image/${extension === 'jpg' ? 'jpeg' : extension}`),
            sizeBytes: file.size,
            dataUri
          })
        });

        const validationData = await response.json();

        if (validationData.valid) {
          onImageSelect({
            file,
            name: file.name,
            sizeBytes: file.size,
            format: extension.toUpperCase(),
            mimeType: file.type || (isTiff ? 'image/tiff' : `image/${extension}`),
            dataUri,
            previewUrl,
            isTiff,
            validationStatus: 'VALID',
            validationErrors: [],
            validationWarnings: validationData.warnings || [],
            dimensions
          });
        } else {
          onImageSelect({
            file,
            name: file.name,
            sizeBytes: file.size,
            format: extension.toUpperCase(),
            mimeType: file.type || 'application/octet-stream',
            dataUri,
            previewUrl,
            isTiff,
            validationStatus: 'INVALID',
            validationErrors: validationData.errors || ['Image failed server validation.'],
            validationWarnings: validationData.warnings || [],
            dimensions
          });
        }
      } catch {
        // Fallback local validation if server unreachable
        const localErrors: string[] = [];
        if (file.size > 25 * 1024 * 1024) {
          localErrors.push('File size exceeds 25 MB limit.');
        }

        onImageSelect({
          file,
          name: file.name,
          sizeBytes: file.size,
          format: extension.toUpperCase(),
          mimeType: file.type,
          dataUri,
          previewUrl,
          isTiff,
          validationStatus: localErrors.length === 0 ? 'VALID' : 'INVALID',
          validationErrors: localErrors,
          validationWarnings: ['Server validation endpoint was unreachable; evaluated locally.'],
          dimensions
        });
      } finally {
        setIsValidating(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const hasValidationErrors = image && image.validationStatus === 'INVALID';

  return (
    <aside className="w-80 lg:w-92 bg-white border-r border-slate-200 flex flex-col h-full overflow-y-auto select-none">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Input Workspace
        </span>
        <span className="text-[11px] text-slate-500 font-mono">STAGE 3 QUERY</span>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4">
        {/* Section 1: Satellite Image Upload */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <FileImage className="w-3.5 h-3.5 text-blue-700" />
              Remote Sensing Imagery
            </label>
            <span className="text-[10px] text-slate-500 uppercase">Max 25 MB · GeoTIFF / Raster</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.tif,.tiff,image/png,image/jpeg,image/webp,image/tiff"
            className="hidden"
            onChange={handleFileChange}
          />

          {!image ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-1.5 text-slate-600">
                {isValidating ? (
                  <Loader2 className="w-4 h-4 text-blue-700 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-slate-600" />
                )}
              </div>
              <p className="text-xs font-medium text-slate-800">
                {isValidating ? (
                  <span>Validating remote sensing payload...</span>
                ) : (
                  <>
                    Drag & drop imagery or <span className="text-blue-700 underline">browse</span>
                  </>
                )}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Supported: PNG, JPEG, WEBP, TIFF (up to 25 MB)
              </p>
            </div>
          ) : (
            <div
              className={`border rounded-md p-2.5 flex flex-col gap-2 ${
                image.validationStatus === 'VALID'
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-rose-300 bg-rose-50/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-9 h-9 rounded border border-slate-300 bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                    {!image.isTiff ? (
                      <img
                        src={image.previewUrl}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <FileImage className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate" title={image.name}>
                      {image.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {image.format} · {formatFileSize(image.sizeBytes)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onImageSelect(null)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-200 transition-colors"
                  title="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60">
                <span className="text-slate-600 font-medium">Ingestion Status:</span>
                {isValidating ? (
                  <span className="inline-flex items-center gap-1 text-blue-700 font-mono font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Validating...
                  </span>
                ) : image.validationStatus === 'VALID' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-mono font-medium">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    VALIDATED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-700 font-mono font-medium">
                    <AlertCircle className="w-3 h-3 text-rose-600" />
                    REJECTED
                  </span>
                )}
              </div>

              {image.dimensions && (
                <div className="text-[10px] font-mono text-slate-600 bg-white border border-slate-200 rounded px-2 py-0.5 flex justify-between">
                  <span>Raster Frame:</span>
                  <span>{image.dimensions.width} × {image.dimensions.height} px</span>
                </div>
              )}

              {image.isTiff && (
                <div className="text-[10px] text-slate-600 bg-blue-50/60 border border-blue-200 rounded px-2 py-0.5">
                  TIFF dataset ingested · Original binary preserved
                </div>
              )}

              {/* Validation Warnings */}
              {image.validationWarnings && image.validationWarnings.length > 0 && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    {image.validationWarnings.map((w, idx) => (
                      <p key={idx}>{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Errors */}
              {hasValidationErrors && image.validationErrors && image.validationErrors.length > 0 && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1 font-semibold text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Validation Failure:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5">
                    {image.validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Satellite Catalog Discovery Button */}
          <button
            type="button"
            onClick={() => setIsSTACModalOpen(true)}
            className="w-full mt-2 py-2 px-3 rounded-md border border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 text-blue-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
          >
            <Satellite className="w-3.5 h-3.5 text-blue-600" />
            <span>Search Copernicus STAC Catalog</span>
          </button>
        </div>

        {/* Section 2: Natural Language Query */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
            <span>Natural Language Query</span>
            <span className="text-[10px] font-mono text-slate-400">SIH26167</span>
          </label>
          <div className="relative">
            <textarea
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="E.g., Where are the buildings? Describe this satellite image. Segment the roads."
              rows={3}
              className="w-full p-2.5 text-xs text-slate-900 border border-slate-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-600 focus:border-blue-600 resize-none bg-white placeholder:text-slate-400 leading-relaxed font-sans"
            />
            {isParsingQuery && (
              <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-blue-700 font-mono bg-blue-50/90 px-1.5 py-0.5 rounded border border-blue-200">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Parsing...</span>
              </div>
            )}
          </div>

          {/* Structured Query Understanding Display */}
          {parsedQuery && (
            <div
              className={`rounded-md border p-2.5 text-xs font-sans transition-all ${
                parsedQuery.taskType === 'uncertain'
                  ? 'bg-amber-50/60 border-amber-300 text-amber-900'
                  : 'bg-blue-50/50 border-blue-200 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  {parsedQuery.taskType === 'uncertain' ? (
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                  )}
                  Parsed Task Understanding
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white border border-slate-200">
                  {Math.round(parsedQuery.confidence * 100)}% CONF
                </span>
              </div>

              {parsedQuery.taskType === 'uncertain' ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-slate-600">Task:</span>
                    <span className="font-mono font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded text-[11px]">
                      UNCERTAIN
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium">
                    Message: "Query is ambiguous. Please specify what you want to analyze."
                  </p>
                </div>
              ) : (
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600">Task:</span>
                    <span className="font-mono font-bold text-blue-800 bg-blue-100/80 px-1.5 py-0.5 rounded uppercase">
                      {parsedQuery.taskType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600">Target:</span>
                    <span className="font-mono text-slate-800 font-medium uppercase">
                      {parsedQuery.targetFeatures.length > 0
                        ? parsedQuery.targetFeatures.join(', ')
                        : 'None identified'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1 pt-1 border-t border-slate-200/80 leading-normal">
                    <span className="font-medium text-slate-700">Explanation:</span> {parsedQuery.explanation}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sample query prompt chips */}
          <div className="mt-1">
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Sample Queries
            </span>
            <div className="flex flex-wrap gap-1">
              {SAMPLE_QUERIES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onQueryChange(sample)}
                  className="text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 border border-slate-200 rounded px-2 py-0.5 text-left transition-colors whitespace-normal leading-tight"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Action Button */}
        <div className="pt-2 border-t border-slate-200 mt-auto">
          <button
            type="button"
            id="satquery-analyze-button"
            onClick={onAnalyzeClick}
            disabled={isAnalyzing || isValidating || hasValidationErrors}
            className={`w-full flex items-center justify-center gap-2 text-white text-xs font-semibold py-2.5 px-4 rounded shadow-xs transition-colors ${
              hasValidationErrors
                ? 'bg-slate-400 cursor-not-allowed opacity-60'
                : 'bg-blue-700 hover:bg-blue-800 active:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <span>Analyze</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <p className="text-[10px] text-slate-500 text-center mt-1.5 leading-normal">
            Stage 3: Query understanding active. Task and target parameters extracted for future routing.
          </p>
        </div>
      </div>

      <STACDiscoveryModal
        isOpen={isSTACModalOpen}
        onClose={() => setIsSTACModalOpen(false)}
        onSelectScene={onImageSelect}
      />
    </aside>
  );
};
