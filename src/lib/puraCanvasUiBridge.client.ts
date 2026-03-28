"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type PuraCanvasUiRole =
  | "any"
  | "button"
  | "link"
  | "tab"
  | "checkbox"
  | "radio"
  | "select"
  | "textbox"
  | "menuitem";

export type PuraCanvasUiAction =
  | { kind: "click"; query: string; role?: PuraCanvasUiRole; nth?: number }
  | { kind: "type"; query: string; value: string; clear?: boolean; role?: PuraCanvasUiRole; nth?: number }
  | { kind: "select"; query: string; option: string; role?: PuraCanvasUiRole; nth?: number }
  | { kind: "set_checked"; query: string; checked: boolean; role?: PuraCanvasUiRole; nth?: number }
  | { kind: "scroll"; to: "top" | "bottom" }
  | { kind: "wait"; ms: number };

type BridgeRequest =
  | { __pura: true; type: "PURA_CANVAS_UI_PING"; requestId: string }
  | { __pura: true; type: "PURA_CANVAS_UI_RUN"; requestId: string; action: PuraCanvasUiAction };

type Candidate = { role: string; name: string; tag: string; nth: number };

type BridgeResponse =
  | { __pura: true; type: "PURA_CANVAS_UI_PONG"; requestId: string; ok: true }
  | { __pura: true; type: "PURA_CANVAS_UI_RUN_RESULT"; requestId: string; ok: true }
  | { __pura: true; type: "PURA_CANVAS_UI_RUN_RESULT"; requestId: string; ok: false; error: string; candidates?: Candidate[] };

function safeTrim(s: unknown, max = 200) {
  return String(typeof s === "string" ? s : "")
    .trim()
    .slice(0, max);
}

function elementName(el: Element): string {
  const aria = safeTrim(el.getAttribute("aria-label"), 200);
  if (aria) return aria;

  const labelledBy = safeTrim(el.getAttribute("aria-labelledby"), 200);
  if (labelledBy) {
    const id = labelledBy.split(/\s+/).filter(Boolean)[0];
    if (id) {
      const labelEl = document.getElementById(id);
      const t = safeTrim(labelEl?.textContent, 200);
      if (t) return t;
    }
  }

  const title = safeTrim((el as any).title, 200);
  if (title) return title;

  const text = safeTrim(el.textContent, 200);
  if (text) return text;

  if (el instanceof HTMLInputElement) {
    const ph = safeTrim(el.placeholder, 200);
    if (ph) return ph;
    const nm = safeTrim(el.name, 200);
    if (nm) return nm;
  }

  return "";
}

function roleForElement(el: Element): string {
  const explicit = safeTrim(el.getAttribute("role"), 40);
  if (explicit) return explicit;
  if (el.tagName === "A") return "link";
  if (el.tagName === "BUTTON") return "button";
  if (el instanceof HTMLInputElement) {
    const t = safeTrim(el.type, 40).toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "submit" || t === "button") return "button";
    return "textbox";
  }
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLTextAreaElement) return "textbox";
  return "";
}

function isVisible(el: Element): boolean {
  try {
    const r = (el as HTMLElement).getBoundingClientRect?.();
    if (!r) return true;
    if (r.width <= 0 || r.height <= 0) return false;
    const style = window.getComputedStyle(el as any);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    return true;
  } catch {
    return true;
  }
}

function elementsForRole(role: PuraCanvasUiRole | undefined): Element[] {
  const r = (role || "any").toLowerCase() as PuraCanvasUiRole;

  const qs = (() => {
    switch (r) {
      case "tab":
        return "[role=tab], button[role=tab]";
      case "link":
        return "a[href]";
      case "button":
        return "button, [role=button], input[type=button], input[type=submit]";
      case "checkbox":
        return "input[type=checkbox], [role=checkbox]";
      case "radio":
        return "input[type=radio], [role=radio]";
      case "select":
        return "select, [role=listbox]";
      case "textbox":
        return "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable=true]";
      case "menuitem":
        return "[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]";
      case "any":
      default:
        return "button, [role=button], a[href], [role=tab], input, textarea, select, [contenteditable=true]";
    }
  })();

  return Array.from(document.querySelectorAll(qs));
}

function findCandidates(queryRaw: string, role?: PuraCanvasUiRole): Element[] {
  const query = safeTrim(queryRaw, 200).toLowerCase();
  if (!query) return [];

  const pool = elementsForRole(role).filter(isVisible);

  // Prefer exact-ish matches first.
  const scored = pool
    .map((el) => {
      const name = elementName(el);
      const n = name.toLowerCase();
      let score = 0;
      if (!n) score -= 10;
      if (n === query) score += 100;
      if (n.startsWith(query)) score += 40;
      if (n.includes(query)) score += 20;
      if (query.includes(n) && n.length >= 6) score += 5;
      return { el, name, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((x) => x.el);
}

async function runUiAction(action: PuraCanvasUiAction): Promise<{ ok: true } | { ok: false; error: string; candidates?: Candidate[] }> {
  try {
    if (action.kind === "wait") {
      const ms = Math.max(0, Math.min(5000, Math.floor(action.ms || 0)));
      await new Promise((r) => setTimeout(r, ms));
      return { ok: true };
    }

    if (action.kind === "scroll") {
      const top = action.to === "top";
      try {
        window.scrollTo({ top: top ? 0 : document.documentElement.scrollHeight, behavior: "smooth" });
      } catch {
        window.scrollTo(0, top ? 0 : document.documentElement.scrollHeight);
      }
      return { ok: true };
    }

    const role = ("role" in action ? action.role : undefined) as PuraCanvasUiRole | undefined;
    const query = safeTrim((action as any).query, 200);
    const matches = findCandidates(query, role);

    const nth = typeof (action as any).nth === "number" && Number.isFinite((action as any).nth) ? Math.max(0, Math.floor((action as any).nth)) : null;

    if (!matches.length) {
      return { ok: false, error: `No matching UI element found for: ${query}` };
    }

    if (nth === null && matches.length > 1) {
      const candidates: Candidate[] = matches.slice(0, 8).map((el, i) => ({
        role: roleForElement(el) || safeTrim(el.getAttribute("role"), 40) || "",
        name: elementName(el) || safeTrim(el.tagName.toLowerCase(), 40),
        tag: safeTrim(el.tagName.toLowerCase(), 40),
        nth: i,
      }));
      return { ok: false, error: `Ambiguous match for: ${query}`, candidates };
    }

    const el = matches[Math.min(matches.length - 1, nth ?? 0)] as any;

    if (action.kind === "click") {
      (el as HTMLElement).focus?.();
      (el as HTMLElement).click?.();
      return { ok: true };
    }

    if (action.kind === "type") {
      const value = String(action.value ?? "").slice(0, 10000);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (action.clear) el.value = "";
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      if ((el as HTMLElement).isContentEditable) {
        (el as HTMLElement).focus();
        if (action.clear) (el as HTMLElement).textContent = "";
        (el as HTMLElement).textContent = value;
        (el as HTMLElement).dispatchEvent(new Event("input", { bubbles: true }));
        return { ok: true };
      }
      return { ok: false, error: `Matched element is not a text input: ${query}` };
    }

    if (action.kind === "set_checked") {
      const checked = Boolean(action.checked);
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.focus();
        el.checked = checked;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      // Best-effort: click role=checkbox when state differs
      const ariaChecked = safeTrim(el.getAttribute?.("aria-checked"), 20).toLowerCase();
      const current = ariaChecked === "true";
      if (ariaChecked === "true" || ariaChecked === "false") {
        if (current !== checked) {
          (el as HTMLElement).focus?.();
          (el as HTMLElement).click?.();
        }
        return { ok: true };
      }
      return { ok: false, error: `Matched element is not a checkbox: ${query}` };
    }

    if (action.kind === "select") {
      const optionQuery = safeTrim(action.option, 200).toLowerCase();
      if (el instanceof HTMLSelectElement) {
        const opts = Array.from(el.options || []);
        const idx = opts.findIndex((o) => safeTrim(o.textContent, 200).toLowerCase().includes(optionQuery));
        if (idx === -1) return { ok: false, error: `No matching option for: ${action.option}` };
        el.focus();
        el.selectedIndex = idx;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      return { ok: false, error: `Matched element is not a <select>: ${query}` };
    }

    return { ok: false, error: "Unsupported UI action" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "UI action failed" };
  }
}

export function usePuraCanvasUiBridgeResponder() {
  useEffect(() => {
    // Only respond when we are inside an iframe (the work canvas).
    if (typeof window === "undefined") return;
    if (window.self === window.top) return;

    const onMessage = async (event: MessageEvent) => {
      try {
        if (event.origin !== window.location.origin) return;
        if (event.source !== window.parent) return;
        const data = event.data as BridgeRequest;
        if (!data || typeof data !== "object" || (data as any).__pura !== true) return;

        if (data.type === "PURA_CANVAS_UI_PING") {
          const resp: BridgeResponse = { __pura: true, type: "PURA_CANVAS_UI_PONG", requestId: data.requestId, ok: true };
          window.parent.postMessage(resp, window.location.origin);
          return;
        }

        if (data.type === "PURA_CANVAS_UI_RUN") {
          const result = await runUiAction(data.action);
          const resp: BridgeResponse = result.ok
            ? { __pura: true, type: "PURA_CANVAS_UI_RUN_RESULT", requestId: data.requestId, ok: true }
            : {
                __pura: true,
                type: "PURA_CANVAS_UI_RUN_RESULT",
                requestId: data.requestId,
                ok: false,
                error: result.error,
                ...(result.candidates ? { candidates: result.candidates } : {}),
              };
          window.parent.postMessage(resp, window.location.origin);
        }
      } catch {
        // never throw from a message handler
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
}

type Pending = { resolve: (v: any) => void; reject: (e: any) => void; timeoutId: any };

function newRequestId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function usePuraCanvasUiBridgeClient(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const pendingRef = useRef(new Map<string, Pending>());

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      try {
        if (event.origin !== window.location.origin) return;
        const win = iframeRef.current?.contentWindow;
        if (!win || event.source !== win) return;

        const data = event.data as BridgeResponse;
        if (!data || typeof data !== "object" || (data as any).__pura !== true) return;

        const pending = pendingRef.current.get((data as any).requestId);
        if (!pending) return;
        pendingRef.current.delete((data as any).requestId);
        clearTimeout(pending.timeoutId);

        pending.resolve(data);
      } catch {
        // ignore
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef]);

  const post = useCallback(
    (msg: BridgeRequest) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) throw new Error("Canvas is not ready");
      win.postMessage(msg, window.location.origin);
    },
    [iframeRef],
  );

  const request = useCallback(
    async <T extends BridgeResponse>(msg: BridgeRequest, timeoutMs = 4000): Promise<T> => {
      const requestId = (msg as any).requestId;
      return await new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRef.current.delete(requestId);
          reject(new Error("Canvas did not respond"));
        }, timeoutMs);
        pendingRef.current.set(requestId, { resolve, reject, timeoutId });
        try {
          post(msg);
        } catch (e) {
          clearTimeout(timeoutId);
          pendingRef.current.delete(requestId);
          reject(e);
        }
      });
    },
    [post],
  );

  const ping = useCallback(async () => {
    const requestId = newRequestId();
    const resp = await request({ __pura: true, type: "PURA_CANVAS_UI_PING", requestId });
    return Boolean((resp as any).ok);
  }, [request]);

  const run = useCallback(
    async (action: PuraCanvasUiAction) => {
      const requestId = newRequestId();
      const resp = await request({ __pura: true, type: "PURA_CANVAS_UI_RUN", requestId, action }, 8000);
      if ((resp as any).type !== "PURA_CANVAS_UI_RUN_RESULT") throw new Error("Unexpected canvas response");
      if (!(resp as any).ok) {
        const msg = safeTrim((resp as any).error, 500) || "UI action failed";
        const candidates = Array.isArray((resp as any).candidates) ? (resp as any).candidates : null;
        const err: any = new Error(msg);
        if (candidates) err.candidates = candidates;
        throw err;
      }
      return { ok: true } as const;
    },
    [request],
  );

  return useMemo(() => ({ ping, run }), [ping, run]);
}
