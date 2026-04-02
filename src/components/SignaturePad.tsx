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
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

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
    lastPointRef.current = null;
    if (notify) onChange("");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = prepareContext();
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
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
