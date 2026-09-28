/**
 * Phase 4 Data Strategy: STAC Catalog Search & Scene Ingestion Types
 * SIH26167 | SatQuery AI | ISRO / Department of Space
 */

export type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export type ModalityType = 'OPTICAL' | 'SAR' | 'ALL';

export type SupportedCollection =
  | 'sentinel-2-l2a'
  | 'sentinel-2-l1c'
  | 'sentinel-1-grd'
  | 'sentinel-1-slc';

export interface CatalogSearchRequest {
  bbox: BBox;
  startDate: string;
  endDate: string;
  collections?: string[];
  modality?: ModalityType;
  maxCloudCover?: number;
  limit?: number;
}

export interface STACAssetSummary {
  href: string;
  type?: string;
  title?: string;
  roles?: string[];
}

export interface NormalizedCatalogItem {
  itemId: string;
  collection: string;
  modality: 'OPTICAL' | 'SAR';
  platform: string;
  acquisitionDateTime: string;
  bbox: BBox;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  cloudCover: number | null;
  spatialOverlapPct: number;
  thumbnailUrl: string | null;
  visualUrl: string | null;
  assets: Record<string, STACAssetSummary>;
  provider: string;
}

export interface CatalogSearchResponse {
  status: 'success' | 'no_results' | 'error';
  totalFound: number;
  returnedCount: number;
  results: NormalizedCatalogItem[];
  querySummary: {
    bbox: BBox;
    dateRange: {
      start: string;
      end: string;
    };
    collections: string[];
    modality: ModalityType;
    maxCloudCover?: number;
    executionTimeMs: number;
  };
  error?: string;
  details?: string[];
}

export interface CollectionMetadata {
  id: SupportedCollection;
  title: string;
  description: string;
  modality: 'OPTICAL' | 'SAR';
  spatialResolution: string;
  constellation: string;
  instruments: string[];
}
