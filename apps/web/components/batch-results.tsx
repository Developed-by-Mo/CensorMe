"use client";

import { LiveFaceReview } from "@/components/live-face-review";
import type { MediaJobStatus, ReviewDetectionFrame, SelectableFace } from "@/lib/job-types";
import type { MediaKind } from "@/lib/types";

export interface BatchResultItem {
  jobId: string;
  originalName: string;
  mediaKind: MediaKind;
  status: MediaJobStatus;
  progress: number;
  processedFrames: number;
  totalFrames: number;
  filename: string | null;
  url: string | null;
  error: string | null;
  reviewFrameUrl: string | null;
  reviewDetectionsUrl: string | null;
  reviewWidth: number;
  reviewHeight: number;
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  reviewFrames: ReviewDetectionFrame[];
  selectableFaces: SelectableFace[];
  excludedFaceIds: number[];
}

interface BatchResultsProps {
  results: BatchResultItem[];
  onDownload: (result: BatchResultItem) => void;
  onToggleFace: (jobId: string, faceId: number) => void;
  onResetSelection: (jobId: string) => void;
  onApplySelection: (result: BatchResultItem) => void;
}

function statusLabel(status: MediaJobStatus): string {
  if (status === "queued") return "queued";
  if (status === "processing") return "processing";
  if (status === "completed") return "ready";
  return "failed";
}

function MediaPreview({ url, mediaKind }: { url: string; mediaKind: MediaKind }) {
  if (mediaKind === "video") {
    return <video src={url} controls playsInline className="batch-preview-media" />;
  }

  return <img src={url} alt="Processed preview" className="batch-preview-media" />;
}

export function BatchResults({
  results,
  onDownload,
  onToggleFace,
  onResetSelection,
  onApplySelection,
}: BatchResultsProps) {
  if (results.length === 0) return null;

  return (
    <section className="glass panel batch-panel">
      <div className="panel-heading">
        <p className="section-label">Preview &amp; review</p>
        <h2>Check every processed file before downloading</h2>
      </div>

      <div className="batch-list">
        {results.map((result) => {
          const hasSelection = result.selectableFaces.length > 0 && !!result.reviewFrameUrl;
          const excludedSet = new Set(result.excludedFaceIds);
          const censorCount = Math.max(0, result.selectableFaces.length - excludedSet.size);

          return (
            <article className="batch-item" key={result.jobId}>
              <div className="batch-item-header">
                <div className="batch-item-info">
                  <span className="batch-item-name">{result.originalName}</span>
                  <span className="batch-item-meta">
                    {result.mediaKind}
                    {result.totalFrames > 0 && ` · ${result.processedFrames}/${result.totalFrames} frames`}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <span className={`status-badge ${result.status}`}>
                    {statusLabel(result.status)} {result.progress > 0 && result.status !== "completed" ? `${result.progress}%` : ""}
                  </span>
                </div>
              </div>

              <div className="progress-track" aria-label={`${result.originalName} progress`}>
                <div className="progress-bar" style={{ width: `${result.progress}%` }} />
              </div>

              {result.url && !hasSelection && (
                <div className="batch-preview-frame">
                  <MediaPreview url={result.url} mediaKind={result.mediaKind} />
                </div>
              )}

              {hasSelection && (
                <div className="review-block">
                  <div className="review-copy-row">
                    <div>
                      <strong>Choose faces to keep uncensored</strong>
                      <p>
                        Scrub/play the preview, then click a box on the video or a face tile below. The face tiles keep a fixed usable size and scroll when there are many detections.
                      </p>
                    </div>
                    <span className="batch-item-meta">
                      Censor {censorCount}/{result.selectableFaces.length}
                    </span>
                  </div>

                  {result.url && (
                    <LiveFaceReview
                      mediaUrl={result.url}
                      mediaKind={result.mediaKind}
                      reviewFrameUrl={result.reviewFrameUrl}
                      reviewWidth={result.reviewWidth}
                      reviewHeight={result.reviewHeight}
                      selectableFaces={result.selectableFaces}
                      reviewFrames={result.reviewFrames}
                      videoWidth={result.videoWidth}
                      videoHeight={result.videoHeight}
                      videoFps={result.videoFps}
                      excludedFaceIds={excludedSet}
                      onToggleFace={(faceId) => onToggleFace(result.jobId, faceId)}
                    />
                  )}

                  <div className="face-legend">
                    <span className="face-legend-item censor">
                      <span className="face-legend-dot" />
                      Censor ({censorCount})
                    </span>
                    <span className="face-legend-item skip">
                      <span className="face-legend-dot" />
                      Keep uncensored ({excludedSet.size})
                    </span>
                    {excludedSet.size > 0 && (
                      <button className="ghost-button" type="button" onClick={() => onResetSelection(result.jobId)}>
                        Reset
                      </button>
                    )}
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => onApplySelection(result)}
                      disabled={result.status !== "completed" || excludedSet.size === 0}
                    >
                      Apply selection
                    </button>
                  </div>
                </div>
              )}

              {result.url && (
                <div className="download-approval-row">
                  <span className="helper-text">
                    Preview approved? Download this version or choose faces above and apply selection first.
                  </span>
                  <button className="primary-button" type="button" onClick={() => onDownload(result)}>
                    Download
                  </button>
                </div>
              )}

              {result.error && <p className="error-banner">{result.error}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
