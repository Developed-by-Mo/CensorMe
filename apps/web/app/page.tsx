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
  if (!file) {
    return null;
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) {
    return "video";
  }

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
    setResults((current) => current.map((result) => (result.jobId === jobId ? { ...result, ...patch } : result)));
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
              const message = downloadError instanceof Error ? downloadError.message : "Download failed.";
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
        },
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
      const message = processError instanceof Error ? processError.message : "Processing failed.";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = processedUrl;
    anchor.download = processedName ?? "processed-media";
    anchor.click();
  };

  const handleDownloadResult = (result: BatchResultItem) => {
    if (!result.url) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = result.url;
    anchor.download = result.filename ?? "processed-media";
    anchor.click();
  };

  return (
    <main className="page-shell">
      <section className="hero glass">
        <div>
          <p className="eyebrow">CensorMe</p>
          <h1>Protect privacy in media without slowing down the workflow.</h1>
          <p className="hero-copy">
            Upload one file or a full batch, tune the detector, stream job progress, preview the output,
            and download every finished file from a clean web interface.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span>FastAPI backend</span>
            <strong>Service-based</strong>
          </div>
          <div className="stat-card">
            <span>Processing modes</span>
            <strong>Blur · Pixelate · Redact</strong>
          </div>
          <div className="stat-card">
            <span>Detection</span>
            <strong>YuNet · Haar · Auto</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
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
            <button className="primary-button large" type="button" onClick={handleProcess} disabled={files.length === 0 || processing}>
              {processing ? "Processing batch..." : "Process media"}
            </button>
            <p className="helper-text">
              Settings are sent to the API as multipart form data. Large videos stream progress while they run.
            </p>
          </section>
        </div>

        <div className="stack">
          <PreviewPanel
            fileName={firstFile?.name ?? null}
            mediaKind={previewKind}
            originalUrl={originalUrl}
            processedUrl={processedUrl}
            processedName={processedName}
            processing={processing && results.length === 0}
            error={error}
            onDownload={handleDownload}
          />

          <BatchResults results={results} onDownload={handleDownloadResult} />
        </div>
      </section>
    </main>
  );
}
