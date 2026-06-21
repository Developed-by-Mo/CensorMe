"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FaceBox } from "@/lib/api";
import type { ProcessingMode } from "@/lib/types";

interface FaceSelectorProps {
  imageUrl: string;
  faces: FaceBox[];
  excludedIndices: Set<number>;
  mode: ProcessingMode;
  intensity: number;
  onToggleFace: (index: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function blurRadiusFromIntensity(intensity: number): number {
  return clamp(Math.round(intensity / 7), 2, 18);
}

function pixelBlockFromIntensity(intensity: number): number {
  return clamp(Math.round(intensity / 4), 6, 28);
}

export function FaceSelector({ imageUrl, faces, excludedIndices, mode, intensity, onToggleFace }: FaceSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1, scale: 1 });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) {
        setImage(img);
      }
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    const container = containerRef.current;
    const img = image;
    if (!container || !img) return;

    const updateSize = () => {
      const maxWidth = Math.max(1, container.clientWidth);
      const maxHeight = Math.max(240, Math.min(window.innerHeight * 0.6, 720));
      const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
      setCanvasSize({
        width: Math.max(1, Math.round(img.naturalWidth * scale)),
        height: Math.max(1, Math.round(img.naturalHeight * scale)),
        scale,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [image]);

  const faceEntries = useMemo(
    () => faces.map((face, index) => ({ face, id: face.id ?? index })),
    [faces]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = image;
    if (!canvas || !img) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const drawBlur = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
      const temp = document.createElement("canvas");
      temp.width = Math.max(1, sw);
      temp.height = Math.max(1, sh);
      const tempCtx = temp.getContext("2d");
      if (!tempCtx) return;
      tempCtx.filter = `blur(${blurRadiusFromIntensity(intensity)}px)`;
      tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, temp.width, temp.height);
      ctx.drawImage(temp, 0, 0, temp.width, temp.height, dx, dy, dw, dh);
    };

    const drawPixelate = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
      const pixelCanvas = document.createElement("canvas");
      const pixelCtx = pixelCanvas.getContext("2d");
      if (!pixelCtx) return;

      const block = pixelBlockFromIntensity(intensity);
      const smallW = Math.max(1, Math.round(sw / block));
      const smallH = Math.max(1, Math.round(sh / block));
      pixelCanvas.width = smallW;
      pixelCanvas.height = smallH;
      pixelCtx.imageSmoothingEnabled = false;
      pixelCtx.drawImage(img, sx, sy, sw, sh, 0, 0, smallW, smallH);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelCanvas, 0, 0, smallW, smallH, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = true;
    };

    faceEntries.forEach(({ face, id }) => {
      if (excludedIndices.has(id)) return;

      const sx = clamp(Math.round(face.x1), 0, img.naturalWidth - 1);
      const sy = clamp(Math.round(face.y1), 0, img.naturalHeight - 1);
      const sw = Math.max(1, Math.round(Math.min(img.naturalWidth - sx, face.x2 - face.x1)));
      const sh = Math.max(1, Math.round(Math.min(img.naturalHeight - sy, face.y2 - face.y1)));

      const dx = sx * canvasSize.scale;
      const dy = sy * canvasSize.scale;
      const dw = sw * canvasSize.scale;
      const dh = sh * canvasSize.scale;

      if (mode === "blur") {
        drawBlur(sx, sy, sw, sh, dx, dy, dw, dh);
      } else if (mode === "pixelate") {
        drawPixelate(sx, sy, sw, sh, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = "#000000";
        ctx.fillRect(dx, dy, dw, dh);
      }
    });

    faceEntries.forEach(({ face, id }, index) => {
      const excluded = excludedIndices.has(id);
      const x = face.x1 * canvasSize.scale;
      const y = face.y1 * canvasSize.scale;
      const w = (face.x2 - face.x1) * canvasSize.scale;
      const h = (face.y2 - face.y1) * canvasSize.scale;

      ctx.strokeStyle = excluded ? "rgba(0,200,150,0.92)" : "rgba(255,100,100,0.92)";
      ctx.fillStyle = excluded ? "rgba(0,200,150,0.12)" : "rgba(255,100,100,0.08)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x, y, w, h);

      const label = `Face ${index + 1} · ${excluded ? "Keep" : "Censor"}`;
      ctx.font = "600 12px Inter, sans-serif";
      const textWidth = ctx.measureText(label).width;
      const pillWidth = textWidth + 14;
      const pillHeight = 22;
      const pillX = clamp(x, 0, Math.max(0, canvas.width - pillWidth));
      const desiredY = y - pillHeight - 6;
      const pillY = desiredY >= 0 ? desiredY : Math.min(canvas.height - pillHeight, y + 6);

      ctx.fillStyle = excluded ? "rgba(0,200,150,0.98)" : "rgba(220,60,60,0.98)";
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 999);
      ctx.fill();
      ctx.fillStyle = excluded ? "#021f18" : "#ffffff";
      ctx.fillText(label, pillX + 7, pillY + 15);
    });
  }, [canvasSize.height, canvasSize.scale, canvasSize.width, excludedIndices, faceEntries, image, intensity, mode]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);

    for (let i = faceEntries.length - 1; i >= 0; i--) {
      const { face, id } = faceEntries[i];
      const x = face.x1 * canvasSize.scale;
      const y = face.y1 * canvasSize.scale;
      const w = (face.x2 - face.x1) * canvasSize.scale;
      const h = (face.y2 - face.y1) * canvasSize.scale;

      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        onToggleFace(id);
        break;
      }
    }
  };

  return (
    <div className="face-selector-root">
      <p className="helper-text" style={{ marginBottom: "10px" }}>
        Live preview: the image updates immediately as you toggle each face. Red means it will be censored. Green means it will stay visible.
      </p>
      <div ref={containerRef} className="face-selector-stage">
        <canvas ref={canvasRef} className="face-selector-canvas" onClick={handleClick} />
      </div>
    </div>
  );
}
