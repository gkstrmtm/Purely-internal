"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  heightClassName?: string;
  className?: string;
  canvasClassName?: string;
  hintClassName?: string;
  clearButtonClassName?: string;
  emptyLabel?: string;
  filledLabel?: string;
  borderColor?: string;
  backgroundColor?: string;
  textColor?: string;
  radiusPx?: number;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function SignaturePad({
  value,
  onChange,
  disabled = false,
  heightClassName = "h-40",
  className,
  canvasClassName,
  hintClassName,
  clearButtonClassName,
  emptyLabel = "Draw your signature above",
  filledLabel = "Signature captured",
  borderColor = "#e4e4e7",
  backgroundColor = "#ffffff",
  textColor = "#52525b",
  radiusPx = 16,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const drewStrokeRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const exportSignatureDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";

    const { width, height } = canvas;
    const imageData = context.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const alpha = imageData[index + 3] || 0;
        if (alpha === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return drewStrokeRef.current ? canvas.toDataURL("image/png") : "";
    }

    const padding = 16;
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(width - cropX, maxX - minX + 1 + padding * 2);
    const cropHeight = Math.min(height - cropY, maxY - minY + 1 + padding * 2);

    const maxExportWidth = 640;
    const maxExportHeight = 220;
    const scale = Math.min(1, maxExportWidth / cropWidth, maxExportHeight / cropHeight);
    const exportWidth = Math.max(1, Math.round(cropWidth * scale));
    const exportHeight = Math.max(1, Math.round(cropHeight * scale));

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;
    const exportContext = exportCanvas.getContext("2d");
    if (!exportContext) return canvas.toDataURL("image/png");

    exportContext.fillStyle = "#ffffff";
    exportContext.fillRect(0, 0, exportWidth, exportHeight);
    exportContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, exportWidth, exportHeight);

    return exportCanvas.toDataURL("image/png");
  };

  const prepareContext = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#18181b";
    context.fillStyle = "#18181b";
    return context;
  };

  const clearCanvas = (notify = true) => {
    const canvas = canvasRef.current;
    const context = prepareContext();
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    drewStrokeRef.current = false;
    lastPointRef.current = null;
    if (notify) onChange("");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = prepareContext();
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) {
      drewStrokeRef.current = false;
      return;
    }

    const image = new Image();
    image.onload = () => {
      const nextContext = prepareContext();
      const nextCanvas = canvasRef.current;
      if (!nextContext || !nextCanvas) return;
      nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      nextContext.drawImage(image, 0, 0, nextCanvas.width, nextCanvas.height);
    };
    image.src = value;
  }, [value]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / Math.max(rect.width, 1);
    const scaleY = event.currentTarget.height / Math.max(rect.height, 1);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const commitSignature = () => {
    onChange(exportSignatureDataUrl());
  };

  return (
    <div
      className={classNames("rounded-2xl border p-3", className)}
      style={{ borderRadius: radiusPx, borderColor, backgroundColor }}
    >
      <canvas
        ref={canvasRef}
        width={960}
        height={280}
        className={classNames("w-full touch-none rounded-xl bg-white", heightClassName, canvasClassName)}
        onPointerDown={(event) => {
          if (disabled) return;
          const context = prepareContext();
          if (!context) return;
          const point = getPoint(event);
          drawingRef.current = true;
          drewStrokeRef.current = true;
          lastPointRef.current = point;
          event.currentTarget.setPointerCapture(event.pointerId);
          context.beginPath();
          context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
          context.fill();
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current || disabled) return;
          const context = prepareContext();
          const previousPoint = lastPointRef.current;
          if (!context || !previousPoint) return;
          const point = getPoint(event);
          context.beginPath();
          context.moveTo(previousPoint.x, previousPoint.y);
          context.lineTo(point.x, point.y);
          context.stroke();
          lastPointRef.current = point;
        }}
        onPointerUp={(event) => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          lastPointRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          commitSignature();
        }}
        onPointerCancel={(event) => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          lastPointRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          commitSignature();
        }}
        onPointerLeave={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          lastPointRef.current = null;
          commitSignature();
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className={classNames("text-xs", hintClassName)} style={{ color: textColor }}>
          {value ? filledLabel : emptyLabel}
        </div>
        <button
          type="button"
          onClick={() => clearCanvas(true)}
          disabled={disabled}
          className={classNames(
            "rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60",
            clearButtonClassName,
          )}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
