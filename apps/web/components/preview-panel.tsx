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

function ImagePlaceholder() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
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
  return (
    <div className="preview-grid">
      {/* Original */}
      <article className="glass panel preview-card">
        <div className="panel-heading">
          <p className="section-label">Original</p>
          <h2>{fileName ?? "No file selected"}</h2>
        </div>
        <div className="preview-frame">
          {originalUrl ? (
            <MediaPreview url={originalUrl} mediaKind={mediaKind} title="Original file preview" />
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ImagePlaceholder />
              </div>
              <span className="empty-state-label">Upload a file to preview</span>
            </div>
          )}
        </div>
      </article>

      {/* Result */}
      <article className="glass panel preview-card">
        <div className="panel-heading row-between">
          <div>
            <p className="section-label">Result</p>
            <h2>{processing ? "Processing…" : processedName ?? "Output"}</h2>
          </div>
          {processedUrl && (
            <button className="primary-button" type="button" onClick={onDownload}>
              Download
            </button>
          )}
        </div>

        <div className="preview-frame">
          {processedUrl ? (
            <MediaPreview url={processedUrl} mediaKind={mediaKind} title="Processed file preview" />
          ) : processing ? (
            <div className="processing-state">
              <div className="processing-ring" />
              <span className="processing-label">Censoring faces…</span>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ImagePlaceholder />
              </div>
              <span className="empty-state-label">Processed output appears here</span>
            </div>
          )}
        </div>

        {error && <p className="error-banner">{error}</p>}
      </article>
    </div>
  );
}
