import type { MediaKind } from "./types";

export type MediaJobStatus = "queued" | "processing" | "completed" | "failed";

export interface SelectableFace {
  id: number;
  label?: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceFrameIndex?: number;
  sourceX1?: number | null;
  sourceY1?: number | null;
  sourceX2?: number | null;
  sourceY2?: number | null;
}

export interface ReviewDetectionFace {
  id: number;
  label?: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ReviewDetectionFrame {
  frameIndex: number;
  time: number;
  faces: ReviewDetectionFace[];
}

export interface ReviewDetectionsResponse {
  width: number;
  height: number;
  fps: number;
  frames: ReviewDetectionFrame[];
}

export interface MediaJobResponse {
  jobId: string;
  status: MediaJobStatus;
  mediaKind: MediaKind;
  originalName: string | null;
  filename: string | null;
  mediaType: string;
  progress: number;
  processedFrames: number;
  totalFrames: number;
  downloadUrl: string | null;
  eventsUrl: string | null;
  reviewFrameUrl: string | null;
  reviewDetectionsUrl: string | null;
  reviewWidth: number;
  reviewHeight: number;
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  selectableFaces: SelectableFace[];
  error?: string | null;
}

export interface BatchResponse {
  batchId: string;
  jobs: MediaJobResponse[];
}
