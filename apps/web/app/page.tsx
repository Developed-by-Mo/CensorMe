"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { downloadMediaJob, submitMediaBatch, subscribeToMediaJob } from "@/lib/api";
import type { MediaJobResponse } from "@/lib/job-types";
import type { DetectorModel, FilterMode, MediaKind, ProcessingMode } from "@/lib/types";
import { BatchResults, type BatchResultItem } from "@/components/batch-results";
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

function toResultItem(job: MediaJobResponse): BatchResultItem {
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
  };
}

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedName, setProcessedName] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<MediaKind | null>(null);
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

  useEffect(() => {
    if (!firstFile) {
      setOriginalUrl(null);
      setPreviewKind(null);
      return;
    }
    const nextUrl = URL.createObjectURL(firstFile);
    setOriginalUrl(nextUrl);
    setPreviewKind(detectKind(firstFile));
    return () => URL.revokeObjectURL(nextUrl);
  }, [firstFile]);

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
    setResults((current) =>
      current.map((r) => (r.jobId === jobId ? { ...r, ...patch } : r))
    );
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
          });

          if (nextJob.status === "completed") {
            close();
            try {
              const downloaded = await downloadMediaJob(nextJob);
              const url = registerObjectUrl(URL.createObjectURL(downloaded.blob));
              updateResult(nextJob.jobId, {
                status: "completed",
                progress: 100,
                filename: downloaded.filename,
                url,
                error: null,
              });
              if (!previewSetRef.current) {
                previewSetRef.current = true;
                setProcessedUrl(url);
                setProcessedName(downloaded.filename);
                setPreviewKind(nextJob.mediaKind);
              }
            } catch (downloadError) {
              const message =
                downloadError instanceof Error ? downloadError.message : "Download failed.";
              updateResult(nextJob.jobId, { status: "failed", error: message });
            }
            resolve();
          }

          if (nextJob.status === "failed") {
            close();
            resolve();
          }
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
      const batch = await submitMediaBatch(files, {
        mode,
        intensity,
        filterMode,
        detectorModel,
        scoreThreshold,
        nmsThreshold,
        topK,
        detectEvery,
        useLandmarkFilter,
        minFacePixels,
      });
      setResults(batch.jobs.map(toResultItem));
      await Promise.all(batch.jobs.map(waitForJob));
    } catch (processError) {
      const message =
        processError instanceof Error ? processError.message : "Processing failed.";
      setError(message);
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

  return (
    <main className="page-shell">
      {/* Header */}
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

      {/* Title */}
      <div className="page-title-row">
        <h1 className="page-title">Protect faces, protect privacy.</h1>
        <p className="page-subtitle">
          Upload images or videos, choose a censoring mode, and download your anonymised output — no data leaves your workflow.
        </p>
      </div>

      {/* Main workspace */}
      <div className="workspace-grid">
        {/* Left column: controls */}
        <div className="stack">
          <UploadPanel
            files={files}
            mediaKind={files.length > 1 ? null : mediaKind}
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
              disabled={files.length === 0 || processing}
            >
              {processing ? "Processing…" : "Censor faces"}
            </button>
            <p className="helper-text">
              Files are sent directly to the local API. Large videos stream their progress as they run.
            </p>
          </section>
        </div>

        {/* Right column: preview + batch */}
        <div className="stack">
          <PreviewPanel
            fileName={firstFile?.name ?? null}
            mediaKind={previewKind}
            originalUrl={originalUrl}
            processedUrl={processedUrl}
            processedName={processedName}
            processing={processing && results.length === 0}
            error={null}
            onDownload={handleDownload}
          />

          <BatchResults results={results} onDownload={handleDownloadResult} />
        </div>
      </div>
    </main>
  );
}
