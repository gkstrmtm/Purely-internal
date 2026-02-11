"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { RichTextMarkdownEditor } from "@/components/RichTextMarkdownEditor";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";

type AudienceTab = "external" | "internal";

type Site = {
  id: string;
  name: string;
  slug: string | null;
  primaryDomain: string | null;
  verificationToken: string;
  verifiedAt: string | null;
  updatedAt: string;
};

type Settings = {
  enabled: boolean;
  frequencyDays: number;
  cursor: number;
  requireApproval: boolean;
  channels: { email: boolean; sms: boolean };
  topics: string[];
  promptAnswers: Record<string, string>;
  deliveryEmailHint?: string;
  deliverySmsHint?: string;
  includeImages?: boolean;
  includeImagesWhereNeeded?: boolean;
  audience: { tagIds: string[]; contactIds: string[]; emails: string[]; userIds: string[]; sendAllUsers?: boolean };
  lastGeneratedAt: string | null;
  nextDueAt: string | null;
};

type Tag = { id: string; name: string; color: string | null };

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tags: ContactTag[];
};

type NewsletterRow = {
  id: string;
  kind: "EXTERNAL" | "INTERNAL";
  status: "DRAFT" | "READY" | "SENT";
  slug: string;
  title: string;
  excerpt: string;
  sentAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

function splitLines(value: string): string[] {
  const raw = (value || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

function splitEmails(value: string): string[] {
  const raw = (value || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 200) break;
  }
  return out;
}

function isEmail(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function buildNewsletterEmailPreview(opts: { excerpt: string; link: string }) {
  return [opts.excerpt, "", `Read online: ${opts.link}`, "", "—", "Sent via Purely Automation"].join("\n");
}

function buildNewsletterSmsPreview(opts: { smsText: string | null; link: string }) {
  const baseText = (opts.smsText || "New newsletter is ready.").trim() || "New newsletter is ready.";
  return `${baseText} ${opts.link}`.slice(0, 900);
}

export function PortalNewsletterClient({ initialAudience }: { initialAudience: AudienceTab }) {
  const toast = useToast();

  const [audience, setAudience] = useState<AudienceTab>(initialAudience);
  const kind = audience === "internal" ? "INTERNAL" : "EXTERNAL";

  const [site, setSite] = useState<Site | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newsletters, setNewsletters] = useState<NewsletterRow[]>([]);

  const [credits, setCredits] = useState<number | null>(null);
  const [creditsUsed30d, setCreditsUsed30d] = useState<number | null>(null);
  const [generations30d, setGenerations30d] = useState<number | null>(null);
  const [billingPath, setBillingPath] = useState<string>("/portal/app/billing");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [mode, setMode] = useState<"ai" | "manual">("ai");

  const [manualTitle, setManualTitle] = useState("");
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [manualSmsText, setManualSmsText] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualCreating, setManualCreating] = useState(false);

  const [manualAssetAlt, setManualAssetAlt] = useState("");
  const [manualAssetUrl, setManualAssetUrl] = useState<string | null>(null);
  const [manualAssetFileName, setManualAssetFileName] = useState<string>("");
  const [manualAssetBusy, setManualAssetBusy] = useState(false);
  const [manualAssetPickerOpen, setManualAssetPickerOpen] = useState(false);
  const [manualImageSearch, setManualImageSearch] = useState("");
  const [manualImageSearching, setManualImageSearching] = useState(false);
  const [manualImageResults, setManualImageResults] = useState<Array<{ url: string; thumbUrl: string; title: string; sourcePage: string }>>([]);
  const [manualImagePreview, setManualImagePreview] = useState<{ url: string; thumbUrl: string; title: string; sourcePage: string } | null>(null);
  const [manualImagePreviewOpen, setManualImagePreviewOpen] = useState(false);
  const [manualImageImporting, setManualImageImporting] = useState(false);

  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);

  const [contactQuery, setContactQuery] = useState("");
  const [contactSearching, setContactSearching] = useState(false);
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);

  const [internalEmailInput, setInternalEmailInput] = useState("");

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<NewsletterRow["status"]>("DRAFT");
  const [draftSlug, setDraftSlug] = useState<string>("");
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftExcerpt, setDraftExcerpt] = useState<string>("");
  const [draftContent, setDraftContent] = useState<string>("");
  const [draftSmsText, setDraftSmsText] = useState<string>("");

  const [assetAlt, setAssetAlt] = useState("");
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetFileName, setAssetFileName] = useState<string>("");
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const siteHandle = useMemo(() => {
    if (!site) return null;
    return site.slug ?? site.id;
  }, [site]);

  const publicBasePath = useMemo(() => {
    if (!siteHandle) return null;
    return audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`;
  }, [audience, siteHandle]);

  const publicBaseUrl = useMemo(() => {
    if (!publicBasePath) return null;
    if (typeof window === "undefined") return publicBasePath;
    return `${window.location.origin}${publicBasePath}`;
  }, [publicBasePath]);

  const refresh = useCallback(async () => {
    setLoading(true);

    const [siteRes, settingsRes, tagsRes, creditsRes, usageRes, listRes] = await Promise.all([
      fetch("/api/portal/newsletter/site", { cache: "no-store" }),
      fetch(`/api/portal/newsletter/automation/settings?kind=${audience}`, { cache: "no-store" }),
      fetch("/api/portal/contact-tags", { cache: "no-store" }),
      fetch("/api/portal/credits", { cache: "no-store" }),
      fetch("/api/portal/newsletter/usage?range=30d", { cache: "no-store" }),
      fetch(`/api/portal/newsletter/newsletters?kind=${audience}&take=100`, { cache: "no-store" }),
    ]);

    const siteJson = (await siteRes.json().catch(() => ({}))) as any;
    const settingsJson = (await settingsRes.json().catch(() => ({}))) as any;
    const tagsJson = (await tagsRes.json().catch(() => ({}))) as any;
    const creditsJson = (await creditsRes.json().catch(() => ({}))) as any;
    const usageJson = (await usageRes.json().catch(() => ({}))) as any;
    const listJson = (await listRes.json().catch(() => ({}))) as any;

    if (!siteRes.ok) toast.error(siteJson?.error ?? "Unable to load newsletter site");
    if (!settingsRes.ok) toast.error(settingsJson?.error ?? "Unable to load newsletter settings");
    if (!tagsRes.ok) toast.error(tagsJson?.error ?? "Unable to load contact tags");

    setSite(siteJson?.site ?? null);

    if (settingsRes.ok && settingsJson?.settings) setSettings(settingsJson.settings as Settings);

    setTags(Array.isArray(tagsJson?.tags) ? tagsJson.tags : []);

    if (creditsRes.ok) {
      setCredits(typeof creditsJson?.credits === "number" ? creditsJson.credits : 0);
      setBillingPath(typeof creditsJson?.billingPath === "string" ? creditsJson.billingPath : "/portal/app/billing");
    }

    if (usageRes.ok) {
      setCreditsUsed30d(typeof usageJson?.creditsUsed?.range === "number" ? usageJson.creditsUsed.range : 0);
      setGenerations30d(typeof usageJson?.generations?.range === "number" ? usageJson.generations.range : 0);
    }

    setNewsletters(Array.isArray(listJson?.newsletters) ? (listJson.newsletters as NewsletterRow[]) : []);

    setLoading(false);
  }, [audience, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Default to AI tab per audience switch.
    setMode("ai");
  }, [audience]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);

    const res = await fetch("/api/portal/newsletter/automation/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: audience,
        enabled: Boolean(settings.enabled),
        frequencyDays: Math.max(1, Math.min(30, Math.floor(Number(settings.frequencyDays) || 7))),
        requireApproval: Boolean(settings.requireApproval),
        channels: settings.channels,
        topics: settings.topics,
        promptAnswers: settings.promptAnswers,
        deliveryEmailHint: settings.deliveryEmailHint ?? "",
        deliverySmsHint: settings.deliverySmsHint ?? "",
        includeImages: Boolean(settings.includeImages),
        includeImagesWhereNeeded: Boolean(settings.includeImagesWhereNeeded),
        audience: settings.audience,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) toast.error(json?.error ?? "Failed to save");
    else toast.success("Saved");

    setSaving(false);
    await refresh();
  }, [audience, refresh, settings, toast]);

  const searchManualImages = useCallback(async () => {
    const q = manualImageSearch.trim();
    if (q.length < 2) {
      setManualImageResults([]);
      return;
    }
    setManualImageSearching(true);
    try {
      const res = await fetch(`/api/portal/newsletter/royalty-free-images?q=${encodeURIComponent(q)}&take=10`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !Array.isArray(json?.images)) {
        setManualImageResults([]);
        return;
      }
      setManualImageResults(
        json.images
          .map((i: any) => ({
            url: String(i?.url || ""),
            thumbUrl: String(i?.thumbUrl || i?.url || ""),
            title: String(i?.title || ""),
            sourcePage: String(i?.sourcePage || ""),
          }))
          .filter((i: any) => i.url && i.thumbUrl),
      );
    } finally {
      setManualImageSearching(false);
    }
  }, [manualImageSearch]);

  const createOwnerTag = useCallback(async () => {
    const name = createTagName.trim().slice(0, 60);
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setCreateTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: createTagColor }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !json?.tag?.id) {
        toast.error(String(json?.error || "Failed to create tag"));
        return;
      }

      const created: Tag = {
        id: String(json.tag.id),
        name: String(json.tag.name || name).slice(0, 60),
        color: typeof json.tag.color === "string" ? String(json.tag.color) : null,
      };

      setTags((prev) => {
        const next = [...prev.filter((t) => t.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setCreateTagName("");
      setCreateTagColor("#2563EB");
      toast.success("Tag created");
    } finally {
      setCreateTagBusy(false);
    }
  }, [createTagColor, createTagName, toast]);

  useEffect(() => {
    // For external newsletters, fetch details for selected contacts so we can show a readable list.
    if (audience !== "external") {
      setSelectedContacts([]);
      return;
    }
    const ids = (settings?.audience?.contactIds || []).filter(Boolean);
    if (!ids.length) {
      setSelectedContacts([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/portal/newsletter/audience/contacts?ids=${encodeURIComponent(ids.join(","))}&take=200`, {
        cache: "no-store",
      }).catch(() => null as any);
      const json = (await res?.json().catch(() => ({}))) as any;
      if (cancelled) return;
      if (!res?.ok || !json?.ok || !Array.isArray(json?.contacts)) {
        return;
      }
      setSelectedContacts(
        json.contacts
          .map((c: any) => ({
            id: String(c?.id || ""),
            name: c?.name ? String(c.name) : null,
            email: c?.email ? String(c.email) : null,
            phone: c?.phone ? String(c.phone) : null,
            tags: Array.isArray(c?.tags)
              ? c.tags
                  .map((t: any) => ({ id: String(t?.id || ""), name: String(t?.name || "").slice(0, 60), color: typeof t?.color === "string" ? String(t.color) : null }))
                  .filter((t: ContactTag) => t.id && t.name)
              : [],
          }))
          .filter((c: Contact) => Boolean(c.id)),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [audience, settings?.audience?.contactIds]);

  useEffect(() => {
    // Contact search (debounced).
    if (audience !== "external") {
      setContactResults([]);
      return;
    }
    const q = contactQuery.trim();
    if (q.length < 2) {
      setContactResults([]);
      return;
    }

    let cancelled = false;
    setContactSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/portal/newsletter/audience/contacts?q=${encodeURIComponent(q)}&take=50`, { cache: "no-store" }).catch(() => null as any);
        const json = (await res?.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (!res?.ok || !json?.ok || !Array.isArray(json?.contacts)) {
          setContactResults([]);
          setContactSearching(false);
          return;
        }
        setContactResults(
          json.contacts
            .map((c: any) => ({
              id: String(c?.id || ""),
              name: c?.name ? String(c.name) : null,
              email: c?.email ? String(c.email) : null,
              phone: c?.phone ? String(c.phone) : null,
              tags: Array.isArray(c?.tags)
                ? c.tags
                    .map((t: any) => ({ id: String(t?.id || ""), name: String(t?.name || "").slice(0, 60), color: typeof t?.color === "string" ? String(t.color) : null }))
                    .filter((t: ContactTag) => t.id && t.name)
                : [],
            }))
            .filter((c: Contact) => Boolean(c.id)),
        );
        setContactSearching(false);
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [audience, contactQuery]);

  const openDraft = useCallback(async (newsletterId: string) => {
    setDraftOpen(true);
    setDraftLoading(true);
    setDraftError(null);
    setDraftId(newsletterId);
    setAssetAlt("");
    setAssetUrl(null);
    setAssetFileName("");

    const res = await fetch(`/api/portal/newsletter/newsletters/${encodeURIComponent(newsletterId)}`, { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => ({}))) as any;
    if (!res?.ok || !json?.ok || !json?.newsletter?.id) {
      setDraftError(String(json?.error || "Failed to load draft"));
      setDraftLoading(false);
      return;
    }

    const n = json.newsletter;
    setDraftStatus(String(n.status || "DRAFT") as any);
    setDraftSlug(String(n.slug || ""));
    setDraftTitle(String(n.title || ""));
    setDraftExcerpt(String(n.excerpt || ""));
    setDraftContent(String(n.content || ""));
    setDraftSmsText(String(n.smsText || ""));
    setDraftLoading(false);
  }, []);

  const createManual = useCallback(
    async (status: "DRAFT" | "READY") => {
      if (!manualTitle.trim()) {
        toast.error("Title is required");
        return;
      }

      setManualCreating(true);
      try {
        const res = await fetch("/api/portal/newsletter/newsletters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: audience,
            status,
            title: manualTitle,
            excerpt: manualExcerpt,
            content: manualContent,
            smsText: manualSmsText || null,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok || !json?.newsletter?.id) {
          toast.error(String(json?.error || "Failed to create newsletter"));
          return;
        }
        toast.success(status === "READY" ? "Manual newsletter created (READY)" : "Manual newsletter created");
        const id = String(json.newsletter.id);
        setManualTitle("");
        setManualExcerpt("");
        setManualSmsText("");
        setManualContent("");
        await refresh();
        await openDraft(id);
      } finally {
        setManualCreating(false);
      }
    },
    [audience, manualContent, manualExcerpt, manualSmsText, manualTitle, openDraft, refresh, toast],
  );

  const saveDraft = useCallback(async () => {
    if (!draftId) return;
    setDraftSaving(true);
    setDraftError(null);
    try {
      const hostedOnly = draftStatus === "SENT";
      const res = await fetch(
        `/api/portal/newsletter/newsletters/${encodeURIComponent(draftId)}${hostedOnly ? "?hosted=1" : ""}`,
        {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          excerpt: draftExcerpt,
          content: draftContent,
          smsText: draftSmsText || null,
        }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) {
        setDraftError(String(json?.error || "Failed to save"));
        return;
      }
      toast.success(hostedOnly ? "Hosted page updated" : "Draft saved");
      await refresh();
    } finally {
      setDraftSaving(false);
    }
  }, [draftContent, draftExcerpt, draftId, draftSmsText, draftStatus, draftTitle, refresh, toast]);

  const insertIntoDraftContent = useCallback((snippet: string) => {
    const s = String(snippet || "").trim();
    if (!s) return;
    setDraftContent((prev) => {
      const p = String(prev || "");
      if (!p.trim()) return `${s}\n`;
      return p.endsWith("\n") ? `${p}\n${s}\n` : `${p}\n\n${s}\n`;
    });
  }, []);

  const generateNow = useCallback(async () => {
    setGenerating(true);

    const res = await fetch("/api/portal/newsletter/automation/generate-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: audience }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      if (json?.error === "INSUFFICIENT_CREDITS") {
        toast.error("Not enough credits. Add credits in Billing.");
      } else {
        toast.error(json?.error ?? "Failed to generate");
      }
      setGenerating(false);
      return;
    }

    toast.success(audience === "internal" ? "Internal newsletter generated" : "Newsletter generated");
    setGenerating(false);
    await refresh();
  }, [audience, refresh, toast]);

  const sendReady = useCallback(async (newsletterId: string) => {
    const ok = window.confirm("Send this newsletter now? This will message your selected audience.");
    if (!ok) return;

    const res = await fetch(`/api/portal/newsletter/newsletters/${newsletterId}/send`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      toast.error(json?.error ?? "Failed to send");
      return;
    }
    toast.success("Sent");
    await refresh();
  }, [refresh, toast]);

  const selectedTagIds = new Set(settings?.audience?.tagIds ?? []);
  const selectedContactIds = new Set(settings?.audience?.contactIds ?? []);

  const promptFields = useMemo(() => {
    if (audience === "internal") {
      return [
        { key: "updates", label: "What updates should the team know about?" },
        { key: "wins", label: "Any wins/highlights to include?" },
        { key: "issues", label: "Any issues/risks to flag?" },
        { key: "next", label: "What should we do next?" },
      ];
    }
    return [
      { key: "goal", label: "What is the goal of this newsletter?" },
      { key: "audience", label: "Who is this for and what do they care about?" },
      { key: "offer", label: "Any offer/promo (optional)?" },
      { key: "cta", label: "What should they do next?" },
    ];
  }, [audience]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Newsletter</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            AI newsletters cost 1 credit per generation. Send by email and SMS (SMS includes a link to the hosted page).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/portal/app/billing"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {credits === null ? "Credits" : `Credits: ${credits}`}
          </Link>
          <Link
            href={billingPath}
            className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Billing
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (mode === "ai" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            AI
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (mode === "manual" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            Manual
          </button>

          <button
            type="button"
            onClick={() => setAudience("external")}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (audience === "external"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            External (Leads/Customers)
          </button>
          <button
            type="button"
            onClick={() => setAudience("internal")}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (audience === "internal"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            Internal (Team)
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving || !settings}
              className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {mode === "ai" ? (
              <button
                type="button"
                onClick={generateNow}
                disabled={generating}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate now (1 credit)"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          {mode === "ai" ? <div className="text-sm font-semibold text-zinc-900">Automation</div> : <div className="text-sm font-semibold text-zinc-900">Manual composer</div>}

          {mode === "manual" ? (
            <div className="mt-3 grid gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Title</label>
                <input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Newsletter title"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Email message (sent with hosted link)</label>
                <textarea
                  value={manualExcerpt}
                  onChange={(e) => setManualExcerpt(e.target.value)}
                  className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Write the email message. The hosted link is appended automatically."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">SMS message (sent with hosted link)</label>
                <input
                  value={manualSmsText}
                  onChange={(e) => setManualSmsText(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="New newsletter is ready."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Hosted page content (Markdown)</label>
                <div className="mt-1">
                  <RichTextMarkdownEditor markdown={manualContent} onChange={setManualContent} placeholder="Write the hosted page…" disabled={manualCreating} />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Images & files</div>
                <div className="mt-2 text-sm text-zinc-600">Upload, pick from the media library, or pull a royalty-free image.</div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Alt text (optional)</label>
                    <input
                      value={manualAssetAlt}
                      onChange={(e) => setManualAssetAlt(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="Team photo, product, etc."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">URL (optional)</label>
                    <input
                      value={manualAssetUrl ?? ""}
                      onChange={(e) => setManualAssetUrl(e.target.value.trim() ? e.target.value : null)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="https://…"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    {manualAssetBusy ? "Uploading…" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={manualAssetBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setManualAssetBusy(true);
                        try {
                          const fd = new FormData();
                          fd.set("file", file);
                          const up = await fetch("/api/uploads", { method: "POST", body: fd });
                          const upBody = (await up.json().catch(() => ({}))) as any;
                          if (!up.ok || !upBody.url) {
                            toast.error(String(upBody.error || "Upload failed"));
                            return;
                          }
                          setManualAssetUrl(String(upBody.url));
                          setManualAssetFileName(String(upBody.fileName || file.name || ""));
                        } finally {
                          setManualAssetBusy(false);
                          if (e.target) e.target.value = "";
                        }
                      }}
                    />
                  </label>

                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    {manualAssetBusy ? "Uploading…" : "Upload file"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={manualAssetBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setManualAssetBusy(true);
                        try {
                          const fd = new FormData();
                          fd.set("file", file);
                          const up = await fetch("/api/uploads", { method: "POST", body: fd });
                          const upBody = (await up.json().catch(() => ({}))) as any;
                          if (!up.ok || !upBody.url) {
                            toast.error(String(upBody.error || "Upload failed"));
                            return;
                          }
                          setManualAssetUrl(String(upBody.url));
                          setManualAssetFileName(String(upBody.fileName || file.name || "file"));
                        } finally {
                          setManualAssetBusy(false);
                          if (e.target) e.target.value = "";
                        }
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setManualAssetPickerOpen(true)}
                  >
                    Choose from media library
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!manualAssetUrl}
                    className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => {
                      if (!manualAssetUrl) return;
                      const alt = manualAssetAlt.trim() || "image";
                      setManualContent((prev) => {
                        const p = String(prev || "");
                        const snippet = `![${alt}](${manualAssetUrl})`;
                        if (!p.trim()) return `${snippet}\n`;
                        return p.endsWith("\n") ? `${p}\n${snippet}\n` : `${p}\n\n${snippet}\n`;
                      });
                    }}
                  >
                    Insert image
                  </button>
                  <button
                    type="button"
                    disabled={!manualAssetUrl}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    onClick={() => {
                      if (!manualAssetUrl) return;
                      const label = (manualAssetFileName || manualAssetAlt || "file").trim() || "file";
                      setManualContent((prev) => {
                        const p = String(prev || "");
                        const snippet = `[${label}](${manualAssetUrl})`;
                        if (!p.trim()) return `${snippet}\n`;
                        return p.endsWith("\n") ? `${p}\n${snippet}\n` : `${p}\n\n${snippet}\n`;
                      });
                    }}
                  >
                    Insert link
                  </button>
                </div>

                <PortalMediaPickerModal
                  open={manualAssetPickerOpen}
                  title="Choose a file"
                  confirmLabel="Use"
                  onClose={() => setManualAssetPickerOpen(false)}
                  onPick={(item) => {
                    setManualAssetUrl(item.shareUrl);
                    setManualAssetFileName(String(item.fileName || ""));
                    setManualAssetPickerOpen(false);
                  }}
                />

                {manualImagePreviewOpen && manualImagePreview ? (
                  <div
                    className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 p-3 sm:items-center"
                    onMouseDown={() => {
                      if (manualImageImporting) return;
                      setManualImagePreviewOpen(false);
                    }}
                  >
                    <div
                      className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">
                            {manualImagePreview.title.replace(/^File:/, "") || "Royalty-free image"}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">Wikimedia Commons</div>
                        </div>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                          onClick={() => setManualImagePreviewOpen(false)}
                          disabled={manualImageImporting}
                        >
                          Close
                        </button>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={manualImagePreview.url || manualImagePreview.thumbUrl}
                          alt={manualImagePreview.title}
                          className="max-h-[70vh] w-full object-contain"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <a
                          className="text-xs font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                          href={manualImagePreview.sourcePage}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View source
                        </a>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                            disabled={manualImageImporting}
                            onClick={() => {
                              setManualAssetUrl(manualImagePreview.url || manualImagePreview.thumbUrl);
                              setManualAssetFileName(
                                (manualImagePreview.title || "")
                                  .replace(/^File:/, "")
                                  .trim()
                                  .slice(0, 120),
                              );
                              setManualImagePreviewOpen(false);
                            }}
                          >
                            Use without saving
                          </button>
                          <button
                            type="button"
                            className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                            disabled={manualImageImporting}
                            onClick={async () => {
                              setManualImageImporting(true);
                              try {
                                const fileName = (manualImagePreview.title || "")
                                  .replace(/^File:/, "")
                                  .trim()
                                  .slice(0, 200);
                                const res = await fetch("/api/portal/media/import-remote", {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({
                                    url: manualImagePreview.url || manualImagePreview.thumbUrl,
                                    fileName: fileName || null,
                                  }),
                                });
                                const json = (await res.json().catch(() => ({}))) as any;
                                if (!res.ok || !json?.ok || !json?.item?.shareUrl) {
                                  toast.error(String(json?.error || "Import failed"));
                                  return;
                                }
                                setManualAssetUrl(String(json.item.shareUrl));
                                setManualAssetFileName(fileName || "image");
                                toast.success("Added to Media Library");
                                setManualImagePreviewOpen(false);
                              } finally {
                                setManualImageImporting(false);
                              }
                            }}
                          >
                            Use + add to Media Library
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Royalty-free images</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={manualImageSearch}
                      onChange={(e) => setManualImageSearch(e.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="Search (e.g. office team, roofing, plumbing)…"
                    />
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      onClick={() => void searchManualImages()}
                      disabled={manualImageSearching}
                    >
                      {manualImageSearching ? "Searching…" : "Search"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {manualImageResults.slice(0, 6).map((img) => (
                      <button
                        key={img.url}
                        type="button"
                        className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2 text-left hover:bg-zinc-50"
                        onClick={() => {
                          setManualImagePreview(img);
                          setManualImagePreviewOpen(true);
                        }}
                        title={img.sourcePage}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumbUrl} alt={img.title} className="h-14 w-14 rounded-xl object-cover" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-zinc-900">{img.title.replace(/^File:/, "")}</div>
                          <div className="truncate text-[11px] text-zinc-500">Wikimedia Commons</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Images are sourced from Wikimedia Commons.</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => void createManual("DRAFT")}
                  disabled={manualCreating}
                >
                  {manualCreating ? "Working…" : "Create draft"}
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                  onClick={() => void createManual("READY")}
                  disabled={manualCreating}
                >
                  {manualCreating ? "Working…" : "Create READY"}
                </button>
              </div>
            </div>
          ) : null}

          {mode === "ai" ? (
            <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={Boolean(settings?.enabled)}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))}
              />
              <div className="text-sm font-semibold text-zinc-800">Enabled</div>
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Frequency (days)</div>
              <input
                type="number"
                min={1}
                max={30}
                value={settings?.frequencyDays ?? 7}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, frequencyDays: Math.max(1, Math.min(30, Math.floor(Number(e.target.value) || 7))) } : prev,
                  )
                }
                className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={Boolean(settings?.requireApproval)}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, requireApproval: e.target.checked } : prev))}
              />
              <div>
                <div className="text-sm font-semibold text-zinc-800">Require approval</div>
                <div className="mt-1 text-xs text-zinc-500">If enabled, scheduled runs create READY drafts you manually send.</div>
              </div>
            </label>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channels</div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.channels?.email)}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, channels: { ...prev.channels, email: e.target.checked } } : prev))
                    }
                  />
                  Email
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.channels?.sms)}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, channels: { ...prev.channels, sms: e.target.checked } } : prev))
                    }
                  />
                  SMS (link)
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Delivery copy (AI)</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-600">Email message guidance</div>
                  <textarea
                    value={settings?.deliveryEmailHint ?? ""}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, deliveryEmailHint: e.target.value.slice(0, 1500) } : prev))}
                    rows={3}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Example: Keep it short. Mention the key value + 1 clear CTA. No URL; the system appends the hosted link."
                  />
                </label>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-600">SMS message guidance</div>
                  <textarea
                    value={settings?.deliverySmsHint ?? ""}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, deliverySmsHint: e.target.value.slice(0, 800) } : prev))}
                    rows={3}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Example: Under 140 characters if possible. Direct and friendly. No URL (system appends link)."
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Images (AI)</div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.includeImages)}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, includeImages: e.target.checked } : prev))}
                  />
                  Include royalty-free images
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.includeImagesWhereNeeded)}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, includeImagesWhereNeeded: e.target.checked } : prev))}
                    disabled={!Boolean(settings?.includeImages)}
                  />
                  Only where needed
                </label>
                <div className="text-xs text-zinc-500">Images are pulled from Wikimedia Commons and inserted into the hosted page Markdown.</div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Last generated</div>
              <div className="mt-2 text-sm text-zinc-800">{formatDate(settings?.lastGeneratedAt ?? null) || "—"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next due</div>
              <div className="mt-2 text-sm text-zinc-800">{formatDate(settings?.nextDueAt ?? null) || "—"}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-900">Guided prompt</div>
            <div className="mt-3 grid gap-3">
              {promptFields.map((f) => (
                <label key={f.key} className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{f.label}</div>
                  <textarea
                    value={settings?.promptAnswers?.[f.key] ?? ""}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, promptAnswers: { ...prev.promptAnswers, [f.key]: e.target.value.slice(0, 2000) } }
                          : prev,
                      )
                    }
                    rows={2}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder={audience === "internal" ? "Type a few bullets…" : "Type a few sentences…"}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-900">Topic hints (optional)</div>
            <div className="mt-2 text-sm text-zinc-600">One per line. The generator will rotate through these.</div>
            <textarea
              value={(settings?.topics ?? []).join("\n")}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, topics: splitLines(e.target.value) } : prev,
                )
              }
              rows={4}
              className="mt-3 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder={audience === "internal" ? "Weekly priorities\nOps changes\nHiring" : "Seasonal maintenance tips\nBefore/after photos\nFAQ"}
            />
          </div>
            </>
          ) : null}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Audience</div>
          <div className="mt-2 text-sm text-zinc-600">Select tags to include in the send list.</div>

          <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded-2xl border border-zinc-200 p-3">
            {tags.length ? (
              tags.map((t) => (
                <label key={t.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTagIds.has(t.id)}
                    onChange={(e) =>
                      setSettings((prev) => {
                        if (!prev) return prev;
                        const next = new Set(prev.audience.tagIds);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        return { ...prev, audience: { ...prev.audience, tagIds: Array.from(next) } };
                      })
                    }
                  />
                  <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || "#a1a1aa" }} />
                  <span className="text-zinc-800">{t.name}</span>
                </label>
              ))
            ) : (
              <div className="text-sm text-zinc-500">No tags yet.</div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-600">Create new tag</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                placeholder="Tag name"
                value={createTagName}
                onChange={(e) => setCreateTagName(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 py-2">
                {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                  const selected = c === createTagColor;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={
                        "h-6 w-6 rounded-full border " +
                        (selected ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200")
                      }
                      style={{ backgroundColor: c }}
                      onClick={() => setCreateTagColor(c)}
                      title={c}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">Pick a default color.</div>
              <button
                type="button"
                className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                disabled={createTagBusy}
                onClick={() => void createOwnerTag()}
              >
                {createTagBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>

          {audience === "external" ? (
            <div className="mt-5">
              <div className="text-sm font-semibold text-zinc-900">Manually add people to this newsletter list</div>
              <div className="mt-2 text-sm text-zinc-600">Search contacts by name, email, or phone and add them.</div>

              <input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                placeholder="Search contacts…"
              />

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Results</div>
                <div className="mt-2 space-y-2">
                  {contactSearching ? (
                    <div className="text-sm text-zinc-600">Searching…</div>
                  ) : contactResults.length ? (
                    contactResults.slice(0, 25).map((c) => {
                      const added = selectedContactIds.has(c.id);
                      return (
                        <div key={c.id} className="rounded-2xl border border-zinc-200 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">{c.name || c.email || c.phone || "(contact)"}</div>
                              <div className="mt-1 text-xs text-zinc-500">
                                {c.email ? c.email : ""}{c.email && c.phone ? " · " : ""}{c.phone ? c.phone : ""}
                              </div>
                              <div className="mt-2">
                                <ContactTagsEditor
                                  contactId={c.id}
                                  tags={c.tags}
                                  compact
                                  onChange={(next) => {
                                    setContactResults((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags: next } : x)));
                                    setSelectedContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags: next } : x)));
                                  }}
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              className={
                                "rounded-2xl px-3 py-2 text-sm font-semibold " +
                                (added
                                  ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                                  : "bg-zinc-900 text-white hover:bg-zinc-800")
                              }
                              onClick={() =>
                                setSettings((prev) => {
                                  if (!prev) return prev;
                                  const ids = new Set(prev.audience.contactIds);
                                  if (added) ids.delete(c.id);
                                  else ids.add(c.id);
                                  return { ...prev, audience: { ...prev.audience, contactIds: Array.from(ids).slice(0, 200) } };
                                })
                              }
                            >
                              {added ? "Remove" : "Add"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-zinc-600">Type at least 2 characters to search.</div>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Selected people</div>
                <div className="mt-2 space-y-2">
                  {selectedContacts.length ? (
                    selectedContacts.slice(0, 50).map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">{c.name || c.email || c.phone || c.id}</div>
                          <div className="mt-0.5 truncate text-xs text-zinc-500">
                            {c.email ? c.email : ""}{c.email && c.phone ? " · " : ""}{c.phone ? c.phone : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() =>
                            setSettings((prev) => {
                              if (!prev) return prev;
                              const ids = prev.audience.contactIds.filter((id) => id !== c.id);
                              return { ...prev, audience: { ...prev.audience, contactIds: ids } };
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-600">No manual people selected.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {audience === "internal" ? (
            <div className="mt-5 space-y-4">
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.audience?.sendAllUsers)}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, audience: { ...prev.audience, sendAllUsers: e.target.checked } } : prev,
                    )
                  }
                />
                <div>
                  <div className="text-sm font-semibold text-zinc-800">Send to all users under this account</div>
                  <div className="mt-1 text-xs text-zinc-500">Includes all team members. Use extra emails for additional recipients.</div>
                </div>
              </label>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Extra emails (internal only)</div>
                <div className="mt-2 text-sm text-zinc-600">Add one at a time, or upload a CSV.</div>

                <div className="mt-3 flex gap-2">
                  <input
                    value={internalEmailInput}
                    onChange={(e) => setInternalEmailInput(e.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                    placeholder="name@company.com"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const next = internalEmailInput.trim();
                      if (!isEmail(next)) {
                        toast.error("Enter a valid email");
                        return;
                      }
                      setSettings((prev) => {
                        if (!prev) return prev;
                        const nextSet = new Set(prev.audience.emails.map((x) => x.toLowerCase()));
                        const normalized = next.toLowerCase();
                        const emails = [...prev.audience.emails];
                        if (!nextSet.has(normalized)) emails.push(next);
                        return { ...prev, audience: { ...prev.audience, emails: emails.slice(0, 200) } };
                      });
                      setInternalEmailInput("");
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    onClick={() => {
                      const next = internalEmailInput.trim();
                      if (!isEmail(next)) {
                        toast.error("Enter a valid email");
                        return;
                      }
                      setSettings((prev) => {
                        if (!prev) return prev;
                        const nextSet = new Set(prev.audience.emails.map((x) => x.toLowerCase()));
                        const normalized = next.toLowerCase();
                        const emails = [...prev.audience.emails];
                        if (!nextSet.has(normalized)) emails.push(next);
                        return { ...prev, audience: { ...prev.audience, emails: emails.slice(0, 200) } };
                      });
                      setInternalEmailInput("");
                    }}
                  >
                    +
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(settings?.audience?.emails ?? []).length ? (
                    (settings?.audience?.emails ?? []).map((e) => (
                      <button
                        key={e}
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        title="Remove"
                        onClick={() =>
                          setSettings((prev) => {
                            if (!prev) return prev;
                            return { ...prev, audience: { ...prev.audience, emails: prev.audience.emails.filter((x) => x !== e) } };
                          })
                        }
                      >
                        {e}
                        <span className="text-zinc-400">×</span>
                      </button>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-600">No extra emails added.</div>
                  )}
                </div>

                <div className="mt-3">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    Upload CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const text = await file.text();
                          const parsed = splitEmails(text).filter(isEmail);
                          if (!parsed.length) {
                            toast.error("No valid emails found in CSV");
                            return;
                          }
                          setSettings((prev) => {
                            if (!prev) return prev;
                            const next = new Map<string, string>();
                            for (const x of prev.audience.emails) next.set(x.toLowerCase(), x);
                            for (const x of parsed) next.set(x.toLowerCase(), x);
                            return { ...prev, audience: { ...prev.audience, emails: Array.from(next.values()).slice(0, 200) } };
                          });
                          toast.success(`Added ${parsed.length} emails`);
                        } finally {
                          if (e.target) e.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Usage (30d)</div>
            <div className="mt-2 text-sm text-zinc-800">
              {creditsUsed30d === null ? "—" : `${creditsUsed30d} credits used`} · {generations30d === null ? "—" : `${generations30d} generations`}
            </div>
          </div>

          {siteHandle ? (
            <div className="mt-4 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hosted pages</div>
              <div className="mt-2 flex flex-col gap-2">
                <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 break-all">
                  {publicBaseUrl}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={async () => {
                      if (!publicBaseUrl) return;
                      try {
                        await navigator.clipboard.writeText(publicBaseUrl);
                        toast.success("Copied");
                      } catch {
                        toast.error("Copy failed");
                      }
                    }}
                  >
                    Copy link
                  </button>
                  <Link
                    href={publicBasePath || "#"}
                    target="_blank"
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">Configure hosting in Settings once the site is created.</div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Recent newsletters</div>
            <div className="mt-1 text-sm text-zinc-600">READY drafts can be sent manually when approval is required.</div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {newsletters.length ? (
            newsletters.map((n) => {
              const publicPath = siteHandle
                ? `${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${n.slug}`
                : null;

              return (
                <div key={n.id} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{n.title || "(untitled)"}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {n.status} · created {formatDate(n.createdAtIso)}{n.sentAtIso ? ` · sent ${formatDate(n.sentAtIso)}` : ""}
                      </div>
                      <div className="mt-2 text-sm text-zinc-600">{n.excerpt}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {publicPath ? (
                        <Link
                          href={publicPath}
                          target="_blank"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          View hosted
                        </Link>
                      ) : null}

                      {n.status !== "SENT" ? (
                        <button
                          type="button"
                          onClick={() => void openDraft(n.id)}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Edit / preview
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openDraft(n.id)}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Edit hosted
                        </button>
                      )}

                      {n.status === "READY" ? (
                        <button
                          type="button"
                          onClick={() => void sendReady(n.id)}
                          className="rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                        >
                          Send now
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-zinc-600">No newsletters yet.</div>
          )}
        </div>
      </div>

      {draftOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setDraftOpen(false)}>
          <div
            className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{draftStatus === "SENT" ? "Hosted page editor" : "Draft editor"}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {draftStatus === "SENT"
                    ? "Edits update the hosted page only. Email/SMS were already sent."
                    : "Edit what will be sent and preview email/SMS."}
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setDraftOpen(false)}
                disabled={draftSaving}
              >
                Close
              </button>
            </div>

            {draftLoading ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">Loading…</div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Draft fields</div>

                  {draftError ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{draftError}</div>
                  ) : null}

                  {draftStatus === "SENT" ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This newsletter was already sent. Saving will only change the hosted page version.
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">Title</label>
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      maxLength={180}
                    />
                  </div>

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">Excerpt</label>
                    <textarea
                      value={draftExcerpt}
                      onChange={(e) => setDraftExcerpt(e.target.value)}
                      className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      maxLength={6000}
                    />
                    <div className="mt-1 text-xs text-zinc-500">This is what the email contains today (plus the hosted link).</div>
                  </div>

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">SMS text</label>
                    <input
                      value={draftSmsText}
                      onChange={(e) => setDraftSmsText(e.target.value)}
                      disabled={draftStatus === "SENT"}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="New newsletter is ready."
                      maxLength={240}
                    />
                    <div className="mt-1 text-xs text-zinc-500">
                      {draftStatus === "SENT" ? "Locked after sending." : "A hosted link is appended automatically."}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">Hosted page content (Markdown)</label>
                    <div className="mt-1">
                      <RichTextMarkdownEditor markdown={draftContent} onChange={setDraftContent} placeholder="Write the hosted content…" disabled={draftSaving} />
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-700">Files & photos</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">Alt text (optional)</label>
                        <input
                          value={assetAlt}
                          onChange={(e) => setAssetAlt(e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                          placeholder="Team photo, receipt, etc."
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">URL (optional)</label>
                        <input
                          value={assetUrl ?? ""}
                          onChange={(e) => setAssetUrl(e.target.value.trim() ? e.target.value : null)}
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                          placeholder="https://…"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                        {assetBusy ? "Uploading…" : "Upload image"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={assetBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setAssetBusy(true);
                            try {
                              const fd = new FormData();
                              fd.set("file", file);
                              const up = await fetch("/api/uploads", { method: "POST", body: fd });
                              const upBody = (await up.json().catch(() => ({}))) as any;
                              if (!up.ok || !upBody.url) {
                                toast.error(String(upBody.error || "Upload failed"));
                                return;
                              }
                              setAssetUrl(String(upBody.url));
                              setAssetFileName(String(upBody.fileName || file.name || ""));
                            } finally {
                              setAssetBusy(false);
                              if (e.target) e.target.value = "";
                            }
                          }}
                        />
                      </label>

                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                        {assetBusy ? "Uploading…" : "Upload file"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={assetBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setAssetBusy(true);
                            try {
                              const fd = new FormData();
                              fd.set("file", file);
                              const up = await fetch("/api/uploads", { method: "POST", body: fd });
                              const upBody = (await up.json().catch(() => ({}))) as any;
                              if (!up.ok || !upBody.url) {
                                toast.error(String(upBody.error || "Upload failed"));
                                return;
                              }
                              setAssetUrl(String(upBody.url));
                              setAssetFileName(String(upBody.fileName || file.name || "file"));
                            } finally {
                              setAssetBusy(false);
                              if (e.target) e.target.value = "";
                            }
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => setAssetPickerOpen(true)}
                      >
                        Choose from media library
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!assetUrl}
                        className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                        onClick={() => {
                          if (!assetUrl) return;
                          const alt = assetAlt.trim() || "image";
                          insertIntoDraftContent(`![${alt}](${assetUrl})`);
                        }}
                      >
                        Insert image
                      </button>
                      <button
                        type="button"
                        disabled={!assetUrl}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        onClick={() => {
                          if (!assetUrl) return;
                          const label = (assetFileName || assetAlt || "file").trim() || "file";
                          insertIntoDraftContent(`[${label}](${assetUrl})`);
                        }}
                      >
                        Insert link
                      </button>
                    </div>

                    <PortalMediaPickerModal
                      open={assetPickerOpen}
                      title="Choose a file"
                      confirmLabel="Use"
                      onClose={() => setAssetPickerOpen(false)}
                      onPick={(item) => {
                        setAssetUrl(item.shareUrl);
                        setAssetFileName(String(item.fileName || ""));
                        setAssetPickerOpen(false);
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    {siteHandle && draftSlug ? (
                      <Link
                        href={`${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`}
                        target="_blank"
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Open hosted
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => {
                        setDraftOpen(false);
                      }}
                      disabled={draftSaving}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                      onClick={() => void saveDraft()}
                      disabled={draftSaving || !draftTitle.trim()}
                    >
                      {draftSaving ? "Saving…" : draftStatus === "SENT" ? "Save hosted page" : "Save draft"}
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview</div>

                  {siteHandle && draftSlug ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-xs font-semibold text-zinc-700">Hosted link</div>
                      <div className="mt-1 text-xs text-zinc-700 break-all">
                        {typeof window === "undefined"
                          ? `${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`
                          : `${window.location.origin}${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-zinc-900">Email preview</div>
                    <div className="mt-2 text-xs text-zinc-500">Subject uses the title. Body uses excerpt + hosted link.</div>

                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold text-zinc-700">Subject</div>
                      <div className="mt-1 text-sm text-zinc-900">{draftTitle || "(untitled)"}</div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold text-zinc-700">Body</div>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-800">
                        {buildNewsletterEmailPreview({
                          excerpt: draftExcerpt,
                          link:
                            typeof window === "undefined" || !siteHandle || !draftSlug
                              ? "(hosted link)"
                              : `${window.location.origin}${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`,
                        })}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-sm font-semibold text-zinc-900">SMS preview</div>
                    <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-3">
                      <pre className="whitespace-pre-wrap break-words text-xs text-zinc-800">
                        {buildNewsletterSmsPreview({
                          smsText: draftSmsText || null,
                          link:
                            typeof window === "undefined" || !siteHandle || !draftSlug
                              ? "(hosted link)"
                              : `${window.location.origin}${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`,
                        })}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</div>
                    <div className="mt-2 text-sm text-zinc-800">{draftStatus}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {draftStatus === "SENT"
                        ? "SENT newsletters can be edited for the hosted page only."
                        : "READY drafts are safe to edit before sending."}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
