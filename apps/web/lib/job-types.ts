import type { MediaKind } from "./types";

export type MediaJobStatus = "queued" | "processing" | "completed" | "failed";

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
  error?: string | null;
}

export interface BatchResponse {
  batchId: string;
  jobs: MediaJobResponse[];
}
