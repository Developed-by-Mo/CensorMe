import type { MediaKind, ProcessedMediaResult, ProcessingRequest } from "./types";
import type { MediaJobResponse } from "./job-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function detectMediaKind(file: File): MediaKind {
  if (file.type.startsWith("video/")) {
    return "video";
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) {
    return "video";
  }

  return "image";
}

function extractFilename(response: Response, fallback: string): string {
  const header = response.headers.get("content-disposition");
  if (!header) {
    return fallback;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const fallbackMatch = header.match(/filename="?([^";]+)"?/i);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1];
  }

  return fallback;
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
  } catch {
    // Fall back to the HTTP status text.
  }

  return response.statusText || `Request failed with status ${response.status}`;
}

async function getJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function pollMediaJob(jobId: string): Promise<MediaJobResponse> {
  const response = await fetch(`${API_BASE_URL}/media/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return getJson<MediaJobResponse>(response);
}

async function waitForVideoJob(jobId: string): Promise<MediaJobResponse> {
  const startedAt = Date.now();
  const maxWaitMs = 30 * 60 * 1000;

  while (true) {
    const job = await pollMediaJob(jobId);

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error("Video processing timed out. Please try a shorter file.");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function downloadVideoResult(job: MediaJobResponse): Promise<ProcessedMediaResult> {
  if (!job.downloadUrl) {
    throw new Error("Video job did not return a download URL.");
  }

  const downloadPath = job.downloadUrl.startsWith("/") ? job.downloadUrl : `/${job.downloadUrl}`;
  const response = await fetch(`${API_BASE_URL}${downloadPath}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  return {
    blob,
    filename: extractFilename(response, "processed-video.mp4"),
  };
}

export async function processMediaFile(file: File, request: ProcessingRequest): Promise<ProcessedMediaResult> {
  const mediaKind = detectMediaKind(file);
  const endpoint = `${API_BASE_URL}/media/${mediaKind}`;
  const formData = new FormData();

  formData.append("file", file);
  formData.append("mode", request.mode);
  formData.append("intensity", String(request.intensity));
  formData.append("filter_mode", request.filterMode);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (mediaKind === "video" && isJsonResponse(response)) {
    const job = await getJson<MediaJobResponse>(response);
    const completedJob = await waitForVideoJob(job.jobId);

    if (completedJob.status === "failed") {
      throw new Error(completedJob.error || "Video processing failed.");
    }

    return downloadVideoResult(completedJob);
  }

  const blob = await response.blob();
  const filename = extractFilename(response, `processed-${file.name}`);

  return { blob, filename };
}
