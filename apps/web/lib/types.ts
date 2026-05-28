export type ProcessingMode = "blur" | "pixelate" | "redact";
export type FilterMode = "sensitive" | "balanced" | "strict";
export type MediaKind = "image" | "video";

export interface ProcessingRequest {
  mode: ProcessingMode;
  intensity: number;
  filterMode: FilterMode;
}

export interface ProcessedMediaResult {
  blob: Blob;
  filename: string;
}
