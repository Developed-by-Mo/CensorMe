"use client";

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
  { value: "blur", label: "Blur", description: "Soft privacy masking" },
  { value: "pixelate", label: "Pixelate", description: "Editorial mosaic effect" },
  { value: "redact", label: "Redact", description: "Solid black censor blocks" },
];

const filterModes: Array<{ value: FilterMode; label: string }> = [
  { value: "sensitive", label: "Sensitive" },
  { value: "balanced", label: "Balanced" },
  { value: "strict", label: "Strict" },
];

const detectorModels: Array<{ value: DetectorModel; label: string; description: string }> = [
  { value: "auto", label: "Auto", description: "YuNet with Haar fallback" },
  { value: "yunet", label: "YuNet", description: "Neural face detector only" },
  { value: "haar", label: "Haar", description: "Classic OpenCV fallback" },
];

export function ProcessingOptions({
  mode,
  intensity,
  filterMode,
  detectorModel,
  scoreThreshold,
  nmsThreshold,
  topK,
  detectEvery,
  useLandmarkFilter,
  minFacePixels,
  onModeChange,
  onIntensityChange,
  onFilterModeChange,
  onDetectorModelChange,
  onScoreThresholdChange,
  onNmsThresholdChange,
  onTopKChange,
  onDetectEveryChange,
  onUseLandmarkFilterChange,
  onMinFacePixelsChange,
}: ProcessingOptionsProps) {
  return (
    <section className="glass panel">
      <div className="panel-heading">
        <p className="eyebrow">02 · Configure</p>
        <h2>Choose the censoring style</h2>
      </div>

      <div className="segmented-grid">
        {modes.map((item) => (
          <button
            key={item.value}
            className={`segmented-card ${mode === item.value ? "active" : ""}`}
            type="button"
            onClick={() => onModeChange(item.value)}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

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
          onChange={(event) => onIntensityChange(Number(event.target.value))}
        />
      </div>

      <div className="option-block">
        <div className="option-row">
          <span>Detection filter</span>
          <strong>{filterMode}</strong>
        </div>
        <div className="pill-row">
          {filterModes.map((item) => (
            <button
              key={item.value}
              className={`pill ${filterMode === item.value ? "active" : ""}`}
              type="button"
              onClick={() => onFilterModeChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="option-block">
        <div className="option-row">
          <span>Detector model</span>
          <strong>{detectorModel}</strong>
        </div>
        <div className="segmented-grid detector-grid">
          {detectorModels.map((item) => (
            <button
              key={item.value}
              className={`segmented-card ${detectorModel === item.value ? "active" : ""}`}
              type="button"
              onClick={() => onDetectorModelChange(item.value)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="option-block tuning-grid">
        <label>
          <span>Score threshold {scoreThreshold.toFixed(2)}</span>
          <input
            className="range"
            type="range"
            min={0.05}
            max={0.95}
            step={0.01}
            value={scoreThreshold}
            onChange={(event) => onScoreThresholdChange(Number(event.target.value))}
          />
        </label>

        <label>
          <span>NMS threshold {nmsThreshold.toFixed(2)}</span>
          <input
            className="range"
            type="range"
            min={0.05}
            max={0.9}
            step={0.01}
            value={nmsThreshold}
            onChange={(event) => onNmsThresholdChange(Number(event.target.value))}
          />
        </label>

        <label>
          <span>Detect every {detectEvery} frame{detectEvery === 1 ? "" : "s"}</span>
          <input
            className="range"
            type="range"
            min={1}
            max={30}
            step={1}
            value={detectEvery}
            onChange={(event) => onDetectEveryChange(Number(event.target.value))}
          />
        </label>

        <label>
          <span>Top K {topK}</span>
          <input
            className="range"
            type="range"
            min={100}
            max={20000}
            step={100}
            value={topK}
            onChange={(event) => onTopKChange(Number(event.target.value))}
          />
        </label>

        <label>
          <span>Minimum face size {minFacePixels}px</span>
          <input
            className="range"
            type="range"
            min={4}
            max={200}
            step={1}
            value={minFacePixels}
            onChange={(event) => onMinFacePixelsChange(Number(event.target.value))}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={useLandmarkFilter}
            onChange={(event) => onUseLandmarkFilterChange(event.target.checked)}
          />
          <span>Use YuNet landmark validation</span>
        </label>
      </div>
    </section>
  );
}
