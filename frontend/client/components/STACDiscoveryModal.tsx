import React, { useState } from 'react';
import {
  Satellite,
  Globe,
  Calendar,
  Search,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye
} from 'lucide-react';
import { UploadedImageFile } from '../types/index.js';

interface STACDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScene: (image: UploadedImageFile) => void;
}

const AOI_PRESETS = [
  {
    name: 'Bengaluru, India (Urban & Tech)',
    bbox: [77.50, 12.90, 77.70, 13.10]
  },
  {
    name: 'Sriharikota / SDSC SHAR (Spaceport)',
    bbox: [80.18, 13.65, 80.30, 13.78]
  },
  {
    name: 'New Delhi (NCR)',
    bbox: [77.10, 28.50, 77.30, 28.70]
  },
  {
    name: 'Mumbai (Coastal Port)',
    bbox: [72.78, 18.90, 72.95, 19.10]
  }
];

export const STACDiscoveryModal: React.FC<STACDiscoveryModalProps> = ({
  isOpen,
  onClose,
  onSelectScene
}) => {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [minLon, setMinLon] = useState(AOI_PRESETS[0].bbox[0]);
  const [minLat, setMinLat] = useState(AOI_PRESETS[0].bbox[1]);
  const [maxLon, setMaxLon] = useState(AOI_PRESETS[0].bbox[2]);
  const [maxLat, setMaxLat] = useState(AOI_PRESETS[0].bbox[3]);

  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-01-20');
  const [modality, setModality] = useState<'OPTICAL' | 'SAR'>('OPTICAL');
  const [maxCloudCover, setMaxCloudCover] = useState<number>(30);
  const [limit, setLimit] = useState<number>(6);

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePresetChange = (index: number) => {
    setSelectedPreset(index);
    if (index >= 0 && index < AOI_PRESETS.length) {
      const preset = AOI_PRESETS[index];
      setMinLon(preset.bbox[0]);
      setMinLat(preset.bbox[1]);
      setMaxLon(preset.bbox[2]);
      setMaxLat(preset.bbox[3]);
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const payload = {
        bbox: [Number(minLon), Number(minLat), Number(maxLon), Number(maxLat)],
        startDate: `${startDate}T00:00:00Z`,
        endDate: `${endDate}T23:59:59Z`,
        modality,
        collections: modality === 'OPTICAL' ? ['sentinel-2-l2a'] : ['sentinel-1-grd'],
        maxCloudCover: modality === 'OPTICAL' ? Number(maxCloudCover) : undefined,
        limit: Number(limit)
      };

      const res = await fetch('/api/catalog/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Error searching STAC: HTTP ${res.status}`);
      }

      setSearchResults(data.results || []);
    } catch (err: any) {
      setSearchError(err.message || 'Failed to query STAC catalog.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleIngestScene = async (item: any) => {
    const previewUrl = item.thumbnailUrl || item.visualUrl || '';
    const fakeFile = new File([''], `${item.itemId}.jpg`, { type: 'image/jpeg' });

    onSelectScene({
      file: fakeFile,
      name: `${item.itemId}.jpg`,
      sizeBytes: 1024 * 1024,
      format: 'JPEG',
      mimeType: 'image/jpeg',
      dataUri: previewUrl,
      previewUrl,
      isTiff: false,
      validationStatus: 'VALID',
      validationErrors: [],
      validationWarnings: [],
      modality: item.modality,
      acquisitionDate: item.acquisitionDateTime,
      geographicArea: `BBox: [${item.bbox.join(', ')}]`
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Satellite className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Copernicus STAC Satellite Discovery
              </h2>
              <p className="text-xs text-slate-500">
                Live Open-Access Ingestion via Copernicus Data Space Ecosystem (CDSE)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Controls & Results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Controls Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
            {/* Presets & BBox */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  Area of Interest (AOI) Preset
                </label>
                <select
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  {AOI_PRESETS.map((p, idx) => (
                    <option key={idx} value={idx}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-600 block mb-1">
                  Bounding Box Coordinates [minLon, minLat, maxLon, maxLat]
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={minLon}
                    onChange={(e) => setMinLon(Number(e.target.value))}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-mono text-slate-800 text-center"
                    placeholder="minLon"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={minLat}
                    onChange={(e) => setMinLat(Number(e.target.value))}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-mono text-slate-800 text-center"
                    placeholder="minLat"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={maxLon}
                    onChange={(e) => setMaxLon(Number(e.target.value))}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-mono text-slate-800 text-center"
                    placeholder="maxLon"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={maxLat}
                    onChange={(e) => setMaxLat(Number(e.target.value))}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-mono text-slate-800 text-center"
                    placeholder="maxLat"
                  />
                </div>
              </div>
            </div>

            {/* Date Range & Modality */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-center">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Modality
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setModality('OPTICAL')}
                      className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded border transition-colors ${
                        modality === 'OPTICAL'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Sentinel-2 (Optical)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModality('SAR')}
                      className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded border transition-colors ${
                        modality === 'SAR'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Sentinel-1 (SAR)
                    </button>
                  </div>
                </div>

                {modality === 'OPTICAL' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Max Cloud Cover
                      </label>
                      <span className="text-xs font-mono text-slate-500">{maxCloudCover}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={maxCloudCover}
                      onChange={(e) => setMaxCloudCover(Number(e.target.value))}
                      className="w-full cursor-pointer accent-blue-600"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Trigger */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Querying Copernicus CDSE STAC Endpoint: <code className="text-blue-700 font-mono">/v1/search</code>
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Querying Copernicus STAC...
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Search Satellite Scenes
                </>
              )}
            </button>
          </div>

          {/* Error Display */}
          {searchError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Query Failed: </span>
                {searchError}
              </div>
            </div>
          )}

          {/* Results Grid */}
          {searchResults && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Search Results ({searchResults.length} scenes found)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Ranked by Overlap % & Cloud Cover
                </span>
              </div>

              {searchResults.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <Satellite className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No matching scenes found</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Try broadening the date window or increasing the cloud cover threshold.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.map((item) => (
                    <div
                      key={item.itemId}
                      className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div>
                        {/* Thumbnail */}
                        <div className="h-36 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.itemId}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Satellite className="w-8 h-8 text-slate-400" />
                          )}
                          <div className="absolute top-2 right-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs ${
                                item.modality === 'OPTICAL'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-purple-600 text-white'
                              }`}
                            >
                              {item.modality}
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="p-3 space-y-1.5">
                          <h4
                            className="text-xs font-semibold text-slate-900 truncate"
                            title={item.itemId}
                          >
                            {item.itemId}
                          </h4>
                          <div className="text-[11px] text-slate-600 space-y-0.5">
                            <div className="flex justify-between">
                              <span>Acquired:</span>
                              <span className="font-mono text-slate-800">
                                {new Date(item.acquisitionDateTime).toLocaleDateString()}
                              </span>
                            </div>
                            {item.cloudCover !== null && (
                              <div className="flex justify-between">
                                <span>Cloud Cover:</span>
                                <span className="font-mono text-slate-800">
                                  {item.cloudCover.toFixed(1)}%
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span>AOI Overlap:</span>
                              <span className="font-mono text-emerald-700 font-semibold">
                                {item.spatialOverlapPct}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="p-3 border-t border-slate-100 bg-slate-50">
                        <button
                          onClick={() => handleIngestScene(item)}
                          className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Load into Workspace
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
