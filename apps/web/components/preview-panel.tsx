"use client";

import type { MediaKind } from "@/lib/types";

interface PreviewPanelProps {
  fileName: string | null;
  mediaKind: MediaKind | null;
  originalUrl: string | null;
  processedUrl: string | null;
  processedName: string | null;
  processing: boolean;
  error: string | null;
  onDownload: () => void;
}

function MediaPreview({ url, mediaKind, title }: { url: string; mediaKind: MediaKind | null; title: string }) {
  if (mediaKind === "video") {
    return <video src={url} controls playsInline className="preview-media" />;
  }
  return <img src={url} alt={title} className="preview-media" />;
}

function PlaceholderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="22" height="18" rx="3" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.4"/>
      <circle cx="10" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.4" opacity="0.4"/>
      <path d="M3 20l6-5 4 4 3-3 9 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
    </svg>
  );
}

export function PreviewPanel({
  fileName, mediaKind, originalUrl, processedUrl, processedName,
  processing, error, onDownload,
}: PreviewPanelProps) {
  const showBoth = !!originalUrl && !!processedUrl;

  return (
    <div className="preview-grid">
      {/* Show original only for video/batch (for images the FaceSelector serves this role) */}
      {originalUrl && (
        <article className="glass panel preview-card">
          <div className="panel-heading">
            <p className="section-label">Original</p>
            <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {fileName ?? "No file selected"}
            </h2>
          </div>
          <div className="preview-frame">
            <MediaPreview url={originalUrl} mediaKind={mediaKind} title="Original file" />
          </div>
        </article>
      )}

      {/* Processed output */}
      {(processedUrl || processing || !originalUrl) && (
        <article className="glass panel preview-card">
          <div className="panel-heading row-between">
            <div style={{ minWidth: 0 }}>
              <p className="section-label">Result</p>
              <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {processing ? "Processing…" : processedName ?? (originalUrl ? "Output" : "No file selected")}
              </h2>
            </div>
            {processedUrl && (
              <button className="primary-button" type="button" onClick={onDownload} style={{ flexShrink: 0 }}>
                Download
              </button>
            )}
          </div>

          <div className="preview-frame">
            {processedUrl ? (
              <MediaPreview url={processedUrl} mediaKind={mediaKind} title="Processed output" />
            ) : processing ? (
              <div className="processing-state">
                <div className="processing-ring" />
                <span className="processing-label">Censoring faces…</span>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <PlaceholderIcon />
                </div>
                <span className="empty-state-label">
                  {originalUrl ? "Press 'Censor faces' to process" : "Upload a file to get started"}
                </span>
              </div>
            )}
          </div>

          {error && <p className="error-banner">{error}</p>}
        </article>
      )}
    </div>
  );
}
