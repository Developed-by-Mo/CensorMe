"use client";

import type { FilterMode, ProcessingMode } from "@/lib/types";

interface ProcessingOptionsProps {
  mode: ProcessingMode;
  intensity: number;
  filterMode: FilterMode;
  onModeChange: (mode: ProcessingMode) => void;
  onIntensityChange: (value: number) => void;
  onFilterModeChange: (mode: FilterMode) => void;
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

export function ProcessingOptions({
  mode,
  intensity,
  filterMode,
  onModeChange,
  onIntensityChange,
  onFilterModeChange,
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
    </section>
  );
}
