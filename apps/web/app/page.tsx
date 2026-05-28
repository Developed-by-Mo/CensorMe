"use client";

import { useEffect, useState } from "react";

import { processMediaFile } from "@/lib/api";
import type { MediaKind, FilterMode, ProcessingMode } from "@/lib/types";
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

  return "image";
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedName, setProcessedName] = useState<string | null>(null);
  const [mode, setMode] = useState<ProcessingMode>("blur");
  const [intensity, setIntensity] = useState(30);
  const [filterMode, setFilterMode] = useState<FilterMode>("balanced");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaKind = detectKind(file);

  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setOriginalUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => {
    return () => {
      if (originalUrl) {
        URL.revokeObjectURL(originalUrl);
      }
      if (processedUrl) {
        URL.revokeObjectURL(processedUrl);
      }
    };
  }, [originalUrl, processedUrl]);

  const handleSelectFile = (nextFile: File | null) => {
    if (processedUrl) {
      URL.revokeObjectURL(processedUrl);
      setProcessedUrl(null);
      setProcessedName(null);
    }

    setError(null);
    setFile(nextFile);
  };

  const handleClear = () => {
    if (processedUrl) {
      URL.revokeObjectURL(processedUrl);
    }

    setFile(null);
    setOriginalUrl(null);
    setProcessedUrl(null);
    setProcessedName(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file) {
      setError("Choose an image or video before processing.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const result = await processMediaFile(file, {
        mode,
        intensity,
        filterMode,
      });

      if (processedUrl) {
        URL.revokeObjectURL(processedUrl);
      }

      setProcessedUrl(URL.createObjectURL(result.blob));
      setProcessedName(result.filename);
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

  return (
    <main className="page-shell">
      <section className="hero glass">
        <div>
          <p className="eyebrow">CensorMe</p>
          <h1>Protect privacy in media without slowing down the workflow.</h1>
          <p className="hero-copy">
            Upload an image or video, choose how you want faces censored, preview the output, and
            download the finished file from a clean web interface.
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
            <strong>YuNet + Haar fallback</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="stack">
          <UploadPanel
            file={file}
            mediaKind={mediaKind}
            onSelectFile={handleSelectFile}
            onClear={handleClear}
          />

          <ProcessingOptions
            mode={mode}
            intensity={intensity}
            filterMode={filterMode}
            onModeChange={setMode}
            onIntensityChange={setIntensity}
            onFilterModeChange={setFilterMode}
          />

          <section className="glass panel action-panel">
            <button className="primary-button large" type="button" onClick={handleProcess} disabled={!file || processing}>
              {processing ? "Processing..." : "Process media"}
            </button>
            <p className="helper-text">
              Settings are sent to the API as multipart form data. The result comes back as a downloadable file.
            </p>
          </section>
        </div>

        <PreviewPanel
          fileName={file?.name ?? null}
          mediaKind={mediaKind}
          originalUrl={originalUrl}
          processedUrl={processedUrl}
          processedName={processedName}
          processing={processing}
          error={error}
          onDownload={handleDownload}
        />
      </section>
    </main>
  );
}
