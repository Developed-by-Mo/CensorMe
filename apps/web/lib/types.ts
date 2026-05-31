export type ProcessingMode = "blur" | "pixelate" | "redact";
export type FilterMode = "sensitive" | "balanced" | "strict";
export type DetectorModel = "auto" | "yunet" | "haar";
export type MediaKind = "image" | "video";

export interface ProcessingRequest {
  mode: ProcessingMode;
  intensity: number;
  filterMode: FilterMode;
  detectorModel: DetectorModel;
  scoreThreshold: number;
  nmsThreshold: number;
  topK: number;
  detectEvery: number;
  useLandmarkFilter: boolean;
  minFacePixels: number;
}

export interface ProcessedMediaResult {
  blob: Blob;
  filename: string;
}
