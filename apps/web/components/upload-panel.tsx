"use client";

import type { ChangeEvent } from "react";
import type { MediaKind } from "@/lib/types";

interface UploadPanelProps {
  files: File[];
  mediaKind: MediaKind | null;
  onSelectFiles: (files: File[]) => void;
  onClear: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="1" width="8" height="10" rx="1.5" stroke="#00c896" strokeWidth="1.2" fill="none"/>
      <path d="M8 1v3h3" stroke="#00c896" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M4 7h6M4 9h4" stroke="#00c896" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function UploadPanel({ files, mediaKind, onSelectFiles, onClear }: UploadPanelProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    onSelectFiles(nextFiles);
  };

  return (
    <section className="glass panel">
      <div className="panel-heading">
        <p className="section-label">Upload</p>
        <h2>Drop in your media</h2>
      </div>

      <label className="dropzone" htmlFor="censorme-upload">
        <input
          id="censorme-upload"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleChange}
        />
        <div className="dropzone-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 13V7M10 7L7.5 9.5M10 7L12.5 9.5" stroke="#00c896" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 14.5A3.5 3.5 0 0 1 4 7.5h.5A5 5 0 0 1 14.5 7c.17 0 .33.01.5.02A3 3 0 0 1 16 13" stroke="#00c896" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="dropzone-title">Choose files or drag &amp; drop</span>
        <span className="dropzone-copy">PNG · JPG · WEBP · MP4 · MOV · AVI · MKV</span>
      </label>

      {files.length > 0 ? (
        <div className="file-list">
          <div className="file-list-header">
            <span className="file-count-label">
              {files.length} file{files.length === 1 ? "" : "s"} · {mediaKind ?? "mixed"}
            </span>
            <button className="ghost-button" type="button" onClick={onClear}>
              Clear all
            </button>
          </div>
          {files.map((file) => (
            <div className="file-chip" key={`${file.name}-${file.size}-${file.lastModified}`}>
              <div className="file-chip-icon">
                <FileIcon />
              </div>
              <div className="file-chip-info">
                <span className="file-chip-name">{file.name}</span>
                <span className="file-chip-meta">{formatFileSize(file.size)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Your files are never uploaded to any server — processing runs entirely through your local API.
        </p>
      )}
    </section>
  );
}
