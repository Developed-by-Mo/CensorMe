"use client";

import type { ChangeEvent } from "react";

import type { MediaKind } from "@/lib/types";

interface UploadPanelProps {
  file: File | null;
  mediaKind: MediaKind | null;
  onSelectFile: (file: File | null) => void;
  onClear: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPanel({ file, mediaKind, onSelectFile, onClear }: UploadPanelProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    onSelectFile(nextFile);
  };

  return (
    <section className="glass panel">
      <div className="panel-heading">
        <p className="eyebrow">01 · Upload</p>
        <h2>Drop in an image or video</h2>
      </div>

      <label className="dropzone" htmlFor="censorme-upload">
        <input
          id="censorme-upload"
          type="file"
          accept="image/*,video/*"
          onChange={handleChange}
        />
        <span className="dropzone-title">Choose a file</span>
        <span className="dropzone-copy">PNG, JPG, WEBP, MP4, MOV, AVI, MKV</span>
      </label>

      {file ? (
        <div className="file-chip-row">
          <div className="file-chip">
            <strong>{file.name}</strong>
            <span>
              {mediaKind ?? "media"} · {formatFileSize(file.size)}
            </span>
          </div>
          <button className="ghost-button" type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      ) : (
        <p className="helper-text">Your file never leaves the workflow until you press process.</p>
      )}
    </section>
  );
}
