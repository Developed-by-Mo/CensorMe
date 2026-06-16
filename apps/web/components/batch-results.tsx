"use client";

import type { MediaJobStatus } from "@/lib/job-types";
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
}

interface BatchResultsProps {
  results: BatchResultItem[];
  onDownload: (result: BatchResultItem) => void;
}

function statusLabel(status: MediaJobStatus): string {
  if (status === "queued") return "queued";
  if (status === "processing") return "processing";
  if (status === "completed") return "done";
  return "failed";
}

export function BatchResults({ results, onDownload }: BatchResultsProps) {
  if (results.length === 0) return null;

  return (
    <section className="glass panel batch-panel">
      <div className="panel-heading">
        <p className="section-label">Batch jobs</p>
        <h2>Progress &amp; downloads</h2>
      </div>

      <div className="batch-list">
        {results.map((result) => (
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
                {result.url && (
                  <button className="primary-button" type="button" onClick={() => onDownload(result)}>
                    Download
                  </button>
                )}
              </div>
            </div>

            <div className="progress-track" aria-label={`${result.originalName} progress`}>
              <div className="progress-bar" style={{ width: `${result.progress}%` }} />
            </div>

            {result.error && <p className="error-banner">{result.error}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
