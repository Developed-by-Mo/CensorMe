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

export function UploadPanel({ files, mediaKind, onSelectFiles, onClear }: UploadPanelProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    onSelectFiles(nextFiles);
  };

  return (
    <section className="glass panel">
      <div className="panel-heading">
        <p className="eyebrow">01 · Upload</p>
        <h2>Drop in images or videos</h2>
      </div>

      <label className="dropzone" htmlFor="censorme-upload">
        <input
          id="censorme-upload"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleChange}
        />
        <span className="dropzone-title">Choose one or more files</span>
        <span className="dropzone-copy">PNG, JPG, WEBP, MP4, MOV, AVI, MKV</span>
      </label>

      {files.length > 0 ? (
        <div className="file-list">
          <div className="file-chip-row">
            <div className="file-chip">
              <strong>{files.length} file{files.length === 1 ? "" : "s"} selected</strong>
              <span>{mediaKind ?? "mixed media"}</span>
            </div>
            <button className="ghost-button" type="button" onClick={onClear}>
              Clear
            </button>
          </div>

          {files.map((file) => (
            <div className="file-chip compact" key={`${file.name}-${file.size}-${file.lastModified}`}>
              <strong>{file.name}</strong>
              <span>{formatFileSize(file.size)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="helper-text">Your files never leave the workflow until you press process.</p>
      )}
    </section>
  );
}
