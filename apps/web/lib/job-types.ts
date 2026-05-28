export type MediaJobStatus = "queued" | "processing" | "completed" | "failed";

export interface MediaJobResponse {
  jobId: string;
  status: MediaJobStatus;
  downloadUrl: string | null;
  error?: string | null;
}
