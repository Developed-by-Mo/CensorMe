"use client";

import { useState } from "react";
import type { DetectorModel, FilterMode, ProcessingMode } from "@/lib/types";

interface ProcessingOptionsProps {
  mode: ProcessingMode;
  intensity: number;
  filterMode: FilterMode;
  detectorModel: DetectorModel;
  scoreThreshold: number;
  nmsThreshold: number;
  topK: number;
  detectEvery: number;
  useLandmarkFilter: boolean;
  minFacePixels: number;
  onModeChange: (mode: ProcessingMode) => void;
  onIntensityChange: (value: number) => void;
  onFilterModeChange: (mode: FilterMode) => void;
  onDetectorModelChange: (model: DetectorModel) => void;
  onScoreThresholdChange: (value: number) => void;
  onNmsThresholdChange: (value: number) => void;
  onTopKChange: (value: number) => void;
  onDetectEveryChange: (value: number) => void;
  onUseLandmarkFilterChange: (value: boolean) => void;
  onMinFacePixelsChange: (value: number) => void;
}

const modes: Array<{ value: ProcessingMode; label: string; description: string }> = [
  { value: "blur", label: "Blur", description: "Soft gaussian mask" },
  { value: "pixelate", label: "Pixelate", description: "Mosaic blocks" },
  { value: "redact", label: "Redact", description: "Solid black bar" },
];

const filterModes: Array<{ value: FilterMode; label: string }> = [
  { value: "sensitive", label: "Sensitive" },
  { value: "balanced", label: "Balanced" },
  { value: "strict", label: "Strict" },
];

const detectorModels: Array<{ value: DetectorModel; label: string; description: string }> = [
  { value: "auto", label: "Auto", description: "YuNet + Haar fallback" },
  { value: "yunet", label: "YuNet", description: "Neural detector" },
  { value: "haar", label: "Haar", description: "Classic OpenCV" },
];

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function ProcessingOptions({
  mode, intensity, filterMode, detectorModel,
  scoreThreshold, nmsThreshold, topK, detectEvery,
  useLandmarkFilter, minFacePixels,
  onModeChange, onIntensityChange, onFilterModeChange, onDetectorModelChange,
  onScoreThresholdChange, onNmsThresholdChange, onTopKChange, onDetectEveryChange,
  onUseLandmarkFilterChange, onMinFacePixelsChange,
}: ProcessingOptionsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className="glass panel">
      <div className="panel-heading">
        <p className="section-label">Configure</p>
        <h2>Censoring options</h2>
      </div>

      {/* Mode selector */}
      <div className="mode-grid">
        {modes.map((item) => (
          <button
            key={item.value}
            className={`mode-card${mode === item.value ? " active" : ""}`}
            type="button"
            onClick={() => onModeChange(item.value)}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

      {/* Intensity */}
      <div className="option-block">
        <div className="option-row">
          <span>Intensity</span>
          <strong>{intensity}</strong>
        </div>
        <input
          className="range"
          type="range"
          min={1}
          max={100}
          value={intensity}
          onChange={(e) => onIntensityChange(Number(e.target.value))}
        />
      </div>

      {/* Detection filter */}
      <div className="option-block">
        <div className="option-row">
          <span>Detection filter</span>
        </div>
        <div className="pill-row">
          {filterModes.map((item) => (
            <button
              key={item.value}
              className={`pill${filterMode === item.value ? " active" : ""}`}
              type="button"
              onClick={() => onFilterModeChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detector model */}
      <div className="option-block">
        <div className="option-row">
          <span>Detector model</span>
        </div>
        <div className="mode-grid" style={{ marginBottom: 0 }}>
          {detectorModels.map((item) => (
            <button
              key={item.value}
              className={`mode-card${detectorModel === item.value ? " active" : ""}`}
              type="button"
              onClick={() => onDetectorModelChange(item.value)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        className={`advanced-toggle${showAdvanced ? " open" : ""}`}
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        Advanced tuning
        <ChevronIcon />
      </button>

      {showAdvanced && (
        <div className="advanced-section tuning-grid">
          <label>
            <span>Score threshold — {scoreThreshold.toFixed(2)}</span>
            <input
              className="range"
              type="range"
              min={0.05} max={0.95} step={0.01}
              value={scoreThreshold}
              onChange={(e) => onScoreThresholdChange(Number(e.target.value))}
            />
          </label>

          <label>
            <span>NMS threshold — {nmsThreshold.toFixed(2)}</span>
            <input
              className="range"
              type="range"
              min={0.05} max={0.9} step={0.01}
              value={nmsThreshold}
              onChange={(e) => onNmsThresholdChange(Number(e.target.value))}
            />
          </label>

          <label>
            <span>Detect every {detectEvery} frame{detectEvery === 1 ? "" : "s"}</span>
            <input
              className="range"
              type="range"
              min={1} max={30} step={1}
              value={detectEvery}
              onChange={(e) => onDetectEveryChange(Number(e.target.value))}
            />
          </label>

          <label>
            <span>Top K — {topK.toLocaleString()}</span>
            <input
              className="range"
              type="range"
              min={100} max={20000} step={100}
              value={topK}
              onChange={(e) => onTopKChange(Number(e.target.value))}
            />
          </label>

          <label>
            <span>Minimum face — {minFacePixels}px</span>
            <input
              className="range"
              type="range"
              min={4} max={200} step={1}
              value={minFacePixels}
              onChange={(e) => onMinFacePixelsChange(Number(e.target.value))}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={useLandmarkFilter}
              onChange={(e) => onUseLandmarkFilterChange(e.target.checked)}
            />
            <span>Use YuNet landmark validation</span>
          </label>
        </div>
      )}
    </section>
  );
}
