"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  detectFaces,
  downloadMediaJob,
  getReviewDetections,
  processImageSelective,
  reprocessMediaJob,
  resolveApiUrl,
  submitMediaBatch,
  subscribeToMediaJob,
  type FaceBox,
} from "@/lib/api";
import type { MediaJobResponse } from "@/lib/job-types";
import type { DetectorModel, FilterMode, MediaKind, ProcessingMode, ProcessingRequest } from "@/lib/types";
import { BatchResults, type BatchResultItem } from "@/components/batch-results";
import { FaceSelector } from "@/components/face-selector";
import { ProcessingOptions } from "@/components/processing-options";
import { PreviewPanel } from "@/components/preview-panel";
import { UploadPanel } from "@/components/upload-panel";

function detectKind(file: File | null): MediaKind | null {
  if (!file) return null;
  if (file.type.startsWith("video/")) return "video";
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  return "image";
}

function toResultItem(job: MediaJobResponse, excludedFaceIds: number[] = []): BatchResultItem {
  return {
    jobId: job.jobId,
    originalName: job.originalName ?? "uploaded-media",
    mediaKind: job.mediaKind,
    status: job.status,
    progress: job.progress,
    processedFrames: job.processedFrames,
    totalFrames: job.totalFrames,
    filename: job.filename,
    url: null,
    error: job.error ?? null,
    reviewFrameUrl: resolveApiUrl(job.reviewFrameUrl),
    reviewDetectionsUrl: resolveApiUrl(job.reviewDetectionsUrl),
    reviewWidth: job.reviewWidth ?? 0,
    reviewHeight: job.reviewHeight ?? 0,
    videoWidth: job.videoWidth ?? 0,
    videoHeight: job.videoHeight ?? 0,
    videoFps: job.videoFps ?? 0,
    reviewFrames: [],
    selectableFaces: job.selectableFaces ?? [],
    excludedFaceIds,
  };
}

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedName, setProcessedName] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<MediaKind | null>(null);

  // Face selection state for the single-image pre-process selector
  const [detectedFaces, setDetectedFaces] = useState<FaceBox[]>([]);
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  // Processing options
  const [mode, setMode] = useState<ProcessingMode>("blur");
  const [intensity, setIntensity] = useState(30);
  const [filterMode, setFilterMode] = useState<FilterMode>("balanced");
  const [detectorModel, setDetectorModel] = useState<DetectorModel>("auto");
  const [scoreThreshold, setScoreThreshold] = useState(0.55);
  const [nmsThreshold, setNmsThreshold] = useState(0.3);
  const [topK, setTopK] = useState(5000);
  const [detectEvery, setDetectEvery] = useState(4);
  const [useLandmarkFilter, setUseLandmarkFilter] = useState(true);
  const [minFacePixels, setMinFacePixels] = useState(14);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResultItem[]>([]);

  const objectUrlsRef = useRef<string[]>([]);
  const previewSetRef = useRef(false);

  const firstFile = files[0] ?? null;
  const mediaKind = useMemo(() => detectKind(firstFile), [firstFile]);
  const isImage = mediaKind === "image";
  const isBatch = files.length > 1;

  const buildRequest = (): ProcessingRequest => ({
    mode, intensity, filterMode, detectorModel,
    scoreThreshold, nmsThreshold, topK, detectEvery,
    useLandmarkFilter, minFacePixels,
  });

  useEffect(() => {
    if (!firstFile) {
      setOriginalUrl(null);
      setPreviewKind(null);
      setDetectedFaces([]);
      setExcludedIndices(new Set());
      return;
    }
    const nextUrl = URL.createObjectURL(firstFile);
    setOriginalUrl(nextUrl);
    setPreviewKind(detectKind(firstFile));
    setDetectedFaces([]);
    setExcludedIndices(new Set());
    return () => URL.revokeObjectURL(nextUrl);
  }, [firstFile]);

  // Auto-detect faces whenever a single image file is chosen.
  useEffect(() => {
    if (!firstFile || !isImage || isBatch) return;
    let cancelled = false;

    const run = async () => {
      setDetecting(true);
      setDetectError(null);
      try {
        const result = await detectFaces(firstFile, {
          filterMode, detectorModel, scoreThreshold,
          nmsThreshold, topK, useLandmarkFilter, minFacePixels,
        });
        if (!cancelled) {
          setDetectedFaces(result.faces);
          setExcludedIndices(new Set());
        }
      } catch (e) {
        if (!cancelled) setDetectError(e instanceof Error ? e.message : "Detection failed.");
      } finally {
        if (!cancelled) setDetecting(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [firstFile, isImage, isBatch, filterMode, detectorModel, scoreThreshold, nmsThreshold, topK, useLandmarkFilter, minFacePixels]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const registerObjectUrl = (url: string) => {
    objectUrlsRef.current.push(url);
    return url;
  };

  const clearResultUrls = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  const updateResult = (jobId: string, patch: Partial<BatchResultItem>) => {
    setResults((current) => current.map((result) => (result.jobId === jobId ? { ...result, ...patch } : result)));
  };

  const replaceResult = (oldJobId: string, nextResult: BatchResultItem) => {
    setResults((current) => current.map((result) => (result.jobId === oldJobId ? nextResult : result)));
  };

  const handleSelectFiles = (nextFiles: File[]) => {
    clearResultUrls();
    previewSetRef.current = false;
    setProcessedUrl(null);
    setProcessedName(null);
    setResults([]);
    setError(null);
    setFiles(nextFiles);
  };

  const handleClear = () => {
    clearResultUrls();
    previewSetRef.current = false;
    setFiles([]);
    setOriginalUrl(null);
    setProcessedUrl(null);
    setProcessedName(null);
    setPreviewKind(null);
    setResults([]);
    setError(null);
    setDetectedFaces([]);
    setExcludedIndices(new Set());
  };

  const handleToggleFace = (index: number) => {
    setExcludedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleToggleResultFace = (jobId: string, faceId: number) => {
    setResults((current) => current.map((result) => {
      if (result.jobId !== jobId) return result;
      const selected = new Set(result.excludedFaceIds);
      if (selected.has(faceId)) selected.delete(faceId);
      else selected.add(faceId);
      return { ...result, excludedFaceIds: Array.from(selected).sort((a, b) => a - b) };
    }));
  };

  const handleResetResultSelection = (jobId: string) => {
    updateResult(jobId, { excludedFaceIds: [] });
  };

  const waitForJob = (job: MediaJobResponse) => {
    return new Promise<void>((resolve) => {
      const close = subscribeToMediaJob(
        job,
        async (nextJob) => {
          updateResult(nextJob.jobId, {
            status: nextJob.status,
            progress: nextJob.progress,
            processedFrames: nextJob.processedFrames,
            totalFrames: nextJob.totalFrames,
            error: nextJob.error ?? null,
            reviewFrameUrl: resolveApiUrl(nextJob.reviewFrameUrl),
            reviewDetectionsUrl: resolveApiUrl(nextJob.reviewDetectionsUrl),
            reviewWidth: nextJob.reviewWidth ?? 0,
            reviewHeight: nextJob.reviewHeight ?? 0,
            videoWidth: nextJob.videoWidth ?? 0,
            videoHeight: nextJob.videoHeight ?? 0,
            videoFps: nextJob.videoFps ?? 0,
            selectableFaces: nextJob.selectableFaces ?? [],
          });

          if (nextJob.status === "completed") {
            close();
            try {
              const downloaded = await downloadMediaJob(nextJob);
              const review = nextJob.mediaKind === "video" ? await getReviewDetections(nextJob) : null;
              const url = registerObjectUrl(URL.createObjectURL(downloaded.blob));
              updateResult(nextJob.jobId, {
                status: "completed",
                progress: 100,
                filename: downloaded.filename,
                url,
                error: null,
                reviewFrameUrl: resolveApiUrl(nextJob.reviewFrameUrl),
                reviewDetectionsUrl: resolveApiUrl(nextJob.reviewDetectionsUrl),
                reviewWidth: nextJob.reviewWidth ?? 0,
                reviewHeight: nextJob.reviewHeight ?? 0,
                videoWidth: review?.width ?? nextJob.videoWidth ?? 0,
                videoHeight: review?.height ?? nextJob.videoHeight ?? 0,
                videoFps: review?.fps ?? nextJob.videoFps ?? 0,
                reviewFrames: review?.frames ?? [],
                selectableFaces: nextJob.selectableFaces ?? [],
              });

              if (!previewSetRef.current) {
                previewSetRef.current = true;
                setProcessedUrl(url);
                setProcessedName(downloaded.filename);
                setPreviewKind(nextJob.mediaKind);
              }
            } catch (downloadError) {
              const message = downloadError instanceof Error ? downloadError.message : "Download failed.";
              updateResult(nextJob.jobId, { status: "failed", error: message });
            }
            resolve();
          }
          if (nextJob.status === "failed") { close(); resolve(); }
        },
        (streamError) => {
          updateResult(job.jobId, { status: "failed", error: streamError.message });
          resolve();
        }
      );
    });
  };

  const handleProcess = async () => {
    if (files.length === 0) {
      setError("Choose at least one image or video before processing.");
      return;
    }

    setProcessing(true);
    setError(null);
    setProcessedUrl(null);
    setProcessedName(null);
    previewSetRef.current = false;

    try {
      // Single image: use the pre-process selector for faster one-file editing.
      if (isImage && !isBatch && firstFile) {
        const result = await processImageSelective(
          firstFile,
          buildRequest(),
          Array.from(excludedIndices)
        );
        const url = registerObjectUrl(URL.createObjectURL(result.blob));
        setProcessedUrl(url);
        setProcessedName(result.filename);
        setPreviewKind("image");
        return;
      }

      const batch = await submitMediaBatch(files, buildRequest());
      setResults(batch.jobs.map((job) => toResultItem(job)));
      await Promise.all(batch.jobs.map(waitForJob));
    } catch (processError) {
      const message = processError instanceof Error ? processError.message : "Processing failed.";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleApplyResultSelection = async (result: BatchResultItem) => {
    if (result.excludedFaceIds.length === 0) return;

    setProcessing(true);
    setError(null);

    try {
      const nextJob = await reprocessMediaJob(result.jobId, buildRequest(), result.excludedFaceIds);
      replaceResult(result.jobId, toResultItem(nextJob, result.excludedFaceIds));
      await waitForJob(nextJob);
    } catch (processError) {
      const message = processError instanceof Error ? processError.message : "Reprocessing failed.";
      setError(message);
      updateResult(result.jobId, { error: message });
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedUrl) return;
    const anchor = document.createElement("a");
    anchor.href = processedUrl;
    anchor.download = processedName ?? "processed-media";
    anchor.click();
  };

  const handleDownloadResult = (result: BatchResultItem) => {
    if (!result.url) return;
    const anchor = document.createElement("a");
    anchor.href = result.url;
    anchor.download = result.filename ?? "processed-media";
    anchor.click();
  };

  const censorCount = detectedFaces.length - excludedIndices.size;

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="logo-mark">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="5" width="14" height="10" rx="2" fill="#040f0c" opacity="0.9"/>
              <rect x="5" y="2" width="8" height="6" rx="1.5" fill="#040f0c" opacity="0.6"/>
              <circle cx="9" cy="10" r="2.5" fill="#040f0c"/>
            </svg>
          </div>
          <span className="logo-text">CensorMe</span>
          <span className="logo-sub">face privacy</span>
        </div>
        <div className="header-badge">
          <span className="status-dot" />
          API ready
        </div>
      </header>

      <div className="page-title-row">
        <h1 className="page-title">Protect faces, protect privacy.</h1>
        <p className="page-subtitle">
          Upload media, preview every processed result, remove any selected face box from censoring, then download the version you approve.
        </p>
      </div>

      <div className="workspace-grid">
        <div className="stack">
          <UploadPanel
            files={files}
            mediaKind={isBatch ? null : mediaKind}
            onSelectFiles={handleSelectFiles}
            onClear={handleClear}
          />

          <ProcessingOptions
            mode={mode}
            intensity={intensity}
            filterMode={filterMode}
            detectorModel={detectorModel}
            scoreThreshold={scoreThreshold}
            nmsThreshold={nmsThreshold}
            topK={topK}
            detectEvery={detectEvery}
            useLandmarkFilter={useLandmarkFilter}
            minFacePixels={minFacePixels}
            onModeChange={setMode}
            onIntensityChange={setIntensity}
            onFilterModeChange={setFilterMode}
            onDetectorModelChange={setDetectorModel}
            onScoreThresholdChange={setScoreThreshold}
            onNmsThresholdChange={setNmsThreshold}
            onTopKChange={setTopK}
            onDetectEveryChange={setDetectEvery}
            onUseLandmarkFilterChange={setUseLandmarkFilter}
            onMinFacePixelsChange={setMinFacePixels}
          />

          <section className="glass panel action-panel">
            {error && <p className="error-banner">{error}</p>}
            <button
              className="primary-button large"
              type="button"
              onClick={handleProcess}
              disabled={files.length === 0 || processing || detecting}
            >
              {processing
                ? "Processing…"
                : detecting
                ? "Detecting faces…"
                : isImage && !isBatch && detectedFaces.length > 0
                ? `Censor ${censorCount} of ${detectedFaces.length} face${detectedFaces.length !== 1 ? "s" : ""}`
                : "Censor faces"}
            </button>
            {isImage && !isBatch && detectedFaces.length > 0 && (
              <p className="helper-text">
                Click faces on the image to toggle whether they get censored.
                {excludedIndices.size > 0 && ` ${excludedIndices.size} face${excludedIndices.size !== 1 ? "s" : ""} will be kept uncensored.`}
              </p>
            )}
            {(!isImage || isBatch) && (
              <p className="helper-text">
                Videos and batches generate previews first. For videos, scrub the live preview and click a detected box or face tile to keep that face uncensored.
              </p>
            )}
          </section>
        </div>

        <div className="stack">
          {isImage && !isBatch && originalUrl && (
            <section className="glass panel">
              <div className="panel-heading">
                <p className="section-label">Select faces</p>
                <h2>
                  {detecting
                    ? "Scanning for faces…"
                    : detectError
                    ? "Detection failed"
                    : detectedFaces.length === 0
                    ? "No faces detected"
                    : `${detectedFaces.length} face${detectedFaces.length !== 1 ? "s" : ""} found — click to toggle`}
                </h2>
              </div>

              {detectError && <p className="error-banner" style={{ marginBottom: "12px" }}>{detectError}</p>}

              {detecting ? (
                <div className="processing-state" style={{ minHeight: "180px" }}>
                  <div className="processing-ring" />
                  <span className="processing-label">Scanning image…</span>
                </div>
              ) : (
                <FaceSelector
                  imageUrl={originalUrl}
                  faces={detectedFaces}
                  excludedIndices={excludedIndices}
                  mode={mode}
                  intensity={intensity}
                  onToggleFace={handleToggleFace}
                />
              )}

              {!detecting && detectedFaces.length > 0 && (
                <div className="face-legend">
                  <span className="face-legend-item censor">
                    <span className="face-legend-dot" />
                    Censor ({censorCount})
                  </span>
                  <span className="face-legend-item skip">
                    <span className="face-legend-dot" />
                    Keep uncensored ({excludedIndices.size})
                  </span>
                  {excludedIndices.size > 0 && (
                    <button
                      className="ghost-button"
                      type="button"
                      style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "4px 10px" }}
                      onClick={() => setExcludedIndices(new Set())}
                    >
                      Reset all
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <PreviewPanel
            fileName={firstFile?.name ?? null}
            mediaKind={previewKind}
            originalUrl={isImage && !isBatch ? null : originalUrl}
            processedUrl={results.length > 0 ? null : processedUrl}
            processedName={processedName}
            processing={processing && results.length === 0}
            error={null}
            onDownload={handleDownload}
          />

          <BatchResults
            results={results}
            onDownload={handleDownloadResult}
            onToggleFace={handleToggleResultFace}
            onResetSelection={handleResetResultSelection}
            onApplySelection={handleApplyResultSelection}
          />
        </div>
      </div>
    </main>
  );
}
