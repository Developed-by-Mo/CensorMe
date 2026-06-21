import type { BatchResponse, MediaJobResponse, ReviewDetectionsResponse, SelectableFace } from "./job-types";
import type { MediaKind, ProcessedMediaResult, ProcessingRequest } from "./types";

function normalizeApiBaseUrl(value: string | undefined): string {
  const fallback = "http://127.0.0.1:8000/api";
  const raw = value?.trim() || fallback;
  return raw.replace(/\/+$/, "");
}

const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(
      `Could not connect to the CensorMe API at ${API_BASE_URL}. ` +
        "Make sure the FastAPI server is running on port 8000, then refresh the page. " +
        `Browser error: ${message}`
    );
  }
}

export function resolveApiUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

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

function appendRequestOptions(formData: FormData, request: ProcessingRequest): void {
  formData.append("mode", request.mode);
  formData.append("intensity", String(request.intensity));
  formData.append("filter_mode", request.filterMode);
  formData.append("detector_model", request.detectorModel);
  formData.append("score_threshold", String(request.scoreThreshold));
  formData.append("nms_threshold", String(request.nmsThreshold));
  formData.append("top_k", String(request.topK));
  formData.append("detect_every", String(request.detectEvery));
  formData.append("use_landmark_filter", String(request.useLandmarkFilter));
  formData.append("min_face_pixels", String(request.minFacePixels));
}

async function pollMediaJob(jobId: string): Promise<MediaJobResponse> {
  const response = await apiFetch(`${API_BASE_URL}/media/jobs/${jobId}`);
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

export async function downloadMediaJob(job: MediaJobResponse): Promise<ProcessedMediaResult> {
  const downloadUrl = resolveApiUrl(job.downloadUrl);
  if (!downloadUrl) {
    throw new Error("Media job did not return a download URL.");
  }

  const response = await apiFetch(downloadUrl);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  return {
    blob,
    filename: extractFilename(response, job.filename ?? "processed-media"),
  };
}

export async function processMediaFile(file: File, request: ProcessingRequest): Promise<ProcessedMediaResult> {
  const mediaKind = detectMediaKind(file);
  const endpoint = `${API_BASE_URL}/media/${mediaKind}`;
  const formData = new FormData();

  formData.append("file", file);
  appendRequestOptions(formData, request);

  const response = await apiFetch(endpoint, {
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

    return downloadMediaJob(completedJob);
  }

  const blob = await response.blob();
  const filename = extractFilename(response, `processed-${file.name}`);

  return { blob, filename };
}

export async function submitMediaBatch(files: File[], request: ProcessingRequest): Promise<BatchResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  appendRequestOptions(formData, request);

  const response = await apiFetch(`${API_BASE_URL}/media/batch`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return getJson<BatchResponse>(response);
}

export async function getReviewDetections(job: MediaJobResponse): Promise<ReviewDetectionsResponse | null> {
  const reviewUrl = resolveApiUrl(job.reviewDetectionsUrl);
  if (!reviewUrl) return null;

  const response = await apiFetch(reviewUrl);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return getJson<ReviewDetectionsResponse>(response);
}

export async function reprocessMediaJob(
  jobId: string,
  request: ProcessingRequest,
  excludedFaceIds: number[],
): Promise<MediaJobResponse> {
  const formData = new FormData();
  appendRequestOptions(formData, request);
  formData.append("excluded_face_ids", excludedFaceIds.join(","));

  const response = await apiFetch(`${API_BASE_URL}/media/jobs/${jobId}/reprocess`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return getJson<MediaJobResponse>(response);
}

export function subscribeToMediaJob(
  job: MediaJobResponse,
  onUpdate: (job: MediaJobResponse) => void,
  onError: (error: Error) => void,
): () => void {
  const eventsUrl = resolveApiUrl(job.eventsUrl);
  if (!eventsUrl) {
    onError(new Error("Media job did not return a progress stream URL."));
    return () => undefined;
  }

  const source = new EventSource(eventsUrl);

  source.onmessage = (event) => {
    const nextJob = JSON.parse(event.data) as MediaJobResponse;
    onUpdate(nextJob);

    if (nextJob.status === "completed" || nextJob.status === "failed") {
      source.close();
    }
  };

  source.onerror = () => {
    source.close();
    onError(new Error(`Lost connection to the progress stream at ${API_BASE_URL}. Make sure the FastAPI server is still running.`));
  };

  return () => source.close();
}

export interface FaceBox {
  id?: number;
  label?: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectResponse {
  width: number;
  height: number;
  faces: FaceBox[];
}

export async function detectFaces(
  file: File,
  options: Pick<ProcessingRequest, "filterMode" | "detectorModel" | "scoreThreshold" | "nmsThreshold" | "topK" | "useLandmarkFilter" | "minFacePixels">
): Promise<DetectResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("filter_mode", options.filterMode);
  formData.append("detector_model", options.detectorModel);
  formData.append("score_threshold", String(options.scoreThreshold));
  formData.append("nms_threshold", String(options.nmsThreshold));
  formData.append("top_k", String(options.topK));
  formData.append("use_landmark_filter", String(options.useLandmarkFilter));
  formData.append("min_face_pixels", String(options.minFacePixels));

  const response = await apiFetch(`${API_BASE_URL}/media/detect`, { method: "POST", body: formData });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<DetectResponse>;
}

export async function processImageSelective(
  file: File,
  request: ProcessingRequest,
  excludedIndices: number[]
): Promise<ProcessedMediaResult> {
  const formData = new FormData();
  formData.append("file", file);
  appendRequestOptions(formData, request);
  formData.append("excluded_indices", excludedIndices.join(","));

  const response = await apiFetch(`${API_BASE_URL}/media/image/selective`, { method: "POST", body: formData });
  if (!response.ok) throw new Error(await readErrorMessage(response));

  const blob = await response.blob();
  const filename = extractFilename(response, `processed-${file.name}`);
  return { blob, filename };
}

export type { SelectableFace };
