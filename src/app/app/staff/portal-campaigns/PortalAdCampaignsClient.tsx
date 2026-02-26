"use client";

import { useEffect, useMemo, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalMultiSelectDropdown } from "@/components/PortalMultiSelectDropdown";
import { BUSINESS_MODEL_SUGGESTIONS, INDUSTRY_SUGGESTIONS, PORTAL_ONBOARDING_PLANS } from "@/lib/portalOnboardingWizardCatalog";

type Placement = "SIDEBAR_BANNER" | "BILLING_SPONSORED" | "FULLSCREEN_REWARD";

type CampaignRow = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  placement: Placement;
  startAt: string | null;
  endAt: string | null;
  targetJson: any;
  creativeJson: any;
  rewardJson: any;
  createdAt: string;
  updatedAt: string;
};

type OwnerRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
  businessProfile: { businessName: string; industry: string | null; businessModel: string | null } | null;
};

type CreativeVariantDraft = {
  headline: string;
  body: string;
  ctaText: string;
  linkUrl: string;
  mediaKind: "image" | "video";
  mediaUrl: string;
};

type OfferDraft =
  | {
      kind: "credits";
      credits: number;
      cooldownHours: number;
      minWatchSeconds: number;
    }
  | {
      kind: "discount";
      label: string;
      promoCode: string;
      appliesToServiceSlugs: string[];
    };

function uniq(xs: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of xs) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function toLocalDateTimeInputValue(iso: string | null | undefined): string {
  const s = String(iso || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localDateTimeInputToIsoOrNull(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  // Treat as local time.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function placementLabel(p: Placement) {
  if (p === "SIDEBAR_BANNER") return "Sidebar banner";
  if (p === "BILLING_SPONSORED") return "Billing sponsored";
  return "Fullscreen reward";
}

export default function PortalAdCampaignsClient() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<null | {
    id?: string;
    step: 0 | 1 | 2 | 3;

    name: string;
    enabled: boolean;
    priority: number;
    placements: Placement[];
    startAtLocal: string;
    endAtLocal: string;

    // targeting
    portalVariant: "any" | "portal" | "credit";
    billingModel: "any" | "subscription" | "credits";
    industries: string[];
    businessModels: string[];
    serviceSlugsAny: string[];
    serviceSlugsAll: string[];
    paths: string[];
    bucketIds: string[];
    includeOwnerIds: string[];
    excludeOwnerIds: string[];

    // creative
    creatives: CreativeVariantDraft[];

    // offers
    offers: OfferDraft[];
  }>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCampaignId, setAssignCampaignId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Array<{ ownerId: string; email: string; businessName: string }>>([]);

  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnerRow[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);

  const [targetOwnerQuery, setTargetOwnerQuery] = useState("");
  const [targetOwnerResults, setTargetOwnerResults] = useState<OwnerRow[]>([]);
  const [targetOwnerLoading, setTargetOwnerLoading] = useState(false);

  const [buckets, setBuckets] = useState<Array<{ id: string; name: string; description: string | null; membersCount: number }>>([]);
  const [bucketManagerOpen, setBucketManagerOpen] = useState(false);
  const [activeBucketId, setActiveBucketId] = useState<string | null>(null);
  const [bucketMembers, setBucketMembers] = useState<Array<{ ownerId: string; email: string; businessName: string }>>([]);
  const [bucketNameDraft, setBucketNameDraft] = useState("");
  const [bucketDescDraft, setBucketDescDraft] = useState("");
  const [bucketBusy, setBucketBusy] = useState(false);

  const [mediaUploading, setMediaUploading] = useState(false);

  async function loadCampaigns() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/staff/portal/ad-campaigns", { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      const msg = typeof body?.error === "string" && body.error.trim()
        ? body.error.trim()
        : `Unable to load campaigns${res?.status ? ` (${res.status})` : ""}.`;
      setError(msg);
      setLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as any;
    if (!json?.ok || !Array.isArray(json.campaigns)) {
      setError("Unexpected response.");
      setLoading(false);
      return;
    }
    setCampaigns(json.campaigns);
    setLoading(false);
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  async function loadBuckets() {
    const res = await fetch("/api/staff/portal/targeting-buckets", { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as any;
    if (!res?.ok || !json?.ok || !Array.isArray(json.buckets)) {
      setBuckets([]);
      return;
    }
    setBuckets(
      json.buckets.map((b: any) => ({
        id: String(b.id),
        name: String(b.name),
        description: b.description == null ? null : String(b.description),
        membersCount: Number.isFinite(Number(b.membersCount)) ? Number(b.membersCount) : 0,
      })),
    );
  }

  async function loadBucketMembers(bucketId: string) {
    const res = await fetch(`/api/staff/portal/targeting-buckets/${encodeURIComponent(bucketId)}/members`, { cache: "no-store" }).catch(
      () => null as any,
    );
    const json = (await res?.json().catch(() => null)) as any;
    if (!res?.ok || !json?.ok || !Array.isArray(json.members)) {
      setBucketMembers([]);
      return;
    }
    setBucketMembers(
      json.members.map((m: any) => ({
        ownerId: String(m.ownerId),
        email: String(m.email || ""),
        businessName: String(m.businessName || ""),
      })),
    );
  }

  async function createBucket() {
    const name = bucketNameDraft.trim();
    if (name.length < 2) {
      setError("Bucket name is too short.");
      return;
    }

    setBucketBusy(true);
    try {
      const res = await fetch("/api/staff/portal/targeting-buckets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: bucketDescDraft.trim() || null }),
      }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !json?.ok) {
        setError(json?.error || "Unable to create bucket.");
        return;
      }
      setBucketNameDraft("");
      setBucketDescDraft("");
      await loadBuckets();
    } finally {
      setBucketBusy(false);
    }
  }

  async function deleteBucket(id: string) {
    if (!confirm("Delete this bucket?")) return;
    setBucketBusy(true);
    try {
      const res = await fetch(`/api/staff/portal/targeting-buckets?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !json?.ok) {
        setError(json?.error || "Unable to delete bucket.");
        return;
      }
      if (activeBucketId === id) {
        setActiveBucketId(null);
        setBucketMembers([]);
      }
      await loadBuckets();
    } finally {
      setBucketBusy(false);
    }
  }

  async function addBucketMembers(bucketId: string, ownerIds: string[]) {
    const ids = uniq(ownerIds);
    if (!ids.length) return;
    setBucketBusy(true);
    try {
      const res = await fetch(`/api/staff/portal/targeting-buckets/${encodeURIComponent(bucketId)}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerIds: ids }),
      }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !json?.ok) {
        setError(json?.error || "Unable to add members.");
        return;
      }
      await loadBucketMembers(bucketId);
      await loadBuckets();
    } finally {
      setBucketBusy(false);
    }
  }

  async function removeBucketMember(bucketId: string, ownerId: string) {
    setBucketBusy(true);
    try {
      const res = await fetch(
        `/api/staff/portal/targeting-buckets/${encodeURIComponent(bucketId)}/members?ownerId=${encodeURIComponent(ownerId)}`,
        { method: "DELETE" },
      ).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !json?.ok) {
        setError(json?.error || "Unable to remove member.");
        return;
      }
      await loadBucketMembers(bucketId);
      await loadBuckets();
    } finally {
      setBucketBusy(false);
    }
  }

  async function uploadStaffMedia(files: File[]) {
    if (!files.length) return [] as Array<{ openUrl: string; previewUrl?: string; mimeType: string; fileName: string }>;
    const form = new FormData();
    for (const f of files) form.append("files", f);

    setMediaUploading(true);
    try {
      const res = await fetch("/api/staff/media/items", { method: "POST", body: form }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !json?.ok || !Array.isArray(json.items)) {
        setError(json?.error || "Upload failed.");
        return [];
      }
      return json.items.map((it: any) => ({
        openUrl: String(it.openUrl || ""),
        previewUrl: it.previewUrl ? String(it.previewUrl) : undefined,
        mimeType: String(it.mimeType || "application/octet-stream"),
        fileName: String(it.fileName || "upload"),
      }));
    } finally {
      setMediaUploading(false);
    }
  }

  useEffect(() => {
    if (!editor && !bucketManagerOpen) return;
    void loadBuckets();
  }, [bucketManagerOpen, editor]);

  const sorted = useMemo(() => {
    const xs = [...campaigns];
    xs.sort((a, b) => {
      if ((b.enabled ? 1 : 0) !== (a.enabled ? 1 : 0)) return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    return xs;
  }, [campaigns]);

  const industryOptions = useMemo(() => INDUSTRY_SUGGESTIONS.map((s) => ({ value: s, label: s })), []);
  const businessModelOptions = useMemo(() => BUSINESS_MODEL_SUGGESTIONS.map((s) => ({ value: s, label: s })), []);

  const serviceSlugOptions = useMemo(() => {
    const slugs = new Set<string>();
    for (const p of PORTAL_ONBOARDING_PLANS) {
      for (const slug of p.serviceSlugsToActivate || []) slugs.add(String(slug));
    }
    const xs = Array.from(slugs).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return xs.map((s) => ({ value: s, label: s }));
  }, []);

  const pathSuggestions = useMemo(
    () => [
      { value: "/portal/app/billing", label: "/portal/app/billing" },
      { value: "/portal/app/services/*", label: "/portal/app/services/*" },
      { value: "/portal/app/dashboard", label: "/portal/app/dashboard" },
      { value: "/credit/app/billing", label: "/credit/app/billing" },
      { value: "/credit/app/services/*", label: "/credit/app/services/*" },
    ],
    [],
  );

  function openCreate() {
    setEditor({
      step: 0,
      name: "New campaign",
      enabled: true,
      priority: 0,
      placements: ["SIDEBAR_BANNER"],
      startAtLocal: "",
      endAtLocal: "",

      portalVariant: "portal",
      billingModel: "credits",
      industries: [],
      businessModels: [],
      serviceSlugsAny: [],
      serviceSlugsAll: [],
      paths: ["/portal/app/billing"],
      bucketIds: [],
      includeOwnerIds: [],
      excludeOwnerIds: [],

      creatives: [
        {
          headline: "Sponsored by Purely Automation",
          body: "Explore add-ons and unlock more automation.",
          ctaText: "View upgrades",
          linkUrl: "/portal/app/billing",
          mediaKind: "image",
          mediaUrl: "",
        },
      ],

      offers: [
        {
          kind: "credits",
          credits: 25,
          cooldownHours: 24,
          minWatchSeconds: 15,
        },
      ],
    });
  }

  function openEdit(row: CampaignRow) {
    const t = (row.targetJson ?? {}) as any;
    const c = (row.creativeJson ?? {}) as any;
    const r = (row.rewardJson ?? {}) as any;

    const variantsRaw = Array.isArray(c.variants) ? c.variants : null;
    const creatives: CreativeVariantDraft[] = variantsRaw?.length
      ? variantsRaw.map((v: any) => ({
          headline: String(v?.headline ?? ""),
          body: String(v?.body ?? ""),
          ctaText: String(v?.ctaText ?? ""),
          linkUrl: String(v?.linkUrl ?? ""),
          mediaKind: v?.mediaKind === "video" ? "video" : "image",
          mediaUrl: String(v?.mediaUrl ?? ""),
        }))
      : [
          {
            headline: String(c.headline ?? ""),
            body: String(c.body ?? ""),
            ctaText: String(c.ctaText ?? ""),
            linkUrl: String(c.linkUrl ?? ""),
            mediaKind: c.mediaKind === "video" ? "video" : "image",
            mediaUrl: String(c.mediaUrl ?? ""),
          },
        ];

    const offersRaw = Array.isArray(r.offers) ? r.offers : null;
    const offers: OfferDraft[] = offersRaw?.length
      ? offersRaw
          .map((o: any) => {
            const kind = String(o?.kind || "").trim().toLowerCase();
            if (kind === "discount") {
              return {
                kind: "discount" as const,
                label: String(o?.label ?? ""),
                promoCode: String(o?.promoCode ?? ""),
                appliesToServiceSlugs: Array.isArray(o?.appliesToServiceSlugs) ? o.appliesToServiceSlugs.map(String) : [],
              };
            }
            return {
              kind: "credits" as const,
              credits: Number.isFinite(Number(o?.credits)) ? Math.max(0, Math.floor(Number(o?.credits))) : 0,
              cooldownHours: Number.isFinite(Number(o?.cooldownHours)) ? Math.max(0, Math.floor(Number(o?.cooldownHours))) : 0,
              minWatchSeconds: Number.isFinite(Number(o?.minWatchSeconds)) ? Math.max(0, Math.floor(Number(o?.minWatchSeconds))) : 0,
            };
          })
          .filter(Boolean)
      : [
          {
            kind: "credits" as const,
            credits: Number.isFinite(Number(r.credits)) ? Math.max(0, Math.floor(Number(r.credits))) : 0,
            cooldownHours: Number.isFinite(Number(r.cooldownHours)) ? Math.max(0, Math.floor(Number(r.cooldownHours))) : 0,
            minWatchSeconds: Number.isFinite(Number(r.minWatchSeconds)) ? Math.max(0, Math.floor(Number(r.minWatchSeconds))) : 0,
          },
        ];

    setEditor({
      id: row.id,
      step: 0,
      name: row.name,
      enabled: Boolean(row.enabled),
      priority: typeof row.priority === "number" ? row.priority : 0,
      placements: [row.placement],
      startAtLocal: row.startAt ? toLocalDateTimeInputValue(row.startAt) : "",
      endAtLocal: row.endAt ? toLocalDateTimeInputValue(row.endAt) : "",

      portalVariant: (t.portalVariant === "credit" || t.portalVariant === "portal" || t.portalVariant === "any") ? t.portalVariant : "any",
      billingModel: (t.billingModel === "subscription" || t.billingModel === "credits" || t.billingModel === "any") ? t.billingModel : "any",
      industries: Array.isArray(t.industries) ? t.industries.map(String).filter(Boolean) : [],
      businessModels: Array.isArray(t.businessModels) ? t.businessModels.map(String).filter(Boolean) : [],
      serviceSlugsAny: Array.isArray(t.serviceSlugsAny) ? t.serviceSlugsAny.map(String).filter(Boolean) : [],
      serviceSlugsAll: Array.isArray(t.serviceSlugsAll) ? t.serviceSlugsAll.map(String).filter(Boolean) : [],
      paths: Array.isArray(t.paths) ? t.paths.map(String).filter(Boolean) : [],
      bucketIds: Array.isArray(t.bucketIds) ? t.bucketIds.map(String).filter(Boolean) : [],
      includeOwnerIds: Array.isArray(t.includeOwnerIds) ? t.includeOwnerIds.map(String).filter(Boolean) : [],
      excludeOwnerIds: Array.isArray(t.excludeOwnerIds) ? t.excludeOwnerIds.map(String).filter(Boolean) : [],

      creatives,
      offers,
    });
  }

  async function saveEditor() {
    if (!editor) return;
    setError(null);

    const placements = uniq(editor.placements);
    if (!placements.length) {
      setError("Pick at least one placement.");
      return;
    }

    const targetJson: any = {
      portalVariant: editor.portalVariant,
      billingModel: editor.billingModel,
      industries: uniq(editor.industries),
      businessModels: uniq(editor.businessModels),
      serviceSlugsAny: uniq(editor.serviceSlugsAny),
      serviceSlugsAll: uniq(editor.serviceSlugsAll),
      paths: uniq(editor.paths),
      bucketIds: uniq(editor.bucketIds),
      includeOwnerIds: uniq(editor.includeOwnerIds),
      excludeOwnerIds: uniq(editor.excludeOwnerIds),
    };

    const cleanedCreatives = (editor.creatives || [])
      .map((v) => ({
        headline: String(v.headline || "").trim(),
        body: String(v.body || "").trim(),
        ctaText: String(v.ctaText || "").trim(),
        linkUrl: String(v.linkUrl || "").trim(),
        mediaKind: v.mediaKind === "video" ? "video" : "image",
        mediaUrl: String(v.mediaUrl || "").trim(),
      }))
      .filter((v) => v.headline || v.body || v.mediaUrl || v.linkUrl);

    const creativeJson: any =
      cleanedCreatives.length > 1
        ? { variants: cleanedCreatives }
        : cleanedCreatives.length === 1
          ? cleanedCreatives[0]
          : { headline: "", body: "", ctaText: "", linkUrl: "", mediaKind: "image", mediaUrl: "" };

    const offers = (editor.offers || []).filter(Boolean);
    const creditsOffer = offers.find((o) => o.kind === "credits") as Extract<OfferDraft, { kind: "credits" }> | undefined;
    const credits = Math.max(0, Math.floor(Number(creditsOffer?.credits || 0)));
    const cooldownHours = Math.max(0, Math.floor(Number(creditsOffer?.cooldownHours || 0)));
    const minWatchSeconds = Math.max(0, Math.floor(Number(creditsOffer?.minWatchSeconds || 0)));

    const rewardJson: any =
      credits || cooldownHours || minWatchSeconds || offers.some((o) => o.kind !== "credits")
        ? {
            // Back-compat for claim flow.
            credits: credits || undefined,
            cooldownHours: cooldownHours || undefined,
            minWatchSeconds: minWatchSeconds || undefined,
            offers,
          }
        : null;

    const url = "/api/staff/portal/ad-campaigns";

    if (editor.id) {
      const payload: any = {
        id: editor.id,
        name: editor.name,
        enabled: editor.enabled,
        priority: editor.priority,
        placement: placements[0],
        startAtIso: localDateTimeInputToIsoOrNull(editor.startAtLocal),
        endAtIso: localDateTimeInputToIsoOrNull(editor.endAtLocal),
        targetJson,
        creativeJson,
        rewardJson,
      };

      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null as any);

      const body = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !body?.ok) {
        setError(body?.error || "Unable to save campaign.");
        return;
      }
    } else {
      for (const placement of placements) {
        const needsSuffix = placements.length > 1;
        const payload: any = {
          name: needsSuffix ? `${editor.name} - ${placementLabel(placement as Placement)}` : editor.name,
          enabled: editor.enabled,
          priority: editor.priority,
          placement,
          startAtIso: localDateTimeInputToIsoOrNull(editor.startAtLocal),
          endAtIso: localDateTimeInputToIsoOrNull(editor.endAtLocal),
          targetJson,
          creativeJson,
          rewardJson,
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => null as any);
        const body = (await res?.json().catch(() => null)) as any;
        if (!res?.ok || !body?.ok) {
          setError(body?.error || "Unable to save campaign.");
          return;
        }
      }
    }

    setEditor(null);
    await loadCampaigns();
  }

  async function openAssignments(campaignId: string) {
    setAssignOpen(true);
    setAssignCampaignId(campaignId);
    setAssignments([]);
    setOwnerQuery("");
    setOwnerResults([]);

    const res = await fetch(`/api/staff/portal/ad-campaigns/assign/${encodeURIComponent(campaignId)}`, { cache: "no-store" }).catch(
      () => null as any,
    );
    const json = (await res?.json().catch(() => null)) as any;
    if (!res?.ok || !json?.ok || !Array.isArray(json.assignments)) {
      setError("Unable to load assignments.");
      return;
    }

    setAssignments(
      json.assignments.map((a: any) => ({
        ownerId: String(a.ownerId),
        email: String(a?.owner?.email ?? ""),
        businessName: String(a?.owner?.businessProfile?.businessName ?? ""),
      })),
    );
  }

  async function searchOwners(q: string) {
    setOwnerLoading(true);
    const res = await fetch(`/api/staff/portal/owners?q=${encodeURIComponent(q)}&take=50`, { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as any;
    setOwnerLoading(false);
    if (!res?.ok || !json?.ok || !Array.isArray(json.owners)) {
      setOwnerResults([]);
      return;
    }
    setOwnerResults(json.owners);
  }

  async function searchTargetOwners(q: string) {
    setTargetOwnerLoading(true);
    const res = await fetch(`/api/staff/portal/owners?q=${encodeURIComponent(q)}&take=50`, { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as any;
    setTargetOwnerLoading(false);
    if (!res?.ok || !json?.ok || !Array.isArray(json.owners)) {
      setTargetOwnerResults([]);
      return;
    }
    setTargetOwnerResults(json.owners);
  }

  async function assignOwner(ownerId: string) {
    if (!assignCampaignId) return;
    const res = await fetch(`/api/staff/portal/ad-campaigns/assign/${encodeURIComponent(assignCampaignId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerId }),
    }).catch(() => null as any);
    if (!res?.ok) {
      setError("Unable to assign owner.");
      return;
    }
    await openAssignments(assignCampaignId);
  }

  async function unassignOwner(ownerId: string) {
    if (!assignCampaignId) return;
    const res = await fetch(
      `/api/staff/portal/ad-campaigns/assign/${encodeURIComponent(assignCampaignId)}?ownerId=${encodeURIComponent(ownerId)}`,
      { method: "DELETE" },
    ).catch(() => null as any);
    if (!res?.ok) {
      setError("Unable to unassign owner.");
      return;
    }
    await openAssignments(assignCampaignId);
  }

  const WIZARD_STEPS = ["Basics", "Targeting", "Creative", "Offers"] as const;

  const canGoNext = useMemo(() => {
    if (!editor) return false;
    if (editor.step === 0) return editor.name.trim().length >= 2 && editor.placements.length >= 1;
    if (editor.step === 1) return true;
    if (editor.step === 2) return (editor.creatives || []).length >= 1;
    if (editor.step === 3) return true;
    return false;
  }, [editor]);

  if (loading) {
    return <div className="text-sm text-zinc-600">Loading campaigns…</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-brand-ink">Campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">
            Create targeted portal ads (sidebar banners, billing sponsored cards, and fullscreen reward videos).
          </div>
        </div>
        <button
          type="button"
          className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          onClick={openCreate}
        >
          New campaign
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Placement</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Window</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr className="border-t border-zinc-200">
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No campaigns yet.
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id} className="border-t border-zinc-200">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-zinc-900">{c.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{c.id}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{placementLabel(c.placement)}</td>
                  <td className="px-4 py-3 text-zinc-700">{c.priority}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-semibold " +
                        (c.enabled ? "bg-emerald-100 text-emerald-900" : "bg-zinc-100 text-zinc-700")
                      }
                    >
                      {c.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    {c.startAt ? new Date(c.startAt).toLocaleString() : "—"} → {c.endAt ? new Date(c.endAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => void openAssignments(c.id)}
                      >
                        Assign users
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editor ? (
        <div id="campaign-editor" className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-zinc-900">{editor.id ? "Edit campaign" : "New campaign"}</div>
              <div className="mt-1 text-sm text-zinc-600">Wizard-style setup: basics → targeting → creatives → offers.</div>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              onClick={() => setEditor(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {WIZARD_STEPS.map((s, idx) => {
              const active = editor.step === idx;
              const done = editor.step > idx;
              return (
                <button
                  key={s}
                  type="button"
                  className={
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                    (active
                      ? "bg-zinc-900 text-white"
                      : done
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")
                  }
                  onClick={() => setEditor({ ...editor, step: idx as any })}
                >
                  {idx + 1}. {s}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            {editor.step === 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Basics</div>
                  <div className="mt-2 grid gap-2">
                    <label className="text-xs font-semibold text-zinc-600">Name</label>
                    <input
                      className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                      value={editor.name}
                      onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">Priority</label>
                        <input
                          className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                          type="number"
                          value={editor.priority}
                          onChange={(e) => setEditor({ ...editor, priority: Math.floor(Number(e.target.value) || 0) })}
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                          <input
                            type="checkbox"
                            checked={editor.enabled}
                            onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
                          />
                          Enabled
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Placements</label>
                      <div className="mt-2 grid gap-2">
                        {editor.id ? (
                          <PortalListboxDropdown
                            value={editor.placements[0] as Placement}
                            options={[
                              { value: "SIDEBAR_BANNER", label: "Sidebar banner" },
                              { value: "BILLING_SPONSORED", label: "Billing sponsored" },
                              { value: "FULLSCREEN_REWARD", label: "Fullscreen reward" },
                            ]}
                            onChange={(v) => setEditor({ ...editor, placements: [v] })}
                          />
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {(["SIDEBAR_BANNER", "BILLING_SPONSORED", "FULLSCREEN_REWARD"] as Placement[]).map((p) => {
                              const on = editor.placements.includes(p);
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  className={
                                    "rounded-full px-3 py-2 text-xs font-semibold transition " +
                                    (on ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-50")
                                  }
                                  onClick={() => {
                                    const next = new Set(editor.placements);
                                    if (next.has(p)) next.delete(p);
                                    else next.add(p);
                                    setEditor({ ...editor, placements: Array.from(next) as Placement[] });
                                  }}
                                >
                                  {placementLabel(p)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {!editor.id && editor.placements.length > 1 ? (
                          <div className="text-xs text-zinc-500">Multiple placements will create multiple campaigns on save.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-zinc-900">Window</div>
                  <div className="mt-2 grid gap-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Start</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={editor.startAtLocal}
                        onChange={(e) => setEditor({ ...editor, startAtLocal: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">End</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={editor.endAtLocal}
                        onChange={(e) => setEditor({ ...editor, endAtLocal: e.target.value })}
                      />
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                      Pick a start/end date and time. Leave blank to run anytime.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {editor.step === 1 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Targeting</div>
                  <div className="mt-2 grid gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">Portal variant</label>
                        <div className="mt-1">
                          <PortalListboxDropdown
                            value={editor.portalVariant}
                            options={[
                              { value: "any", label: "Any" },
                              { value: "portal", label: "/portal" },
                              { value: "credit", label: "/credit" },
                            ]}
                            onChange={(v) => setEditor({ ...editor, portalVariant: v as any })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">Billing model</label>
                        <div className="mt-1">
                          <PortalListboxDropdown
                            value={editor.billingModel}
                            options={[
                              { value: "any", label: "Any" },
                              { value: "subscription", label: "Subscription" },
                              { value: "credits", label: "Credits-only" },
                            ]}
                            onChange={(v) => setEditor({ ...editor, billingModel: v as any })}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Industries</label>
                      <div className="mt-1">
                        <PortalMultiSelectDropdown
                          label="Industries"
                          value={editor.industries}
                          options={industryOptions}
                          onChange={(next) => setEditor({ ...editor, industries: next })}
                          allowCustom
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Business models</label>
                      <div className="mt-1">
                        <PortalMultiSelectDropdown
                          label="Business models"
                          value={editor.businessModels}
                          options={businessModelOptions}
                          onChange={(next) => setEditor({ ...editor, businessModels: next })}
                          allowCustom
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Services (any)</label>
                      <div className="mt-1">
                        <PortalMultiSelectDropdown
                          label="Services"
                          value={editor.serviceSlugsAny}
                          options={serviceSlugOptions}
                          onChange={(next) => setEditor({ ...editor, serviceSlugsAny: next })}
                          allowCustom={false}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Services (all)</label>
                      <div className="mt-1">
                        <PortalMultiSelectDropdown
                          label="Services"
                          value={editor.serviceSlugsAll}
                          options={serviceSlugOptions}
                          onChange={(next) => setEditor({ ...editor, serviceSlugsAll: next })}
                          allowCustom={false}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Pages</label>
                      <div className="mt-1">
                        <PortalMultiSelectDropdown
                          label="Pages"
                          value={editor.paths}
                          options={pathSuggestions}
                          onChange={(next) => setEditor({ ...editor, paths: next })}
                          allowCustom
                          placeholder="Type a page path…"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-zinc-900">Buckets & owners</div>
                  <div className="mt-2 grid gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-zinc-600">Targeting buckets</label>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => {
                            setBucketManagerOpen(true);
                            setActiveBucketId(null);
                            setBucketMembers([]);
                          }}
                        >
                          Manage buckets
                        </button>
                      </div>
                      <div className="mt-1">
                        <PortalMultiSelectDropdown
                          label="Buckets"
                          value={editor.bucketIds}
                          options={buckets.map((b) => ({
                            value: b.id,
                            label: b.name,
                            hint: `${b.membersCount} members`,
                          }))}
                          onChange={(next) => setEditor({ ...editor, bucketIds: next })}
                          allowCustom={false}
                          placeholder="Search buckets…"
                        />
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        Bucket membership overrides industry/business model targeting.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Target specific owners</div>
                      <div className="mt-2 text-sm text-zinc-600">
                        Add owners here to target them even if their profile doesn’t match.
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                          className="min-w-[220px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Search owners by email, business name, industry…"
                          value={targetOwnerQuery}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTargetOwnerQuery(v);
                            void searchTargetOwners(v);
                          }}
                        />
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => void searchTargetOwners(targetOwnerQuery)}
                          disabled={targetOwnerLoading}
                        >
                          {targetOwnerLoading ? "Searching…" : "Search"}
                        </button>
                      </div>

                      {editor.includeOwnerIds.length ? (
                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Included owners</div>
                          <div className="mt-2 grid gap-2">
                            {editor.includeOwnerIds.slice(0, 50).map((id) => (
                              <div key={id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-zinc-900">{id}</div>
                                  <div className="truncate text-xs text-zinc-500">Account</div>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  onClick={() => setEditor({ ...editor, includeOwnerIds: editor.includeOwnerIds.filter((x) => x !== id) })}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {targetOwnerResults.length ? (
                        <div className="mt-3 max-h-[220px] overflow-y-auto rounded-2xl border border-zinc-200">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              <tr>
                                <th className="px-3 py-2">Owner</th>
                                <th className="px-3 py-2">Business</th>
                                <th className="px-3 py-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {targetOwnerResults.map((o) => (
                                <tr key={o.id} className="border-t border-zinc-200">
                                  <td className="px-3 py-2">
                                    <div className="font-semibold text-zinc-900">{o.email}</div>
                                    <div className="text-xs text-zinc-500">{o.id}</div>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-zinc-600">
                                    <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "—"}</div>
                                    <div>
                                      {o.businessProfile?.industry || ""}
                                      {o.businessProfile?.businessModel ? ` • ${o.businessProfile.businessModel}` : ""}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      className="rounded-xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                                      onClick={() => {
                                        const next = new Set(editor.includeOwnerIds);
                                        next.add(o.id);
                                        setEditor({ ...editor, includeOwnerIds: Array.from(next) });
                                      }}
                                    >
                                      Add
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-zinc-600">Search to find portal owners.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {editor.step === 2 ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Creatives</div>
                    <div className="mt-1 text-sm text-zinc-600">Add multiple creatives. Each account will consistently see one of them.</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,video/*"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          e.currentTarget.value = "";
                          const uploaded = await uploadStaffMedia(files);
                          if (!uploaded.length) return;
                          const base = editor.creatives[0] || {
                            headline: "",
                            body: "",
                            ctaText: "",
                            linkUrl: "",
                            mediaKind: "image" as const,
                            mediaUrl: "",
                          };
                          const next = [...editor.creatives];
                          for (const it of uploaded) {
                            next.push({
                              ...base,
                              mediaKind: it.mimeType.startsWith("video/") ? "video" : "image",
                              mediaUrl: it.openUrl,
                            });
                          }
                          setEditor({ ...editor, creatives: next });
                        }}
                      />
                      {mediaUploading ? "Uploading…" : "Add creatives from files"}
                    </label>

                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() =>
                        setEditor({
                          ...editor,
                          creatives: [
                            ...editor.creatives,
                            {
                              headline: editor.creatives[0]?.headline || "",
                              body: editor.creatives[0]?.body || "",
                              ctaText: editor.creatives[0]?.ctaText || "",
                              linkUrl: editor.creatives[0]?.linkUrl || "",
                              mediaKind: "image",
                              mediaUrl: "",
                            },
                          ],
                        })
                      }
                    >
                      + Add empty creative
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4">
                  {editor.creatives.map((v, idx) => (
                    <div key={idx} className="rounded-3xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-zinc-900">Creative {idx + 1}</div>
                        {editor.creatives.length > 1 ? (
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            onClick={() => setEditor({ ...editor, creatives: editor.creatives.filter((_, i) => i !== idx) })}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="grid gap-2">
                          <label className="text-xs font-semibold text-zinc-600">Headline</label>
                          <input
                            className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                            value={v.headline}
                            onChange={(e) => {
                              const next = [...editor.creatives];
                              next[idx] = { ...next[idx]!, headline: e.target.value };
                              setEditor({ ...editor, creatives: next });
                            }}
                          />

                          <label className="text-xs font-semibold text-zinc-600">Body</label>
                          <textarea
                            className="min-h-[110px] rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                            value={v.body}
                            onChange={(e) => {
                              const next = [...editor.creatives];
                              next[idx] = { ...next[idx]!, body: e.target.value };
                              setEditor({ ...editor, creatives: next });
                            }}
                          />
                        </div>

                        <div className="grid gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-semibold text-zinc-600">CTA text</label>
                              <input
                                className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                value={v.ctaText}
                                onChange={(e) => {
                                  const next = [...editor.creatives];
                                  next[idx] = { ...next[idx]!, ctaText: e.target.value };
                                  setEditor({ ...editor, creatives: next });
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-zinc-600">Link URL</label>
                              <input
                                className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                value={v.linkUrl}
                                onChange={(e) => {
                                  const next = [...editor.creatives];
                                  next[idx] = { ...next[idx]!, linkUrl: e.target.value };
                                  setEditor({ ...editor, creatives: next });
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-semibold text-zinc-600">Media kind</label>
                              <div className="mt-1">
                                <PortalListboxDropdown
                                  value={v.mediaKind}
                                  options={[
                                    { value: "image", label: "Image" },
                                    { value: "video", label: "Video" },
                                  ]}
                                  onChange={(kind) => {
                                    const next = [...editor.creatives];
                                    next[idx] = { ...next[idx]!, mediaKind: kind as any };
                                    setEditor({ ...editor, creatives: next });
                                  }}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-zinc-600">Upload media</label>
                              <label className="mt-1 block rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">
                                <input
                                  type="file"
                                  className="hidden"
                                  accept={v.mediaKind === "video" ? "video/*" : "image/*"}
                                  onChange={async (e) => {
                                    const file = (e.target.files || [])[0];
                                    e.currentTarget.value = "";
                                    if (!file) return;
                                    const uploaded = await uploadStaffMedia([file]);
                                    const it = uploaded[0];
                                    if (!it?.openUrl) return;
                                    const next = [...editor.creatives];
                                    next[idx] = {
                                      ...next[idx]!,
                                      mediaKind: it.mimeType.startsWith("video/") ? "video" : "image",
                                      mediaUrl: it.openUrl,
                                    };
                                    setEditor({ ...editor, creatives: next });
                                  }}
                                />
                                {mediaUploading ? "Uploading…" : "Choose file"}
                              </label>
                            </div>
                          </div>

                          <label className="text-xs font-semibold text-zinc-600">Media URL</label>
                          <input
                            className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                            placeholder="(auto-filled after upload)"
                            value={v.mediaUrl}
                            onChange={(e) => {
                              const next = [...editor.creatives];
                              next[idx] = { ...next[idx]!, mediaUrl: e.target.value };
                              setEditor({ ...editor, creatives: next });
                            }}
                          />

                          {v.mediaUrl && v.mediaKind === "image" ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={v.mediaUrl} alt="Creative" className="mt-1 max-h-[180px] w-full rounded-2xl border border-zinc-200 object-cover" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {editor.step === 3 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Offers</div>
                  <div className="mt-1 text-sm text-zinc-600">Credits can be claimed in the portal. Discounts are saved for now (not auto-applied at checkout yet).</div>

                  <div className="mt-3 grid gap-3">
                    {editor.offers.map((o, idx) => (
                      <div key={idx} className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900">{o.kind === "credits" ? "Credits reward" : "Discount offer"}</div>
                          {editor.offers.length > 1 ? (
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                              onClick={() => setEditor({ ...editor, offers: editor.offers.filter((_, i) => i !== idx) })}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        {o.kind === "credits" ? (
                          <div className="mt-3 grid gap-2">
                            <label className="text-xs font-semibold text-zinc-600">Credits</label>
                            <input
                              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                              type="number"
                              min={0}
                              value={o.credits}
                              onChange={(e) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, credits: Math.max(0, Math.floor(Number(e.target.value) || 0)) };
                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            <label className="text-xs font-semibold text-zinc-600">Cooldown hours</label>
                            <input
                              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                              type="number"
                              min={0}
                              value={o.cooldownHours}
                              onChange={(e) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, cooldownHours: Math.max(0, Math.floor(Number(e.target.value) || 0)) };
                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            <label className="text-xs font-semibold text-zinc-600">Min watch seconds</label>
                            <input
                              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                              type="number"
                              min={0}
                              value={o.minWatchSeconds}
                              onChange={(e) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, minWatchSeconds: Math.max(0, Math.floor(Number(e.target.value) || 0)) };
                                setEditor({ ...editor, offers: next });
                              }}
                            />
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-2">
                            <label className="text-xs font-semibold text-zinc-600">Label</label>
                            <input
                              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                              value={o.label}
                              onChange={(e) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, label: e.target.value };
                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            <label className="text-xs font-semibold text-zinc-600">Promo code</label>
                            <input
                              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                              placeholder="(e.g. BUILD20)"
                              value={o.promoCode}
                              onChange={(e) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, promoCode: e.target.value };
                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            <label className="text-xs font-semibold text-zinc-600">Applies to services</label>
                            <PortalMultiSelectDropdown
                              label="Services"
                              value={o.appliesToServiceSlugs}
                              options={serviceSlugOptions}
                              onChange={(nextSlugs) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, appliesToServiceSlugs: nextSlugs };
                                setEditor({ ...editor, offers: next });
                              }}
                              allowCustom={false}
                            />
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => setEditor({ ...editor, offers: [...editor.offers, { kind: "credits", credits: 0, cooldownHours: 24, minWatchSeconds: 15 }] })}
                      >
                        + Add credits reward
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => setEditor({ ...editor, offers: [...editor.offers, { kind: "discount", label: "Discount", promoCode: "", appliesToServiceSlugs: [] }] })}
                      >
                        + Add discount offer
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-zinc-900">Notes</div>
                  <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                    Discounts are saved on the campaign, but automatic checkout discounts aren’t enabled yet.
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                if (editor.step === 0) setEditor(null);
                else setEditor({ ...editor, step: ((editor.step - 1) as any) });
              }}
            >
              {editor.step === 0 ? "Cancel" : "Back"}
            </button>

            <div className="flex flex-wrap gap-2">
              {editor.step < 3 ? (
                <button
                  type="button"
                  disabled={!canGoNext}
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={() => setEditor({ ...editor, step: ((editor.step + 1) as any) })}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  onClick={() => void saveEditor()}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {bucketManagerOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setBucketManagerOpen(false)}>
          <div className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Targeting buckets</div>
                <div className="mt-1 text-sm text-zinc-600">Create buckets and assign owners. Campaigns can target buckets independent of profile fields.</div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                onClick={() => setBucketManagerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Create bucket</div>
                  <div className="mt-3 grid gap-2">
                    <input
                      className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Bucket name (e.g. Agency)"
                      value={bucketNameDraft}
                      onChange={(e) => setBucketNameDraft(e.target.value)}
                    />
                    <input
                      className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Description (optional)"
                      value={bucketDescDraft}
                      onChange={(e) => setBucketDescDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={bucketBusy}
                      className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => void createBucket()}
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Buckets</div>
                  <div className="mt-3 grid gap-2">
                    {buckets.length ? (
                      buckets.map((b) => (
                        <div key={b.id} className={"flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 " + (activeBucketId === b.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white")}>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={async () => {
                              setActiveBucketId(b.id);
                              await loadBucketMembers(b.id);
                            }}
                          >
                            <div className="truncate text-sm font-semibold text-zinc-900">{b.name}</div>
                            <div className="mt-0.5 truncate text-xs text-zinc-500">{b.membersCount} members</div>
                          </button>
                          <button
                            type="button"
                            disabled={bucketBusy}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                            onClick={() => void deleteBucket(b.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-zinc-600">No buckets yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Members</div>
                  {!activeBucketId ? (
                    <div className="mt-2 text-sm text-zinc-600">Pick a bucket to manage members.</div>
                  ) : (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="min-w-[220px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Search owners to add…"
                          value={ownerQuery}
                          onChange={(e) => {
                            const v = e.target.value;
                            setOwnerQuery(v);
                            void searchOwners(v);
                          }}
                        />
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => void searchOwners(ownerQuery)}
                          disabled={ownerLoading}
                        >
                          {ownerLoading ? "Searching…" : "Search"}
                        </button>
                      </div>

                      {ownerResults.length ? (
                        <div className="mt-3 max-h-[220px] overflow-y-auto rounded-2xl border border-zinc-200">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              <tr>
                                <th className="px-3 py-2">Owner</th>
                                <th className="px-3 py-2">Business</th>
                                <th className="px-3 py-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ownerResults.map((o) => (
                                <tr key={o.id} className="border-t border-zinc-200">
                                  <td className="px-3 py-2">
                                    <div className="font-semibold text-zinc-900">{o.email}</div>
                                    <div className="text-xs text-zinc-500">{o.id}</div>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-zinc-600">
                                    <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "—"}</div>
                                    <div>
                                      {o.businessProfile?.industry || ""}
                                      {o.businessProfile?.businessModel ? ` • ${o.businessProfile.businessModel}` : ""}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      disabled={bucketBusy}
                                      className="rounded-xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                                      onClick={() => void addBucketMembers(activeBucketId, [o.id])}
                                    >
                                      Add
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current members</div>
                        <div className="mt-2 max-h-[240px] overflow-y-auto">
                          {bucketMembers.length ? (
                            <div className="grid gap-2">
                              {bucketMembers.map((m) => (
                                <div key={m.ownerId} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{m.email || m.ownerId}</div>
                                    <div className="truncate text-xs text-zinc-500">{m.businessName || ""}</div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={bucketBusy}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                    onClick={() => void removeBucketMember(activeBucketId, m.ownerId)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-zinc-600">No members yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {assignOpen && assignCampaignId ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setAssignOpen(false)}>
          <div
            className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Assign users</div>
                <div className="mt-1 text-sm text-zinc-600">Explicitly target specific portal owners for this campaign.</div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                onClick={() => setAssignOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assigned</div>
                <div className="mt-2 max-h-[180px] overflow-y-auto">
                  {assignments.length ? (
                    <div className="grid gap-2">
                      {assignments.map((a) => (
                        <div key={a.ownerId} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900">{a.email}</div>
                            <div className="truncate text-xs text-zinc-500">{a.businessName || a.ownerId}</div>
                          </div>
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            onClick={() => void unassignOwner(a.ownerId)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">No explicit assignments yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-[220px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="Search owners by email, business name, industry…"
                    value={ownerQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOwnerQuery(v);
                      void searchOwners(v);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    onClick={() => void searchOwners(ownerQuery)}
                    disabled={ownerLoading}
                  >
                    {ownerLoading ? "Searching…" : "Search"}
                  </button>
                </div>

                <div className="mt-3 max-h-[260px] overflow-y-auto rounded-2xl border border-zinc-200">
                  {ownerResults.length ? (
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-3 py-2">Owner</th>
                          <th className="px-3 py-2">Business</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownerResults.map((o) => (
                          <tr key={o.id} className="border-t border-zinc-200">
                            <td className="px-3 py-2">
                              <div className="font-semibold text-zinc-900">{o.email}</div>
                              <div className="text-xs text-zinc-500">{o.id}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-zinc-600">
                              <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "—"}</div>
                              <div>{o.businessProfile?.industry || ""}{o.businessProfile?.businessModel ? ` • ${o.businessProfile.businessModel}` : ""}</div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="rounded-xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                                onClick={() => void assignOwner(o.id)}
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-3 text-sm text-zinc-600">Search to find portal owners.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
