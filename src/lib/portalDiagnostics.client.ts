"use client";

import { useEffect } from "react";

export type PortalDiagnosticKind = "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure";
export type PortalDiagnosticViewEnvironment = "local" | "preview" | "production" | "unknown";
export type PortalDiagnosticViewSurface = "admin_portal" | "hosted_funnel" | "public_site" | "unknown";
export type PortalDiagnosticViewAudience = "internal_operator" | "customer_surface" | "unknown";

type Options = {
  enabled?: boolean;
  endpoint?: string;
  source?: string;
};

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function currentPath() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname || ""}${window.location.search || ""}`.slice(0, 512);
}

function currentUrlContext(): Record<string, string | boolean> {
  if (typeof window === "undefined") {
    return {
      viewEnvironment: "unknown",
      viewSurface: "unknown",
      viewAudience: "unknown",
    };
  }

  const hostname = clip(String(window.location.hostname || "").toLowerCase(), 255);
  const host = clip(String(window.location.host || hostname || ""), 255);
  const pathname = String(window.location.pathname || "").toLowerCase();
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local");

  const viewEnvironment: PortalDiagnosticViewEnvironment = isLocalHost
    ? "local"
    : hostname.endsWith(".vercel.app")
      ? "preview"
      : hostname
        ? "production"
        : "unknown";

  const viewSurface: PortalDiagnosticViewSurface = pathname.startsWith("/portal") || pathname.startsWith("/credit/app")
    ? "admin_portal"
    : pathname.startsWith("/f/")
      ? "hosted_funnel"
      : pathname
        ? "public_site"
        : "unknown";

  const viewAudience: PortalDiagnosticViewAudience = viewSurface === "admin_portal"
    ? "internal_operator"
    : viewSurface === "hosted_funnel" || viewSurface === "public_site"
      ? "customer_surface"
      : "unknown";

  return {
    ...(host ? { viewHost: host } : {}),
    viewEnvironment,
    viewSurface,
    viewAudience,
    viewIsLocal: viewEnvironment === "local",
  };
}

const recentDiagnosticSentAt = new Map<string, number>();

function shouldSendDiagnostic(signature: string, windowMs = 15_000) {
  const now = Date.now();
  const prev = recentDiagnosticSentAt.get(signature) ?? 0;
  if (now - prev < windowMs) return false;
  recentDiagnosticSentAt.set(signature, now);
  if (recentDiagnosticSentAt.size > 150) {
    const cutoff = now - 5 * 60 * 1000;
    for (const [key, at] of recentDiagnosticSentAt.entries()) {
      if (at < cutoff) recentDiagnosticSentAt.delete(key);
    }
  }
  return true;
}

function postDiagnostic(
  endpoint: string,
  body: {
    kind: PortalDiagnosticKind;
    message: string;
    path?: string;
    source?: string;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
    meta?: Record<string, unknown>;
  },
) {
  const payload = JSON.stringify(body);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
  } catch {
    // ignore
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // ignore
  });
}

export function trackPortalDiagnosticEvent(input: {
  kind: PortalDiagnosticKind;
  message: string;
  path?: string;
  source?: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  meta?: Record<string, unknown>;
  endpoint?: string;
  dedupeKey?: string;
  dedupeWindowMs?: number;
}) {
  const message = clip(String(input.message || ""), 4000);
  if (!message) return false;

  const path = clip(String(input.path || currentPath() || ""), 512) || undefined;
  const source = clip(String(input.source || ""), 64) || undefined;
  const file = clip(String(input.file || ""), 2000) || undefined;
  const meta = { ...currentUrlContext(), ...(input.meta || {}) };
  const signature =
    input.dedupeKey || [input.kind, source || "", message, path || "", file || ""].join("::");
  if (!shouldSendDiagnostic(signature, input.dedupeWindowMs ?? 15_000)) return false;

  postDiagnostic(input.endpoint || "/api/portal/diagnostics/events", {
    kind: input.kind,
    message,
    ...(path ? { path } : {}),
    ...(source ? { source } : {}),
    ...(input.stack ? { stack: clip(String(input.stack), 8000) } : {}),
    ...(file ? { file } : {}),
    ...(typeof input.line === "number" ? { line: input.line } : {}),
    ...(typeof input.column === "number" ? { column: input.column } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  });
  return true;
}

export function reportPortalActionFailure(input: {
  area: string;
  action: string;
  message: string;
  status?: number | null;
  source?: string;
  meta?: Record<string, unknown>;
  endpoint?: string;
}) {
  const area = clip(String(input.area || "unknown"), 80) || "unknown";
  const action = clip(String(input.action || "unknown"), 80) || "unknown";
  return trackPortalDiagnosticEvent({
    kind: "action_failure",
    message: input.message,
    source: input.source || area,
    endpoint: input.endpoint,
    dedupeKey: ["action_failure", area, action, String(input.status || ""), clip(String(input.message || ""), 4000), currentPath()].join("::"),
    meta: {
      area,
      action,
      ...(typeof input.status === "number" ? { status: input.status } : {}),
      ...(input.meta || {}),
    },
  });
}

function eventMessageFromReason(reason: unknown) {
  if (reason instanceof Error) {
    return {
      message: clip(reason.message || reason.name || "Unhandled rejection", 4000),
      stack: clip(reason.stack || "", 8000) || undefined,
    };
  }
  if (typeof reason === "string") {
    return { message: clip(reason || "Unhandled rejection", 4000) };
  }
  try {
    return { message: clip(JSON.stringify(reason), 4000) || "Unhandled rejection" };
  } catch {
    return { message: "Unhandled rejection" };
  }
}

function resourceErrorPayload(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const tagName = target.tagName.toLowerCase();
  const src =
    (target instanceof HTMLScriptElement && target.src) ||
    (target instanceof HTMLLinkElement && target.href) ||
    (target instanceof HTMLImageElement && target.currentSrc) ||
    (target instanceof HTMLMediaElement && target.currentSrc) ||
    "";
  const url = clip(String(src || ""), 2000);
  if (url.startsWith("chrome-extension://") || url.startsWith("moz-extension://")) return null;
  return {
    kind: "resource_error" as const,
    message: clip(`Failed to load ${tagName}`, 4000),
    file: url || undefined,
    meta: {
      tagName,
      ...(url ? { resourceUrl: url } : {}),
    },
  };
}

export function usePortalDiagnosticsTracker(opts?: Options) {
  const enabled = opts?.enabled ?? true;
  const endpoint = opts?.endpoint ?? "/api/portal/diagnostics/events";
  const source = clip(opts?.source || "portal_shell", 64);

  useEffect(() => {
    if (!enabled) return;

    const onError = (event: Event) => {
      const resource = resourceErrorPayload(event);
      if (resource) {
        trackPortalDiagnosticEvent({
          ...resource,
          source,
          endpoint,
          dedupeKey: `${resource.kind}::${resource.message}::${resource.file || ""}::${currentPath()}`,
        });
        return;
      }

      const errorEvent = event as ErrorEvent;
      const message =
        clip(String(errorEvent.message || errorEvent.error?.message || "Runtime error"), 4000) || "Runtime error";
      const file = clip(String(errorEvent.filename || ""), 2000);
      if (file.startsWith("chrome-extension://") || file.startsWith("moz-extension://")) return;
      trackPortalDiagnosticEvent({
        kind: "runtime_error",
        message,
        source,
        endpoint,
        dedupeKey: `runtime_error::${message}::${file}::${currentPath()}`,
        ...(file ? { file } : {}),
        ...(typeof errorEvent.lineno === "number" ? { line: errorEvent.lineno } : {}),
        ...(typeof errorEvent.colno === "number" ? { column: errorEvent.colno } : {}),
        ...(typeof errorEvent.error?.stack === "string" && errorEvent.error.stack.trim()
          ? { stack: clip(errorEvent.error.stack, 8000) }
          : {}),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const payload = eventMessageFromReason(event.reason);
      if (!payload.message || payload.message === "AbortError") return;
      trackPortalDiagnosticEvent({
        kind: "unhandled_rejection",
        message: payload.message,
        source,
        endpoint,
        dedupeKey: `unhandled_rejection::${payload.message}::${currentPath()}`,
        ...(payload.stack ? { stack: payload.stack } : {}),
      });
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [enabled, endpoint, source]);
}