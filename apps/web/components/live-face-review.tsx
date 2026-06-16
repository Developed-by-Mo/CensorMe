"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewDetectionFrame, SelectableFace } from "@/lib/job-types";

interface FaceReviewProps {
  mediaUrl: string;
  mediaKind: "image" | "video";
  reviewFrameUrl: string | null;
  reviewWidth: number;
  reviewHeight: number;
  selectableFaces: SelectableFace[];
  reviewFrames: ReviewDetectionFrame[];
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  excludedFaceIds: Set<number>;
  onToggleFace: (faceId: number) => void;
}

type LoadedImageState = {
  original: HTMLImageElement | null;
  processed: HTMLImageElement | null;
};

function nearestFrame(frames: ReviewDetectionFrame[], time: number, fps: number): ReviewDetectionFrame | null {
  if (frames.length === 0) return null;

  let best = frames[0];
  let bestDistance = Math.abs(best.time - time);

  for (let i = 1; i < frames.length; i++) {
    const distance = Math.abs(frames[i].time - time);
    if (distance < bestDistance) {
      best = frames[i];
      bestDistance = distance;
    }
  }

  const tolerance = Math.max(0.75, 8 / Math.max(1, fps));
  return bestDistance <= tolerance ? best : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function fitWithin(width: number, height: number, maxWidth = 1280, maxHeight = 720): { width: number; height: number; scale: number } {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1, scale: 1 };
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function drawFaceOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  selected: boolean,
  label: string,
) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = selected ? "rgba(0, 200, 150, 0.95)" : "rgba(255, 100, 100, 0.95)";
  ctx.fillStyle = selected ? "rgba(0, 200, 150, 0.12)" : "rgba(255, 100, 100, 0.10)";
  ctx.strokeRect(x, y, width, height);
  ctx.fillRect(x, y, width, height);

  ctx.font = "600 12px Inter, sans-serif";
  const text = `${label} · ${selected ? "Keep" : "Censor"}`;
  const textWidth = ctx.measureText(text).width;
  const pillWidth = textWidth + 14;
  const pillHeight = 22;
  const pillX = clamp(x, 0, Math.max(0, ctx.canvas.width - pillWidth));
  const desiredY = y - pillHeight - 6;
  const pillY = desiredY >= 0 ? desiredY : Math.min(ctx.canvas.height - pillHeight, y + 6);

  ctx.fillStyle = selected ? "rgba(0, 200, 150, 0.98)" : "rgba(220, 60, 60, 0.98)";
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 999);
  ctx.fill();

  ctx.fillStyle = selected ? "#03231b" : "#ffffff";
  ctx.fillText(text, pillX + 7, pillY + 15);
  ctx.restore();
}

function FaceThumb({
  face,
  reviewFrameUrl,
  reviewWidth,
  reviewHeight,
  selected,
  onToggleFace,
}: {
  face: SelectableFace;
  reviewFrameUrl: string;
  reviewWidth: number;
  reviewHeight: number;
  selected: boolean;
  onToggleFace: (faceId: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    loadImage(reviewFrameUrl)
      .then((image) => {
        if (cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const sx = Math.max(0, face.x1);
        const sy = Math.max(0, face.y1);
        const sw = Math.max(1, Math.min(reviewWidth - sx, face.x2 - face.x1));
        const sh = Math.max(1, Math.min(reviewHeight - sy, face.y2 - face.y1));

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      })
      .catch(() => {
        // Ignore thumbnail load errors so the rest of the review UI still works.
      });

    return () => {
      cancelled = true;
    };
  }, [face, reviewFrameUrl, reviewWidth, reviewHeight]);

  return (
    <button
      type="button"
      className={`face-tile ${selected ? "skip" : "censor"}`}
      onClick={() => onToggleFace(face.id)}
      title={`${face.label ?? `Face ${face.id + 1}`} — ${selected ? "kept uncensored" : "censored"}`}
    >
      <canvas ref={canvasRef} width={160} height={120} className="face-tile-canvas" />
      <span className="face-tile-footer">
        <span>{face.label ?? `Face ${face.id + 1}`}</span>
        <span>{selected ? "Keep" : "Censor"}</span>
      </span>
    </button>
  );
}

function FaceTileGrid({
  reviewFrameUrl,
  reviewWidth,
  reviewHeight,
  selectableFaces,
  excludedFaceIds,
  onToggleFace,
}: {
  reviewFrameUrl: string | null;
  reviewWidth: number;
  reviewHeight: number;
  selectableFaces: SelectableFace[];
  excludedFaceIds: Set<number>;
  onToggleFace: (faceId: number) => void;
}) {
  if (!reviewFrameUrl || selectableFaces.length === 0) {
    return null;
  }

  return (
    <div className="face-tile-grid" aria-label="Selectable detected faces">
      {selectableFaces.map((face) => (
        <FaceThumb
          key={face.id}
          face={face}
          reviewFrameUrl={reviewFrameUrl}
          reviewWidth={reviewWidth}
          reviewHeight={reviewHeight}
          selected={excludedFaceIds.has(face.id)}
          onToggleFace={onToggleFace}
        />
      ))}
    </div>
  );
}

function ImageLiveReview({
  originalUrl,
  processedUrl,
  reviewWidth,
  reviewHeight,
  selectableFaces,
  excludedFaceIds,
  onToggleFace,
}: {
  originalUrl: string;
  processedUrl: string;
  reviewWidth: number;
  reviewHeight: number;
  selectableFaces: SelectableFace[];
  excludedFaceIds: Set<number>;
  onToggleFace: (faceId: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<LoadedImageState>({ original: null, processed: null });
  const previewSize = useMemo(() => fitWithin(reviewWidth, reviewHeight, 1440, 900), [reviewWidth, reviewHeight]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadImage(originalUrl), loadImage(processedUrl)])
      .then(([original, processed]) => {
        if (!cancelled) {
          setImages({ original, processed });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages({ original: null, processed: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [originalUrl, processedUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const original = images.original;
    const processed = images.processed;
    if (!canvas || !original || !processed) return;

    canvas.width = previewSize.width;
    canvas.height = previewSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(processed, 0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / Math.max(1, reviewWidth);
    const scaleY = canvas.height / Math.max(1, reviewHeight);

    selectableFaces.forEach((face) => {
      const selected = excludedFaceIds.has(face.id);
      const sourceX = clamp(face.x1, 0, reviewWidth);
      const sourceY = clamp(face.y1, 0, reviewHeight);
      const sourceW = Math.max(1, Math.min(reviewWidth - sourceX, face.x2 - face.x1));
      const sourceH = Math.max(1, Math.min(reviewHeight - sourceY, face.y2 - face.y1));

      const drawX = sourceX * scaleX;
      const drawY = sourceY * scaleY;
      const drawW = sourceW * scaleX;
      const drawH = sourceH * scaleY;

      if (selected) {
        ctx.drawImage(original, sourceX, sourceY, sourceW, sourceH, drawX, drawY, drawW, drawH);
      }

      drawFaceOutline(ctx, drawX, drawY, drawW, drawH, selected, face.label ?? `Face ${face.id + 1}`);
    });
  }, [excludedFaceIds, images, previewSize.height, previewSize.width, reviewHeight, reviewWidth, selectableFaces]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;

    const previewScaleX = canvas.width / Math.max(1, reviewWidth);
    const previewScaleY = canvas.height / Math.max(1, reviewHeight);

    for (let i = selectableFaces.length - 1; i >= 0; i--) {
      const face = selectableFaces[i];
      const x = face.x1 * previewScaleX;
      const y = face.y1 * previewScaleY;
      const w = (face.x2 - face.x1) * previewScaleX;
      const h = (face.y2 - face.y1) * previewScaleY;

      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        onToggleFace(face.id);
        break;
      }
    }
  };

  return (
    <div className="live-image-review">
      <canvas
        ref={canvasRef}
        className="live-review-canvas"
        onClick={handleCanvasClick}
        aria-label="Live image review"
      />
    </div>
  );
}

function VideoLiveReview({
  mediaUrl,
  reviewFrames,
  videoWidth,
  videoHeight,
  videoFps,
  excludedFaceIds,
  onToggleFace,
}: {
  mediaUrl: string;
  reviewFrames: ReviewDetectionFrame[];
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  excludedFaceIds: Set<number>;
  onToggleFace: (faceId: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  const previewSize = useMemo(() => fitWithin(videoWidth, videoHeight, 1440, 900), [videoWidth, videoHeight]);
  const activeFrame = useMemo(() => nearestFrame(reviewFrames, currentTime, videoFps), [currentTime, reviewFrames, videoFps]);
  const visibleFaces = activeFrame?.faces ?? [];

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (canvas.width !== previewSize.width || canvas.height !== previewSize.height) {
      canvas.width = previewSize.width;
      canvas.height = previewSize.height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#05070c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const scaleX = canvas.width / Math.max(1, videoWidth);
    const scaleY = canvas.height / Math.max(1, videoHeight);

    visibleFaces.forEach((face) => {
      const x = face.x1 * scaleX;
      const y = face.y1 * scaleY;
      const width = Math.max(1, (face.x2 - face.x1) * scaleX);
      const height = Math.max(1, (face.y2 - face.y1) * scaleY);
      const selected = excludedFaceIds.has(face.id);
      drawFaceOutline(ctx, x, y, width, height, selected, face.label ?? `Face ${face.id + 1}`);
    });
  }, [activeFrame, excludedFaceIds, previewSize.height, previewSize.width, videoHeight, videoWidth, visibleFaces]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const sync = () => {
      setCurrentTime(video.currentTime || 0);
      draw();
    };

    const tick = () => {
      sync();
      if (!video.paused && !video.ended) {
        animationRef.current = window.requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    };

    const start = () => {
      setPlaying(true);
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      setPlaying(false);
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      sync();
    };

    const loadedMetadata = () => {
      setDuration(video.duration || 0);
      sync();
    };

    const loadedData = () => {
      sync();
    };

    video.addEventListener("loadedmetadata", loadedMetadata);
    video.addEventListener("loadeddata", loadedData);
    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    video.addEventListener("seeked", sync);
    video.addEventListener("timeupdate", sync);

    video.load();

    return () => {
      video.removeEventListener("loadedmetadata", loadedMetadata);
      video.removeEventListener("loadeddata", loadedData);
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("timeupdate", sync);
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mediaUrl, previewSize.height, previewSize.width, videoHeight, videoWidth]);

  useEffect(() => {
    draw();
  }, [currentTime, excludedFaceIds, activeFrame, previewSize.width, previewSize.height]);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      try {
        await video.play();
      } catch {
        // Autoplay/play promise failures are non-fatal here.
      }
    } else {
      video.pause();
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(event.target.value);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    draw();
  };

  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);

    const scaleX = canvas.width / Math.max(1, videoWidth);
    const scaleY = canvas.height / Math.max(1, videoHeight);

    for (let i = visibleFaces.length - 1; i >= 0; i--) {
      const face = visibleFaces[i];
      const x = face.x1 * scaleX;
      const y = face.y1 * scaleY;
      const width = (face.x2 - face.x1) * scaleX;
      const height = (face.y2 - face.y1) * scaleY;

      if (px >= x && px <= x + width && py >= y && py <= y + height) {
        onToggleFace(face.id);
        break;
      }
    }
  };

  return (
    <>
      <div className="live-video-review-canvas-shell">
        <video ref={videoRef} src={mediaUrl} playsInline preload="metadata" className="hidden-review-video" />
        <canvas
          ref={canvasRef}
          className="live-review-canvas"
          onClick={handleCanvasClick}
          aria-label="Live video review"
        />
      </div>

      <div className="review-controls" role="group" aria-label="Video review controls">
        <button className="review-control-button" type="button" onClick={togglePlayback}>
          {playing ? "Pause" : "Play"}
        </button>
        <span className="review-time-label">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <input
          className="review-range"
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(currentTime, Math.max(duration, 0.01))}
          onChange={handleSeek}
        />
        <button className="review-control-button secondary" type="button" onClick={handleToggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      <div className="visible-face-row">
        <span className="visible-face-label">Visible now</span>
        {visibleFaces.length === 0 ? (
          <span className="visible-face-empty">No sampled boxes at this exact moment. Scrub the preview to a detected frame.</span>
        ) : (
          visibleFaces.map((face) => {
            const selected = excludedFaceIds.has(face.id);
            return (
              <button
                key={face.id}
                type="button"
                className={`visible-face-chip ${selected ? "skip" : "censor"}`}
                onClick={() => onToggleFace(face.id)}
              >
                {face.label ?? `Face ${face.id + 1}`} · {selected ? "Keep" : "Censor"}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

export function LiveFaceReview({
  mediaUrl,
  mediaKind,
  reviewFrameUrl,
  reviewWidth,
  reviewHeight,
  selectableFaces,
  reviewFrames,
  videoWidth,
  videoHeight,
  videoFps,
  excludedFaceIds,
  onToggleFace,
}: FaceReviewProps) {
  return (
    <div className="live-review-stack">
      {mediaKind === "video" && reviewFrames.length > 0 ? (
        <VideoLiveReview
          mediaUrl={mediaUrl}
          reviewFrames={reviewFrames}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          videoFps={videoFps}
          excludedFaceIds={excludedFaceIds}
          onToggleFace={onToggleFace}
        />
      ) : null}

      {mediaKind === "image" && reviewFrameUrl ? (
        <ImageLiveReview
          originalUrl={reviewFrameUrl}
          processedUrl={mediaUrl}
          reviewWidth={reviewWidth}
          reviewHeight={reviewHeight}
          selectableFaces={selectableFaces}
          excludedFaceIds={excludedFaceIds}
          onToggleFace={onToggleFace}
        />
      ) : null}

      <FaceTileGrid
        reviewFrameUrl={reviewFrameUrl}
        reviewWidth={reviewWidth}
        reviewHeight={reviewHeight}
        selectableFaces={selectableFaces}
        excludedFaceIds={excludedFaceIds}
        onToggleFace={onToggleFace}
      />
    </div>
  );
}
