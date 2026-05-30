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
  if (status === "queued") return "Queued";
  if (status === "processing") return "Processing";
  if (status === "completed") return "Completed";
  return "Failed";
}

export function BatchResults({ results, onDownload }: BatchResultsProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <section className="glass panel batch-panel">
      <div className="panel-heading">
        <p className="eyebrow">05 · Batch jobs</p>
        <h2>Progress and downloads</h2>
      </div>

      <div className="batch-list">
        {results.map((result) => (
          <article className="batch-item" key={result.jobId}>
            <div className="batch-item-header">
              <div>
                <strong>{result.originalName}</strong>
                <span>
                  {result.mediaKind} · {statusLabel(result.status)} · {result.progress}%
                </span>
              </div>

              {result.url ? (
                <button className="primary-button" type="button" onClick={() => onDownload(result)}>
                  Download
                </button>
              ) : null}
            </div>

            <div className="progress-track" aria-label={`${result.originalName} progress`}>
              <div className="progress-bar" style={{ width: `${result.progress}%` }} />
            </div>

            {result.totalFrames > 0 ? (
              <p className="helper-text">
                {result.processedFrames} / {result.totalFrames} frames
              </p>
            ) : null}

            {result.error ? <p className="error-banner">{result.error}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
