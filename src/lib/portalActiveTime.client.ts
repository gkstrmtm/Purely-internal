"use client";

import { useEffect, useRef } from "react";

type Options = {
  endpoint?: string;
  heartbeatMs?: number;
  idleThresholdMs?: number;
  maxDtSec?: number;
  enabled?: boolean;
};

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function postActiveTime(endpoint: string, dtSec: number, path: string) {
  const payload = JSON.stringify({ dtSec, path });

  // Prefer sendBeacon so we still capture time on navigation/close.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
  } catch {
    // fall through
  }

  // Fallback fetch; keepalive helps on navigation.
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // ignore
  });
}

export function usePortalActiveTimeTracker(opts?: Options) {
  const endpoint = opts?.endpoint ?? "/api/portal/engagement/active-time";
  const heartbeatMs = clampInt(opts?.heartbeatMs, 5000, 60000);
  const idleThresholdMs = clampInt(opts?.idleThresholdMs, 5000, 5 * 60 * 1000);
  const maxDtSec = clampInt(opts?.maxDtSec, 1, 60);
  const enabled = opts?.enabled !== false;

  const lastActivityAtRef = useRef<number>(0);
  const lastFlushAtRef = useRef<number>(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    const start = Date.now();
    lastActivityAtRef.current = start;
    lastFlushAtRef.current = start;

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
    };

    // Activity signals.
    window.addEventListener("mousemove", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("scroll", markActivity, { passive: true });
    window.addEventListener("touchstart", markActivity, { passive: true });

    const flush = () => {
      if (!mountedRef.current) return;

      // Only count if visible + focused.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        lastFlushAtRef.current = Date.now();
        return;
      }
      if (typeof document !== "undefined" && typeof document.hasFocus === "function" && !document.hasFocus()) {
        lastFlushAtRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const idleMs = now - lastActivityAtRef.current;
      if (idleMs > idleThresholdMs) {
        lastFlushAtRef.current = now;
        return;
      }

      const dtMs = now - lastFlushAtRef.current;
      lastFlushAtRef.current = now;

      const dtSec = Math.max(0, Math.floor(dtMs / 1000));
      const sendSec = Math.min(maxDtSec, dtSec);
      if (sendSec <= 0) return;

      const path = typeof window !== "undefined" ? window.location.pathname : "";
      postActiveTime(endpoint, sendSec, path);
    };

    // Heartbeat.
    const intervalId = window.setInterval(flush, heartbeatMs);

    // Flush on backgrounding/unload.
    const onVis = () => {
      if (document.visibilityState !== "visible") flush();
    };
    document.addEventListener("visibilitychange", onVis);

    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);

      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("scroll", markActivity);
      window.removeEventListener("touchstart", markActivity);

      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, endpoint, heartbeatMs, idleThresholdMs, maxDtSec]);
}
