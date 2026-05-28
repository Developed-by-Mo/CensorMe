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

export function PreviewPanel({
  fileName,
  mediaKind,
  originalUrl,
  processedUrl,
  processedName,
  processing,
  error,
  onDownload,
}: PreviewPanelProps) {
  return (
    <section className="preview-grid">
      <article className="glass panel preview-card">
        <div className="panel-heading">
          <p className="eyebrow">03 · Original</p>
          <h2>{fileName ?? "Waiting for a file"}</h2>
        </div>
        <div className="preview-frame">
          {originalUrl ? (
            <MediaPreview url={originalUrl} mediaKind={mediaKind} title="Original file preview" />
          ) : (
            <div className="empty-state">
              <span>No preview yet</span>
            </div>
          )}
        </div>
      </article>

      <article className="glass panel preview-card">
        <div className="panel-heading row-between">
          <div>
            <p className="eyebrow">04 · Result</p>
            <h2>{processing ? "Processing..." : processedName ?? "Ready to process"}</h2>
          </div>
          {processedUrl ? (
            <button className="primary-button" type="button" onClick={onDownload}>
              Download
            </button>
          ) : null}
        </div>

        <div className="preview-frame">
          {processedUrl ? (
            <MediaPreview url={processedUrl} mediaKind={mediaKind} title="Processed file preview" />
          ) : processing ? (
            <div className="empty-state">
              <span>Running CensorMe...</span>
            </div>
          ) : (
            <div className="empty-state">
              <span>Processed output will appear here</span>
            </div>
          )}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </article>
    </section>
  );
}
