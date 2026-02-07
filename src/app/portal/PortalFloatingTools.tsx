"use client";

import { useEffect, useMemo, useState } from "react";

type VersionPayload = {
  ok?: boolean;
  buildSha?: string | null;
  commitRef?: string | null;
  deploymentId?: string | null;
  nodeEnv?: string | null;
  now?: string;
};

type BugReportResponse = { ok?: boolean; reportId?: string; emailed?: boolean; error?: string };

function shortSha(sha: string | null | undefined) {
  const s = (sha ?? "").trim();
  if (!s) return "—";
  return s.length > 10 ? s.slice(0, 10) : s;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalFloatingTools() {
  const [minimized, setMinimized] = useState(true);
  const [version, setVersion] = useState<VersionPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    // Always start minimized on fresh app loads.
    setMinimized(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/version", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) {
        setVersion({ ok: false });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as VersionPayload;
      setVersion(json);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const versionLabel = useMemo(() => {
    const sha = shortSha(version?.buildSha);
    return `v ${sha}`;
  }, [version?.buildSha, version?.commitRef]);

  function persistMinimized(next: boolean) {
    setMinimized(next);
  }

  async function submit() {
    const text = message.trim();
    if (!text) {
      setNote("Please describe the issue.");
      window.setTimeout(() => setNote(null), 2000);
      return;
    }

    setSending(true);
    setNote(null);

    const payload = {
      message: text,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      area: "portal",
      meta: {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        buildSha: version?.buildSha ?? null,
        commitRef: version?.commitRef ?? null,
        deploymentId: version?.deploymentId ?? null,
        nodeEnv: version?.nodeEnv ?? null,
        clientTime: new Date().toISOString(),
      },
    };

    const res = await fetch("/api/portal/bug-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null as any);

    if (!res?.ok) {
      setNote("Could not send bug report.");
      setSending(false);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as BugReportResponse;
    if (!json?.ok) {
      setNote(json?.error ?? "Could not send bug report.");
      setSending(false);
      return;
    }

    setMessage("");
    setOpen(false);
    setSending(false);

    setNote(json.emailed ? "Bug report sent. Thanks!" : "Bug report saved (email not configured).");
    window.setTimeout(() => setNote(null), 3500);
  }

  return (
    <>
      {note ? (
        <div className="fixed bottom-24 right-4 z-[9999] max-w-sm rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg ring-1 ring-[color:rgba(29,78,216,0.14)]">
          {note}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[9998]">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close"
            onClick={() => (!sending ? setOpen(false) : null)}
          />

          <div className="absolute bottom-6 right-4 w-[min(520px,calc(100vw-2rem))] rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report a bug</div>
                <div className="mt-1 text-xs text-zinc-500">{versionLabel}</div>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <textarea
                className="min-h-[120px] w-full rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-[color:var(--color-brand-blue)]"
                placeholder="What happened? What did you expect?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
              />
              <div className="mt-2 text-xs text-zinc-500">Includes your current page URL and version automatically.</div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">We’ll notify the team by email.</div>
              <button
                type="button"
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void submit()}
                disabled={sending}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-[9997]">
        {minimized ? (
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-lg ring-1 ring-[color:rgba(29,78,216,0.14)] hover:bg-zinc-50"
            onClick={() => persistMinimized(false)}
            aria-label="Open tools"
          >
            <span className="rounded-full bg-[color:rgba(29,78,216,0.10)] px-2 py-1 text-[11px] font-semibold text-[color:var(--color-brand-blue)]">
              {shortSha(version?.buildSha)}
            </span>
            <span className="rounded-full bg-[color:rgba(251,113,133,0.16)] px-2 py-1 text-[11px] font-semibold text-[color:var(--color-brand-pink)]">
              Report
            </span>
          </button>
        ) : (
          <div className="w-[320px] rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 h-1.5 w-14 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(29,78,216,0.25))]" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-zinc-500">Version</div>
                <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{versionLabel}</div>
              </div>
              <button
                type="button"
                className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => persistMinimized(true)}
                aria-label="Minimize"
              >
                ×
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                className={classNames(
                  "rounded-2xl px-3 py-2 text-sm font-semibold",
                  "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                )}
                onClick={() => setOpen(true)}
              >
                Report bug
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
