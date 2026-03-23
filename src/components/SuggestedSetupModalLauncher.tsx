"use client";

import { useEffect, useMemo, useState } from "react";

import { AppModal } from "@/components/AppModal";
import { useToast } from "@/components/ToastProvider";

type ProposedAction = {
  id: string;
  kind: string;
  serviceSlug: string;
  title: string;
  description: string;
};

type PreviewRes =
  | {
      ok: true;
      proposedActions: ProposedAction[];
    }
  | { ok: false; error?: string };

type ApplyRes =
  | { ok: true; appliedIds: string[]; skippedIds: string[] }
  | { ok: false; error?: string; appliedIds?: string[]; skippedIds?: string[] };

export function SuggestedSetupModalLauncher(opts: {
  buttonLabel?: string;
  title?: string;
  description?: string;
  canEdit?: boolean;
  serviceSlugs?: string[];
  kinds?: string[];
  autoOpen?: boolean;
  buttonClassName?: string;
}) {
  const toast = useToast();

  const canEdit = opts.canEdit !== false;
  const [open, setOpen] = useState(Boolean(opts.autoOpen));
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const filteredActions = useMemo(() => {
    const byService = opts.serviceSlugs?.length
      ? actions.filter((a) => opts.serviceSlugs!.includes(a.serviceSlug))
      : actions;
    const byKind = opts.kinds?.length ? byService.filter((a) => opts.kinds!.includes(a.kind)) : byService;
    return byKind;
  }, [actions, opts.kinds, opts.serviceSlugs]);

  const selectedActionIds = useMemo(
    () => filteredActions.map((a) => a.id).filter((id) => selectedIds[id]),
    [filteredActions, selectedIds],
  );

  async function readErrorMessage(res: Response): Promise<string> {
    try {
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const j = (await res.json().catch(() => null)) as any;
        const err = typeof j?.error === "string" ? j.error.trim() : "";
        if (err) return err;
      }

      const text = String(await res.text().catch(() => "")).trim();
      const oneLine = text.replace(/\s+/g, " ").trim();
      if (oneLine) return `Suggested setup failed (${res.status}). ${oneLine.slice(0, 180)}`;
      return `Suggested setup failed (${res.status}).`;
    } catch {
      return `Suggested setup failed (${res.status}).`;
    }
  }

  async function loadPreview() {
    setLoading(true);

    const res = await fetch("/api/portal/suggested-setup/preview", { cache: "no-store" });
    const json = (await res.clone().json().catch(() => null)) as (Partial<PreviewRes> & { error?: string }) | null;

    setLoading(false);

    if (!res.ok) {
      toast.error(await readErrorMessage(res));
      return;
    }

    if (!json || !json.ok) {
      const err = typeof (json as any)?.error === "string" ? String((json as any).error) : "";
      toast.error(err || "Unable to load suggested setup");
      return;
    }

    const nextActions = (json.proposedActions ?? []) as ProposedAction[];
    setActions(nextActions);
    setSelectedIds((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const a of nextActions) {
        if (typeof next[a.id] !== "boolean") next[a.id] = true;
      }
      for (const id of Object.keys(next)) {
        if (!nextActions.some((a) => a.id === id)) delete next[id];
      }
      return next;
    });
  }

  async function applySelected() {
    if (!canEdit) return;

    if (!selectedActionIds.length) {
      toast.error("Select at least one action");
      return;
    }

    setApplying(true);

    const res = await fetch("/api/portal/suggested-setup/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionIds: selectedActionIds }),
    });
    const json = (await res.clone().json().catch(() => null)) as (Partial<ApplyRes> & { error?: string }) | null;

    setApplying(false);

    if (!res.ok) {
      toast.error(await readErrorMessage(res));
      return;
    }

    if (!json || !json.ok) {
      const err = typeof (json as any)?.error === "string" ? String((json as any).error) : "";
      toast.error(err || "Unable to apply suggested setup");
      return;
    }

    toast.success("Applied suggested setup");
    await loadPreview();
  }

  useEffect(() => {
    if (!open) return;
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={
          opts.buttonClassName ??
          "inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
        }
        onClick={() => setOpen(true)}
        disabled={!canEdit}
        title={!canEdit ? "You do not have permission to apply setup" : undefined}
      >
        {opts.buttonLabel ?? "Suggested setup"}
      </button>

      <AppModal
        open={open}
        onClose={() => setOpen(false)}
        title={opts.title ?? "Suggested setup"}
        description={opts.description}
        widthClassName="w-[min(900px,calc(100vw-32px))]"
      >
        <div className="space-y-4">
          {loading ? <div className="text-sm text-zinc-600">Loading…</div> : null}

          {filteredActions.length ? (
            <div className="space-y-3">
              {filteredActions.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={Boolean(selectedIds[a.id])}
                    onChange={(e) => setSelectedIds((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                    disabled={!canEdit || applying}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">{a.title}</div>
                    <div className="mt-1 text-sm text-zinc-600">{a.description}</div>
                    <div className="mt-2 text-xs text-zinc-500">{a.serviceSlug}</div>
                  </div>
                </label>
              ))}
            </div>
          ) : !loading ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No suggested actions right now.</div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => setOpen(false)}
              disabled={applying}
            >
              Close
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
              onClick={applySelected}
              disabled={!canEdit || applying || !selectedActionIds.length}
            >
              {applying ? "Applying…" : selectedActionIds.length ? `Apply (${selectedActionIds.length})` : "Apply"}
            </button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
