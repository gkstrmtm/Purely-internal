"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalMultiSelectDropdown } from "@/components/PortalMultiSelectDropdown";
import { useToast } from "@/components/ToastProvider";
import { BUSINESS_MODEL_SUGGESTIONS, INDUSTRY_SUGGESTIONS, PORTAL_ONBOARDING_PLANS } from "@/lib/portalOnboardingWizardCatalog";

type Placement = "SIDEBAR_BANNER" | "TOP_BANNER" | "BILLING_SPONSORED" | "FULLSCREEN_REWARD" | "POPUP_CARD";

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
  mediaFit?: "cover" | "contain";
  mediaPosition?: string;
  sidebarImageHeight?: number;
  topBannerImageSize?: number;
  fullscreenMediaMaxWidthPct?: number;

  dismissEnabled?: boolean;
  dismissDelaySeconds?: number;
  dismissReshowAfterSeconds?: number;
  dismissReshowAfterValue?: number;
  dismissReshowAfterUnit?: "seconds" | "minutes" | "hours" | "days";

  showDelaySeconds?: number;
  showDelayValue?: number;
  showDelayUnit?: "seconds" | "minutes" | "hours" | "days";
};

const RESHOW_UNITS = ["seconds", "minutes", "hours", "days"] as const;
const RESHOW_UNIT_SECONDS: Record<(typeof RESHOW_UNITS)[number], number> = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 60 * 60 * 24,
};

function normalizeReshowUnit(v: unknown): (typeof RESHOW_UNITS)[number] {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (RESHOW_UNITS as readonly string[]).includes(s) ? (s as any) : "hours";
}

function deriveReshowValueUnitFromSeconds(secondsRaw: unknown): {
  seconds: number;
  value: number;
  unit: (typeof RESHOW_UNITS)[number];
} {
  const seconds = Number.isFinite(Number(secondsRaw)) ? Math.max(0, Math.floor(Number(secondsRaw))) : 3600;
  const unit =
    seconds > 0 && seconds % RESHOW_UNIT_SECONDS.days === 0
      ? "days"
      : seconds > 0 && seconds % RESHOW_UNIT_SECONDS.hours === 0
        ? "hours"
        : seconds > 0 && seconds % RESHOW_UNIT_SECONDS.minutes === 0
          ? "minutes"
          : "seconds";
  const value = seconds / RESHOW_UNIT_SECONDS[unit];
  return { seconds, value, unit };
}

function deriveShowDelayValueUnitFromSeconds(secondsRaw: unknown) {
  return deriveReshowValueUnitFromSeconds(secondsRaw);
}

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

      discountType?: "percent" | "amount" | "free_month";
      percentOff?: number;
      amountOffUsd?: number;
      duration?: "once" | "repeating" | "forever";
      durationMonths?: number;
    };

type DiscountType = NonNullable<Extract<OfferDraft, { kind: "discount" }>['discountType']>;
type DiscountDuration = NonNullable<Extract<OfferDraft, { kind: "discount" }>['duration']>;

function normalizeDiscountType(v: unknown): DiscountType {
  const s = String(v || "").trim();
  if (s === "amount") return "amount";
  if (s === "free_month") return "free_month";
  return "percent";
}

function normalizeDiscountDuration(v: unknown): DiscountDuration {
  const s = String(v || "").trim();
  if (s === "forever") return "forever";
  if (s === "repeating") return "repeating";
  return "once";
}

function clampPercentOff(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function clampAmountOffUsd(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 25;
  return Math.max(0.5, Math.min(10000, Math.round(n * 100) / 100));
}

function clampDurationMonths(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

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

type CampaignUserAnalyticsRow = {
  ownerId: string;
  email: string;
  businessName: string | null;
  lastSeenAt: string | null;
  impressions: number;
  impressionsMobile: number;
  impressionsDesktop: number;
  clicks: number;
  clicksMobile: number;
  clicksDesktop: number;
};

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
  if (p === "TOP_BANNER") return "Top banner";
  if (p === "BILLING_SPONSORED") return "Billing sponsored";
  if (p === "FULLSCREEN_REWARD") return "Fullscreen reward";
  return "Popup card";
}

function placementSupportsMedia(p: Placement): { image: boolean; video: boolean } {
  if (p === "SIDEBAR_BANNER") return { image: true, video: false };
  if (p === "TOP_BANNER") return { image: true, video: false };
  if (p === "FULLSCREEN_REWARD") return { image: true, video: true };
  if (p === "POPUP_CARD") return { image: true, video: true };
  return { image: false, video: false }; // BILLING_SPONSORED
}

function summarizeMediaVisibility(placements: Placement[], creative: Pick<CreativeVariantDraft, "mediaKind" | "mediaUrl">) {
  const kind = creative.mediaKind;
  const hasMedia = Boolean(String(creative.mediaUrl || "").trim());
  if (!hasMedia) {
    return { hasMedia: false, showIn: [] as Placement[], hideIn: [] as Placement[] };
  }

  const showIn: Placement[] = [];
  const hideIn: Placement[] = [];
  for (const p of placements) {
    const supports = placementSupportsMedia(p);
    const ok = kind === "video" ? supports.video : supports.image;
    (ok ? showIn : hideIn).push(p);
  }
  return { hasMedia: true, showIn, hideIn };
}

function normalizeMediaFit(v: unknown): "cover" | "contain" | undefined {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "contain") return "contain";
  if (s === "cover") return "cover";
  return undefined;
}

function normalizeMediaPosition(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return undefined;
  return s.slice(0, 40);
}

function clampTopBannerSize(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(40, Math.min(160, Math.floor(n)));
}

function clampSidebarImageHeight(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(60, Math.min(240, Math.floor(n)));
}

function clampFullscreenMaxWidthPct(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(40, Math.min(100, Math.floor(n)));
}

export default function PortalAdCampaignsClient() {
  const toast = useToast();
  const shownMediaWarningsRef = useRef<Set<string>>(new Set());
  const [tab, setTab] = useState<"campaigns" | "users">("campaigns");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersDays, setUsersDays] = useState(30);
  const [usersCampaignId, setUsersCampaignId] = useState<string>("");
  const [usersIncludeAll, setUsersIncludeAll] = useState<boolean>(false);
  const [usersQuery, setUsersQuery] = useState("");
  const [usersRows, setUsersRows] = useState<CampaignUserAnalyticsRow[]>([]);

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, toast]);

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

  const placementsKey = useMemo(() => (editor?.placements || []).join("|"), [editor?.placements]);
  const [creativePreviewPlacement, setCreativePreviewPlacement] = useState<Placement>("SIDEBAR_BANNER");
  const activeCreativePlacement = useMemo(() => {
    const placements = (editor?.placements || []) as Placement[];
    if (placements.length && placements.includes(creativePreviewPlacement)) return creativePreviewPlacement;
    return placements[0] || "SIDEBAR_BANNER";
  }, [creativePreviewPlacement, editor?.placements]);

  useEffect(() => {
    if (!editor) return;
    const placements = (editor.placements || []) as Placement[];
    if (!placements.length) return;
    if (!placements.includes(creativePreviewPlacement)) setCreativePreviewPlacement(placements[0]!);
  }, [placementsKey, editor, creativePreviewPlacement]);

  useEffect(() => {
    if (!editor) return;
    const placements = (editor.placements || []) as Placement[];
    if (!placements.length) return;

    for (let i = 0; i < (editor.creatives || []).length; i++) {
      const c = editor.creatives[i]!;
      const sum = summarizeMediaVisibility(placements, c);
      if (!sum.hasMedia) continue;

      if (!sum.showIn.length) {
        const key = `${editor.id || "new"}:creative:${i}:nomedia:${c.mediaKind}:${placements.join(",")}`;
        if (shownMediaWarningsRef.current.has(key)) continue;
        shownMediaWarningsRef.current.add(key);
        toast.info(
          `Heads up: this creative's ${c.mediaKind === "video" ? "video" : "image"} won't show on desktop or mobile for the selected placements (${placements
            .map(placementLabel)
            .join(", ")}).`,
        );
      } else if (sum.hideIn.length) {
        const key = `${editor.id || "new"}:creative:${i}:partial:${c.mediaKind}:${placements.join(",")}`;
        if (shownMediaWarningsRef.current.has(key)) continue;
        shownMediaWarningsRef.current.add(key);
        toast.info(
          `Heads up: this creative's ${c.mediaKind === "video" ? "video" : "image"} won't show on desktop or mobile in: ${sum.hideIn
            .map(placementLabel)
            .join(", ")}.`,
        );
      }
    }
  }, [editor, toast]);

  useEffect(() => {
    if (tab !== "users") return;
    let mounted = true;
    (async () => {
      setUsersLoading(true);
      setUsersError(null);

      const qs = new URLSearchParams();
      qs.set("days", String(usersDays));
      if (usersCampaignId.trim()) qs.set("campaignId", usersCampaignId.trim());
      if (usersIncludeAll) qs.set("includeAll", "1");

      const res = await fetch(`/api/staff/portal/ad-campaigns/users?${qs.toString()}`, { cache: "no-store" }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!mounted) return;
      if (!res?.ok || !json?.ok || !Array.isArray(json.rows)) {
        setUsersRows([]);
        setUsersError(String(json?.error || "Unable to load"));
        setUsersLoading(false);
        return;
      }

      setUsersRows(
        json.rows.map((r: any) => ({
          ownerId: String(r.ownerId || ""),
          email: String(r.email || ""),
          businessName: r.businessName ? String(r.businessName) : null,
          lastSeenAt: r.lastSeenAt ? String(r.lastSeenAt) : null,
          impressions: Number(r.impressions || 0),
          impressionsMobile: Number(r.impressionsMobile || 0),
          impressionsDesktop: Number(r.impressionsDesktop || 0),
          clicks: Number(r.clicks || 0),
          clicksMobile: Number(r.clicksMobile || 0),
          clicksDesktop: Number(r.clicksDesktop || 0),
        })),
      );
      setUsersLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [tab, usersCampaignId, usersDays, usersIncludeAll]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCampaignId, setAssignCampaignId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Array<{ ownerId: string; email: string; businessName: string }>>([]);

  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnerRow[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);

  const [targetOwnerQuery, setTargetOwnerQuery] = useState("");
  const [targetOwnerResults, setTargetOwnerResults] = useState<OwnerRow[]>([]);
  const [targetOwnerLoading, setTargetOwnerLoading] = useState(false);

  const [includedOwnerById, setIncludedOwnerById] = useState<Record<string, OwnerRow>>({});

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

  const [portalAppPathOptions, setPortalAppPathOptions] = useState<Array<{ value: string; label: string }>>([
    { value: "/portal/app/*", label: "/portal/app/*" },
    { value: "/portal/app/billing", label: "/portal/app/billing" },
    { value: "/portal/app/services/*", label: "/portal/app/services/*" },
    { value: "/portal/app/dashboard", label: "/portal/app/dashboard" },
  ]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/staff/portal/app-paths?prefix=${encodeURIComponent("/portal/app")}`);
      const json = (await res.json().catch(() => null)) as any;
      if (!alive) return;
      if (!res.ok || !json?.ok || !Array.isArray(json.paths)) return;

      const base = [
        "/portal/app/*",
        "/portal/app/billing",
        "/portal/app/services/*",
        "/portal/app/dashboard",
      ];
      const merged = Array.from(new Set([...base, ...json.paths.map(String)])).filter(Boolean);
      merged.sort((a, b) => a.localeCompare(b));
      setPortalAppPathOptions(merged.map((p) => ({ value: p, label: p })));
    })().catch(() => {
      // ignore
    });

    return () => {
      alive = false;
    };
  }, []);

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
          mediaFit: "cover",
          mediaPosition: "center",
          sidebarImageHeight: 120,
          topBannerImageSize: 56,
          fullscreenMediaMaxWidthPct: 100,

          dismissEnabled: false,
          dismissDelaySeconds: 0,
          dismissReshowAfterSeconds: 3600,
          dismissReshowAfterValue: 1,
          dismissReshowAfterUnit: "hours",

          showDelaySeconds: 0,
          showDelayValue: 0,
          showDelayUnit: "seconds",
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
      ? variantsRaw.map((v: any) => {
          const reshow = deriveReshowValueUnitFromSeconds(v?.dismissReshowAfterSeconds);
          const showDelay = deriveShowDelayValueUnitFromSeconds(v?.showDelaySeconds);
          return {
          headline: String(v?.headline ?? ""),
          body: String(v?.body ?? ""),
          ctaText: String(v?.ctaText ?? ""),
          linkUrl: String(v?.linkUrl ?? ""),
          mediaKind: v?.mediaKind === "video" ? "video" : "image",
          mediaUrl: String(v?.mediaUrl ?? ""),
          mediaFit: normalizeMediaFit(v?.mediaFit) ?? "cover",
          mediaPosition: normalizeMediaPosition(v?.mediaPosition) ?? "center",
          sidebarImageHeight: clampSidebarImageHeight(v?.sidebarImageHeight) ?? 120,
          topBannerImageSize: clampTopBannerSize(v?.topBannerImageSize) ?? 56,
          fullscreenMediaMaxWidthPct: clampFullscreenMaxWidthPct(v?.fullscreenMediaMaxWidthPct) ?? 100,

          dismissEnabled: Boolean(v?.dismissEnabled),
          dismissDelaySeconds: Number.isFinite(Number(v?.dismissDelaySeconds)) ? Math.max(0, Math.floor(Number(v?.dismissDelaySeconds))) : 0,
          dismissReshowAfterSeconds: reshow.seconds,
          dismissReshowAfterValue: reshow.value,
          dismissReshowAfterUnit: reshow.unit,

          showDelaySeconds: showDelay.seconds,
          showDelayValue: showDelay.value,
          showDelayUnit: showDelay.unit,
        };
        })
      : [
          {
            ...((): any => {
              const reshow = deriveReshowValueUnitFromSeconds(c?.dismissReshowAfterSeconds);
              const showDelay = deriveShowDelayValueUnitFromSeconds(c?.showDelaySeconds);
              return {
                dismissReshowAfterSeconds: reshow.seconds,
                dismissReshowAfterValue: reshow.value,
                dismissReshowAfterUnit: reshow.unit,

                showDelaySeconds: showDelay.seconds,
                showDelayValue: showDelay.value,
                showDelayUnit: showDelay.unit,
              };
            })(),
            headline: String(c.headline ?? ""),
            body: String(c.body ?? ""),
            ctaText: String(c.ctaText ?? ""),
            linkUrl: String(c.linkUrl ?? ""),
            mediaKind: c.mediaKind === "video" ? "video" : "image",
            mediaUrl: String(c.mediaUrl ?? ""),
            mediaFit: normalizeMediaFit(c?.mediaFit) ?? "cover",
            mediaPosition: normalizeMediaPosition(c?.mediaPosition) ?? "center",
            sidebarImageHeight: clampSidebarImageHeight(c?.sidebarImageHeight) ?? 120,
            topBannerImageSize: clampTopBannerSize(c?.topBannerImageSize) ?? 56,
            fullscreenMediaMaxWidthPct: clampFullscreenMaxWidthPct(c?.fullscreenMediaMaxWidthPct) ?? 100,

            dismissEnabled: Boolean(c?.dismissEnabled),
            dismissDelaySeconds: Number.isFinite(Number(c?.dismissDelaySeconds)) ? Math.max(0, Math.floor(Number(c?.dismissDelaySeconds))) : 0,
          },
        ];

    const offersRaw = Array.isArray(r.offers) ? r.offers : null;
    const offers: OfferDraft[] = offersRaw?.length
      ? offersRaw
          .map((o: any) => {
            const kind = String(o?.kind || "").trim().toLowerCase();
            if (kind === "discount") {
              const discountType = normalizeDiscountType(o?.discountType);
              const duration = normalizeDiscountDuration(o?.duration);
              const normalized: Extract<OfferDraft, { kind: "discount" }> = {
                kind: "discount" as const,
                label: String(o?.label ?? ""),
                promoCode: String(o?.promoCode ?? ""),
                appliesToServiceSlugs: Array.isArray(o?.appliesToServiceSlugs) ? o.appliesToServiceSlugs.map(String) : [],

                discountType,
                duration,
                durationMonths: duration === "repeating" ? clampDurationMonths(o?.durationMonths) : undefined,
                percentOff: discountType === "percent" ? clampPercentOff(o?.percentOff) : discountType === "free_month" ? 100 : undefined,
                amountOffUsd: discountType === "amount" ? clampAmountOffUsd(o?.amountOffUsd) : undefined,
              };

              if (discountType === "free_month") {
                normalized.duration = "repeating";
                normalized.durationMonths = 1;
                normalized.percentOff = 100;
                normalized.amountOffUsd = undefined;
              }

              return normalized;
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

    const cleanedCreativesBase = (editor.creatives || [])
      .map((v) => ({
        headline: String(v.headline || "").trim(),
        body: String(v.body || "").trim(),
        ctaText: String(v.ctaText || "").trim(),
        linkUrl: String(v.linkUrl || "").trim(),
        mediaKind: v.mediaKind === "video" ? "video" : "image",
        mediaUrl: String(v.mediaUrl || "").trim(),
        mediaFit: normalizeMediaFit(v.mediaFit) ?? "cover",
        mediaPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
        sidebarImageHeight: clampSidebarImageHeight(v.sidebarImageHeight) ?? 120,
        topBannerImageSize: clampTopBannerSize(v.topBannerImageSize) ?? 56,
        fullscreenMediaMaxWidthPct: clampFullscreenMaxWidthPct(v.fullscreenMediaMaxWidthPct) ?? 100,

        showDelaySeconds: Number.isFinite(Number(v.showDelaySeconds)) ? Math.max(0, Math.floor(Number(v.showDelaySeconds))) : 0,

        dismissEnabled: Boolean(v.dismissEnabled) || undefined,
        dismissDelaySeconds: Number.isFinite(Number(v.dismissDelaySeconds)) ? Math.max(0, Math.floor(Number(v.dismissDelaySeconds))) : 0,
        dismissReshowAfterSeconds: Number.isFinite(Number(v.dismissReshowAfterSeconds)) ? Math.max(0, Math.floor(Number(v.dismissReshowAfterSeconds))) : 3600,
      }))
      .filter((v) => v.headline || v.body || v.mediaUrl || v.linkUrl);

    const offersDraft = (editor.offers || []).filter(Boolean);
    const offers = offersDraft
      .map((o) => {
        if (o.kind === "credits") {
          return {
            kind: "credits" as const,
            credits: Math.max(0, Math.floor(Number(o.credits || 0))),
            cooldownHours: Math.max(0, Math.floor(Number(o.cooldownHours || 0))),
            minWatchSeconds: Math.max(0, Math.floor(Number(o.minWatchSeconds || 0))),
          };
        }

        const discountType = normalizeDiscountType(o.discountType);
        let duration = normalizeDiscountDuration(o.duration);
        let durationMonths = duration === "repeating" ? clampDurationMonths(o.durationMonths) : undefined;
        let percentOff = discountType === "percent" ? clampPercentOff(o.percentOff) : undefined;
        let amountOffUsd = discountType === "amount" ? clampAmountOffUsd(o.amountOffUsd) : undefined;

        if (discountType === "free_month") {
          duration = "repeating";
          durationMonths = 1;
          percentOff = 100;
          amountOffUsd = undefined;
        }

        return {
          kind: "discount" as const,
          label: String(o.label || "").trim(),
          promoCode: String(o.promoCode || "").trim(),
          appliesToServiceSlugs: uniq(Array.isArray(o.appliesToServiceSlugs) ? o.appliesToServiceSlugs.map(String) : []),
          discountType,
          percentOff,
          amountOffUsd,
          duration,
          durationMonths,
        };
      })
      .filter(Boolean) as OfferDraft[];

    const creditsOffer = offers.find((o) => o.kind === "credits") as Extract<OfferDraft, { kind: "credits" }> | undefined;
    const credits = Math.max(0, Math.floor(Number(creditsOffer?.credits || 0)));
    const cooldownHours = Math.max(0, Math.floor(Number(creditsOffer?.cooldownHours || 0)));
    const minWatchSeconds = Math.max(0, Math.floor(Number(creditsOffer?.minWatchSeconds || 0)));

    const discountOffer = offers.find((o) => o.kind === "discount") as Extract<OfferDraft, { kind: "discount" }> | undefined;
    const discountPromoCode = String(discountOffer?.promoCode || "").trim();
    const discountSlugs = Array.isArray(discountOffer?.appliesToServiceSlugs) ? discountOffer!.appliesToServiceSlugs.map(String).map((s) => s.trim()).filter(Boolean) : [];

    const discountLinkUrl = (() => {
      if (!discountPromoCode && !editor.id) return "";
      if (!discountPromoCode && !discountSlugs.length) return "";

      const qs = new URLSearchParams();
      if (discountPromoCode) qs.set("promoCode", discountPromoCode);
      if (editor.id) qs.set("campaignId", editor.id);

      if (discountSlugs.length === 1) {
        return `/portal/app/discount/${encodeURIComponent(discountSlugs[0] || "")}?${qs.toString()}`;
      }
      if (discountSlugs.length > 1) {
        qs.set("services", discountSlugs.join(","));
        return `/portal/app/discount?${qs.toString()}`;
      }
      return "";
    })();

    const cleanedCreatives = cleanedCreativesBase.map((v) => {
      if (!discountLinkUrl) return v;
      const current = String(v.linkUrl || "").trim();
      const normalized = current === "/app/billing" ? "/portal/app/billing" : current;
      const looksLikeBilling = !normalized || normalized === "/portal/app/billing" || normalized === "/credit/app/billing";
      if (!looksLikeBilling) return v;
      return { ...v, linkUrl: discountLinkUrl };
    });

    const creativeJson: any =
      cleanedCreatives.length > 1
        ? { variants: cleanedCreatives }
        : cleanedCreatives.length === 1
          ? cleanedCreatives[0]
          : {
              headline: "",
              body: "",
              ctaText: "",
              linkUrl: "",
              mediaKind: "image",
              mediaUrl: "",
              mediaFit: "cover",
              mediaPosition: "center",
              sidebarImageHeight: 120,
              topBannerImageSize: 56,
              fullscreenMediaMaxWidthPct: 100,
            };

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

    setIncludedOwnerById((prev) => {
      const next = { ...prev };
      for (const o of json.owners as OwnerRow[]) {
        if (o && typeof o.id === "string" && o.id) next[o.id] = o;
      }
      return next;
    });
  }

  const includeOwnerIds = useMemo(
    () => (editor?.includeOwnerIds || []).filter(Boolean).slice(0, 200),
    [editor?.includeOwnerIds],
  );
  const includeOwnerIdsKey = useMemo(() => includeOwnerIds.join(","), [includeOwnerIds]);

  useEffect(() => {
    if (!editor) return;
    if (!includeOwnerIds.length) return;

    const missing = includeOwnerIds.filter((id) => !includedOwnerById[id]);
    if (!missing.length) return;

    let alive = true;
    (async () => {
      const res = await fetch(`/api/staff/portal/owners?ids=${encodeURIComponent(missing.join(","))}`, {
        cache: "no-store",
      }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!alive) return;
      if (!res?.ok || !json?.ok || !Array.isArray(json.owners)) return;

      setIncludedOwnerById((prev) => {
        const next = { ...prev };
        for (const o of json.owners as OwnerRow[]) {
          if (o && typeof o.id === "string" && o.id) next[o.id] = o;
        }
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [editor, includeOwnerIds, includeOwnerIdsKey, includedOwnerById]);

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
          <div className="text-lg font-semibold text-brand-ink">Portal ad campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">
            Create targeted portal ads (sidebar banners, top banners, billing sponsored cards, and fullscreen reward videos).
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("campaigns")}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold " +
                (tab === "campaigns" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50")
              }
            >
              Campaigns
            </button>
            <button
              type="button"
              onClick={() => setTab("users")}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold " +
                (tab === "users" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50")
              }
            >
              Users
            </button>
          </div>

          {tab === "campaigns" ? (
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              onClick={openCreate}
            >
              New campaign
            </button>
          ) : null}
        </div>
      </div>

      {tab === "users" ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-zinc-900">User monitoring</div>
              <div className="mt-1 text-sm text-zinc-600">Tracks ad impressions and clicks split by device.</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setUsersIncludeAll((v) => !v)}
                className={
                  "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold " +
                  (usersIncludeAll
                    ? "border-[color:var(--color-brand-blue)]/30 bg-[color:var(--color-brand-blue)]/10 text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                }
                title={usersIncludeAll ? "Showing all users" : "Showing only users with events"}
              >
                {usersIncludeAll ? "All users" : "Active only"}
              </button>

              <PortalListboxDropdown
                value={usersCampaignId}
                onChange={(v) => setUsersCampaignId(v)}
                buttonClassName="flex w-[260px] items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                options={[
                  { value: "", label: "All campaigns" },
                  ...campaigns.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />

              <PortalListboxDropdown
                value={String(usersDays) as any}
                onChange={(v) => setUsersDays(Math.max(1, Math.min(365, Number(v) || 30)))}
                buttonClassName="flex w-[160px] items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                options={[
                  { value: "7", label: "Last 7 days" },
                  { value: "30", label: "Last 30 days" },
                  { value: "90", label: "Last 90 days" },
                ] as any}
              />

              <input
                className="w-64 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Search email or business"
                value={usersQuery}
                onChange={(e) => setUsersQuery(e.target.value)}
              />
            </div>
          </div>

          {usersError ? <div className="mt-3 text-sm font-semibold text-rose-700">{usersError}</div> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Device</th>
                  <th className="py-2 pr-4">Impressions</th>
                  <th className="py-2 pr-4">Clicks</th>
                  <th className="py-2 pr-4">CTR</th>
                  <th className="py-2 pr-4">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(usersRows || [])
                  .filter((r) => {
                    const q = usersQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      r.email.toLowerCase().includes(q) ||
                      String(r.businessName || "").toLowerCase().includes(q) ||
                      r.ownerId.toLowerCase().includes(q)
                    );
                  })
                  .map((r) => {
                    const impressions = Math.max(0, Math.floor(r.impressions || 0));
                    const clicks = Math.max(0, Math.floor(r.clicks || 0));
                    const mobile = Math.max(0, Math.floor(r.impressionsMobile || 0));
                    const desktop = Math.max(0, Math.floor(r.impressionsDesktop || 0));
                    const denom = Math.max(1, mobile + desktop);
                    const mobilePct = Math.round((mobile / denom) * 100);
                    const desktopPct = 100 - mobilePct;
                    const ctr = impressions ? (clicks / impressions) * 100 : 0;
                    return (
                      <tr key={r.ownerId} className="border-b border-zinc-100">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-zinc-900">{r.email}</div>
                          <div className="text-xs text-zinc-500">{r.businessName || r.ownerId}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="text-xs text-zinc-600">Desktop {desktopPct}% • Mobile {mobilePct}%</div>
                          <div className="mt-1 h-2 w-40 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full bg-[color:var(--color-brand-blue)]" style={{ width: `${desktopPct}%` }} />
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-semibold text-zinc-900">{impressions.toLocaleString()}</td>
                        <td className="py-3 pr-4 font-semibold text-zinc-900">{clicks.toLocaleString()}</td>
                        <td className="py-3 pr-4 font-semibold text-zinc-900">{ctr.toFixed(1)}%</td>
                        <td className="py-3 pr-4 text-zinc-700">
                          {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : "n/a"}
                        </td>
                      </tr>
                    );
                  })}

                {!usersLoading && (!usersRows || usersRows.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-zinc-500">
                      No analytics yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "campaigns" ? (
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
                    {c.startAt ? new Date(c.startAt).toLocaleString() : "Anytime"} → {c.endAt ? new Date(c.endAt).toLocaleString() : "Anytime"}
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
      ) : null}

      {tab === "campaigns" && editor ? (
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
                              { value: "TOP_BANNER", label: "Top banner" },
                              { value: "BILLING_SPONSORED", label: "Billing sponsored" },
                              { value: "FULLSCREEN_REWARD", label: "Fullscreen reward" },
                              { value: "POPUP_CARD", label: "Popup card" },
                            ]}
                            onChange={(v) => setEditor({ ...editor, placements: [v] })}
                          />
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {(["SIDEBAR_BANNER", "TOP_BANNER", "BILLING_SPONSORED", "FULLSCREEN_REWARD", "POPUP_CARD"] as Placement[]).map((p) => {
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
                          options={portalAppPathOptions}
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
                            {editor.includeOwnerIds.slice(0, 50).map((id) => {
                              const o = includedOwnerById[id];
                              const primary = (o?.email || o?.name || id || "").trim();
                              const secondary = (o?.businessProfile?.businessName || o?.name || "Account").trim();
                              return (
                                <div key={id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{primary}</div>
                                    <div className="truncate text-xs text-zinc-500">{secondary}</div>
                                  </div>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                    onClick={() => setEditor({ ...editor, includeOwnerIds: editor.includeOwnerIds.filter((x) => x !== id) })}
                                  >
                                    Remove
                                  </button>
                                </div>
                              );
                            })}
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
                                    <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "n/a"}</div>
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
                            mediaFit: "cover" as const,
                            mediaPosition: "center",
                            sidebarImageHeight: 120,
                            topBannerImageSize: 56,
                            fullscreenMediaMaxWidthPct: 100,
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
                              mediaFit: "cover",
                              mediaPosition: "center",
                              sidebarImageHeight: 120,
                              topBannerImageSize: 56,
                              fullscreenMediaMaxWidthPct: 100,
                            },
                          ],
                        })
                      }
                    >
                      + Add empty creative
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-xs text-zinc-500">
                  {(() => {
                    const placements = (editor.placements || []) as Placement[];
                    const supportsImages = placements.filter((p) => placementSupportsMedia(p).image);
                    const supportsVideo = placements.filter((p) => placementSupportsMedia(p).video);
                    const mediaIgnored = placements.filter((p) => !placementSupportsMedia(p).image && !placementSupportsMedia(p).video);

                    const parts: string[] = [];
                    if (supportsImages.length) parts.push(`Images can show in: ${supportsImages.map(placementLabel).join(", ")}.`);
                    if (supportsVideo.length) parts.push(`Videos can show in: ${supportsVideo.map(placementLabel).join(", ")}.`);
                    if (mediaIgnored.length) parts.push(`Media won't show in: ${mediaIgnored.map(placementLabel).join(", ")}.`);
                    return parts.join(" ");
                  })()}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold text-zinc-600">Preview placement</div>
                  {(() => {
                    const placements = (editor.placements || []) as Placement[];
                    if (placements.length <= 1) {
                      return <div className="text-xs text-zinc-700">{placementLabel(placements[0] || "SIDEBAR_BANNER")}</div>;
                    }
                    return (
                      <div className="w-[240px]">
                        <PortalListboxDropdown
                          value={activeCreativePlacement}
                          onChange={(v) => setCreativePreviewPlacement(v as any)}
                          options={placements.map((p) => ({ value: p, label: placementLabel(p) })) as any}
                        />
                      </div>
                    );
                  })()}
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

                          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                            <div className="text-xs font-semibold text-zinc-600">Dismiss / close button</div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                                <input
                                  type="checkbox"
                                  checked={Boolean(v.dismissEnabled)}
                                  onChange={(e) => {
                                    const next = [...editor.creatives];
                                    next[idx] = { ...next[idx]!, dismissEnabled: e.target.checked };
                                    setEditor({ ...editor, creatives: next });
                                  }}
                                />
                                Allow dismiss (X)
                              </label>
                              <div>
                                <label className="text-xs font-semibold text-zinc-600">X shows after (seconds)</label>
                                <input
                                  type="number"
                                  min={0}
                                  className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                  value={Number.isFinite(Number(v.dismissDelaySeconds)) ? String(Math.max(0, Math.floor(Number(v.dismissDelaySeconds)))) : "0"}
                                  onChange={(e) => {
                                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                    const next = [...editor.creatives];
                                    next[idx] = { ...next[idx]!, dismissDelaySeconds: n };
                                    setEditor({ ...editor, creatives: next });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-zinc-600">Reshow after dismiss (seconds)</label>
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    className="w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                    value={
                                      Number.isFinite(Number(v.dismissReshowAfterValue))
                                        ? String(Math.max(0, Number(v.dismissReshowAfterValue)))
                                        : String(deriveReshowValueUnitFromSeconds(v.dismissReshowAfterSeconds).value)
                                    }
                                    onChange={(e) => {
                                      const unit = normalizeReshowUnit(v.dismissReshowAfterUnit);
                                      const value = Math.max(0, Number(e.target.value) || 0);
                                      const seconds = Math.max(0, Math.round(value * RESHOW_UNIT_SECONDS[unit]));
                                      const next = [...editor.creatives];
                                      next[idx] = {
                                        ...next[idx]!,
                                        dismissReshowAfterUnit: unit,
                                        dismissReshowAfterValue: value,
                                        dismissReshowAfterSeconds: seconds,
                                      };
                                      setEditor({ ...editor, creatives: next });
                                    }}
                                  />
                                  <PortalListboxDropdown
                                    value={normalizeReshowUnit(v.dismissReshowAfterUnit)}
                                    options={RESHOW_UNITS.map((u) => ({ value: u, label: u })) as any}
                                    onChange={(val) => {
                                      const currentSeconds = deriveReshowValueUnitFromSeconds(v.dismissReshowAfterSeconds).seconds;
                                      const unit = normalizeReshowUnit(val);
                                      const value = currentSeconds / RESHOW_UNIT_SECONDS[unit];
                                      const next = [...editor.creatives];
                                      next[idx] = {
                                        ...next[idx]!,
                                        dismissReshowAfterUnit: unit,
                                        dismissReshowAfterValue: value,
                                        dismissReshowAfterSeconds: currentSeconds,
                                      };
                                      setEditor({ ...editor, creatives: next });
                                    }}
                                  />
                                </div>
                              </div>

                              {editor.placements.includes("POPUP_CARD") ? (
                                <div>
                                  <label className="text-xs font-semibold text-zinc-600">Show popup after</label>
                                  <div className="mt-1 grid grid-cols-2 gap-2">
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.25}
                                      className="w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                      value={
                                        Number.isFinite(Number(v.showDelayValue))
                                          ? String(Math.max(0, Number(v.showDelayValue)))
                                          : String(deriveShowDelayValueUnitFromSeconds(v.showDelaySeconds).value)
                                      }
                                      onChange={(e) => {
                                        const unit = normalizeReshowUnit(v.showDelayUnit);
                                        const value = Math.max(0, Number(e.target.value) || 0);
                                        const seconds = Math.max(0, Math.round(value * RESHOW_UNIT_SECONDS[unit]));
                                        const next = [...editor.creatives];
                                        next[idx] = {
                                          ...next[idx]!,
                                          showDelayUnit: unit,
                                          showDelayValue: value,
                                          showDelaySeconds: seconds,
                                        };
                                        setEditor({ ...editor, creatives: next });
                                      }}
                                    />
                                    <PortalListboxDropdown
                                      value={normalizeReshowUnit(v.showDelayUnit)}
                                      options={RESHOW_UNITS.map((u) => ({ value: u, label: u })) as any}
                                      onChange={(val) => {
                                        const currentSeconds = deriveShowDelayValueUnitFromSeconds(v.showDelaySeconds).seconds;
                                        const unit = normalizeReshowUnit(val);
                                        const value = currentSeconds / RESHOW_UNIT_SECONDS[unit];
                                        const next = [...editor.creatives];
                                        next[idx] = {
                                          ...next[idx]!,
                                          showDelayUnit: unit,
                                          showDelayValue: value,
                                          showDelaySeconds: currentSeconds,
                                        };
                                        setEditor({ ...editor, creatives: next });
                                      }}
                                    />
                                  </div>
                                  <div className="mt-2 text-xs text-zinc-500">
                                    The popup waits this long after the ad is fetched for the current page.
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs text-zinc-500">
                              If reshow is 0, the portal uses a sensible default (1 hour).
                            </div>
                          </div>

                          {v.mediaKind === "image" ? (
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="text-xs font-semibold text-zinc-600">Image fit</label>
                                <div className="mt-1">
                                  <PortalListboxDropdown
                                    value={(normalizeMediaFit(v.mediaFit) ?? "cover") as any}
                                    onChange={(val) => {
                                      const fit = normalizeMediaFit(val) ?? "cover";
                                      const next = [...editor.creatives];
                                      next[idx] = { ...next[idx]!, mediaFit: fit };
                                      setEditor({ ...editor, creatives: next });
                                    }}
                                    options={[
                                      { value: "cover", label: "Cover (crop)" },
                                      { value: "contain", label: "Contain (no crop)" },
                                    ] as any}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-zinc-600">Image focus</label>
                                <div className="mt-1">
                                  <PortalListboxDropdown
                                    value={(normalizeMediaPosition(v.mediaPosition) ?? "center") as any}
                                    onChange={(val) => {
                                      const pos = normalizeMediaPosition(val) ?? "center";
                                      const next = [...editor.creatives];
                                      next[idx] = { ...next[idx]!, mediaPosition: pos };
                                      setEditor({ ...editor, creatives: next });
                                    }}
                                    options={[
                                      { value: "center", label: "Center" },
                                      { value: "top", label: "Top" },
                                      { value: "bottom", label: "Bottom" },
                                      { value: "left", label: "Left" },
                                      { value: "right", label: "Right" },
                                      { value: "top left", label: "Top left" },
                                      { value: "top right", label: "Top right" },
                                      { value: "bottom left", label: "Bottom left" },
                                      { value: "bottom right", label: "Bottom right" },
                                    ] as any}
                                  />
                                </div>
                              </div>

                              {activeCreativePlacement === "SIDEBAR_BANNER" ? (
                                <div className="sm:col-span-2">
                                  <label className="text-xs font-semibold text-zinc-600">Sidebar image height</label>
                                  <div className="mt-1">
                                    <PortalListboxDropdown
                                      value={String(clampSidebarImageHeight(v.sidebarImageHeight) ?? 120) as any}
                                      onChange={(val) => {
                                        const size = clampSidebarImageHeight(val) ?? 120;
                                        const next = [...editor.creatives];
                                        next[idx] = { ...next[idx]!, sidebarImageHeight: size };
                                        setEditor({ ...editor, creatives: next });
                                      }}
                                      options={[
                                        { value: "80", label: "Small" },
                                        { value: "120", label: "Medium" },
                                        { value: "160", label: "Large" },
                                      ] as any}
                                    />
                                  </div>
                                </div>
                              ) : null}

                              {activeCreativePlacement === "TOP_BANNER" ? (
                                <div className="sm:col-span-2">
                                  <label className="text-xs font-semibold text-zinc-600">Top banner image size</label>
                                  <div className="mt-1">
                                    <PortalListboxDropdown
                                      value={String(clampTopBannerSize(v.topBannerImageSize) ?? 56) as any}
                                      onChange={(val) => {
                                        const size = clampTopBannerSize(val) ?? 56;
                                        const next = [...editor.creatives];
                                        next[idx] = { ...next[idx]!, topBannerImageSize: size };
                                        setEditor({ ...editor, creatives: next });
                                      }}
                                      options={[
                                        { value: "56", label: "Small" },
                                        { value: "72", label: "Medium" },
                                        { value: "96", label: "Large" },
                                      ] as any}
                                    />
                                  </div>
                                </div>
                              ) : null}

                              {activeCreativePlacement === "FULLSCREEN_REWARD" ? (
                                <div className="sm:col-span-2">
                                  <label className="text-xs font-semibold text-zinc-600">Fullscreen media width</label>
                                  <div className="mt-1">
                                    <PortalListboxDropdown
                                      value={String(clampFullscreenMaxWidthPct(v.fullscreenMediaMaxWidthPct) ?? 100) as any}
                                      onChange={(val) => {
                                        const pct = clampFullscreenMaxWidthPct(val) ?? 100;
                                        const next = [...editor.creatives];
                                        next[idx] = { ...next[idx]!, fullscreenMediaMaxWidthPct: pct };
                                        setEditor({ ...editor, creatives: next });
                                      }}
                                      options={[
                                        { value: "60", label: "Narrow" },
                                        { value: "80", label: "Medium" },
                                        { value: "100", label: "Full" },
                                      ] as any}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {(() => {
                            const placements = (editor.placements || []) as Placement[];
                            const sum = summarizeMediaVisibility(placements, v);
                            if (!sum.hasMedia) return null;

                            const show = sum.showIn.map(placementLabel).join(", ") || "None";
                            const hide = sum.hideIn.map(placementLabel).join(", ") || "None";

                            if (!sum.showIn.length) {
                              return (
                                <div className="mt-1 text-xs font-semibold text-rose-700">
                                  This {v.mediaKind === "video" ? "video" : "image"} will not show for the selected placements.
                                </div>
                              );
                            }

                            return (
                              <div className="mt-1 text-xs text-zinc-500">
                                Will show on desktop: <span className="font-semibold text-zinc-700">{show}</span> • Will show on mobile{" "}
                                <span className="font-semibold text-zinc-700">{show}</span>
                                {sum.hideIn.length ? (
                                  <>
                                    {" "}• Won’t show on desktop: <span className="font-semibold text-zinc-700">{hide}</span> • Won’t show on mobile{" "}
                                    <span className="font-semibold text-zinc-700">{hide}</span>
                                  </>
                                ) : null}
                              </div>
                            );
                          })()}

                          {v.mediaUrl ? (
                            (() => {
                              const p = activeCreativePlacement;
                              const supports = placementSupportsMedia(p);
                              const canShow = v.mediaKind === "video" ? supports.video : supports.image;
                              if (!canShow) return null;

                              if (p === "BILLING_SPONSORED") {
                                return (
                                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                                    Media is not shown for Billing sponsored placement.
                                  </div>
                                );
                              }

                              if (p === "SIDEBAR_BANNER" && v.mediaKind === "image") {
                                return (
                                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-zinc-600">Sidebar banner preview</div>
                                    <div className="mt-2 rounded-2xl border border-brand-ink/10 bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white p-3">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={v.mediaUrl}
                                        alt="Creative"
                                        className="mb-2 w-full rounded-xl border border-zinc-200 object-cover"
                                        style={{
                                          height: clampSidebarImageHeight(v.sidebarImageHeight) ?? 120,
                                          objectFit: normalizeMediaFit(v.mediaFit) ?? "cover",
                                          objectPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
                                        }}
                                      />
                                      <div className="text-sm font-semibold text-zinc-900">{v.headline || "Sponsored"}</div>
                                      <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{v.body || "Preview copy"}</div>
                                      <div className="mt-2 inline-flex rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                                        {v.ctaText || "View"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              if (p === "TOP_BANNER" && v.mediaKind === "image") {
                                return (
                                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-zinc-600">Top banner preview</div>
                                    <div className="mt-2 rounded-3xl border border-brand-ink/10 bg-gradient-to-r from-[color:var(--color-brand-blue)]/15 via-white to-white p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={v.mediaUrl}
                                            alt="Creative"
                                            className="shrink-0 rounded-2xl border border-zinc-200 object-cover"
                                            style={{
                                              height: clampTopBannerSize(v.topBannerImageSize) ?? 56,
                                              width: clampTopBannerSize(v.topBannerImageSize) ?? 56,
                                              objectFit: normalizeMediaFit(v.mediaFit) ?? "cover",
                                              objectPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
                                            }}
                                          />
                                          <div className="min-w-0">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sponsored</div>
                                            <div className="truncate text-sm font-semibold text-zinc-900">{v.headline || "Sponsored"}</div>
                                            {v.body ? <div className="mt-1 line-clamp-2 text-xs text-zinc-700">{v.body}</div> : null}
                                          </div>
                                        </div>
                                        <div className="inline-flex shrink-0 rounded-2xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white">
                                          {v.ctaText || "Learn"}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              if (p === "POPUP_CARD") {
                                return (
                                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-zinc-600">Popup card preview</div>
                                    <div className="mt-2 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sponsored</div>
                                      <div className="mt-1 text-sm font-semibold text-zinc-900">{v.headline || "Sponsored"}</div>
                                      {v.body ? <div className="mt-2 text-xs text-zinc-700">{v.body}</div> : null}
                                      {v.mediaKind === "video" ? (
                                        <video
                                          className="mt-3 w-full rounded-2xl border border-zinc-200 bg-black"
                                          style={{
                                            maxHeight: 240,
                                            objectFit: normalizeMediaFit(v.mediaFit) ?? "contain",
                                            objectPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
                                          }}
                                          autoPlay
                                          loop
                                          playsInline
                                          preload="metadata"
                                          muted
                                          src={v.mediaUrl}
                                        />
                                      ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={v.mediaUrl}
                                          alt="Creative"
                                          className="mt-3 w-full rounded-2xl border border-zinc-200 object-cover"
                                          style={{
                                            maxHeight: 240,
                                            objectFit: normalizeMediaFit(v.mediaFit) ?? "cover",
                                            objectPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
                                          }}
                                        />
                                      )}
                                      <div className="mt-3 inline-flex rounded-2xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white">
                                        {v.ctaText || "Learn"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              if (p === "FULLSCREEN_REWARD") {
                                const pct = clampFullscreenMaxWidthPct(v.fullscreenMediaMaxWidthPct) ?? 100;
                                return (
                                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-zinc-600">Fullscreen reward preview</div>
                                    <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-black">
                                      <div className="p-2 text-xs font-semibold text-white/80">Ad</div>
                                      <div className="h-[240px] w-full">
                                        <div className="mx-auto h-full w-full" style={{ maxWidth: `min(${pct}vw, 480px)` }}>
                                          {v.mediaKind === "video" ? (
                                            <video
                                              className="h-full w-full"
                                              style={{
                                                objectFit: normalizeMediaFit(v.mediaFit) ?? "contain",
                                                objectPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
                                              }}
                                              controls
                                              playsInline
                                              preload="metadata"
                                              src={v.mediaUrl}
                                            />
                                          ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={v.mediaUrl}
                                              alt="Creative"
                                              className="h-full w-full"
                                              style={{
                                                objectFit: normalizeMediaFit(v.mediaFit) ?? "contain",
                                                objectPosition: normalizeMediaPosition(v.mediaPosition) ?? "center",
                                              }}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              return null;
                            })()
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
                  <div className="mt-1 text-sm text-zinc-600">Credits can be claimed in the portal. Discount offers define the checkout discount (percent / amount / free month) and can be auto-applied.</div>

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

                            <label className="text-xs font-semibold text-zinc-600">Discount type</label>
                            <PortalListboxDropdown
                              value={normalizeDiscountType((o as any).discountType)}
                              options={[
                                { value: "percent", label: "% off" },
                                { value: "amount", label: "$ off" },
                                { value: "free_month", label: "Free month" },
                              ]}
                              onChange={(val) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                const discountType = normalizeDiscountType(val);

                                if (discountType === "free_month") {
                                  next[idx] = {
                                    ...cur,
                                    discountType,
                                    percentOff: 100,
                                    amountOffUsd: undefined,
                                    duration: "repeating",
                                    durationMonths: 1,
                                  };
                                } else if (discountType === "amount") {
                                  next[idx] = {
                                    ...cur,
                                    discountType,
                                    amountOffUsd: clampAmountOffUsd(cur.amountOffUsd),
                                    percentOff: undefined,
                                  };
                                } else {
                                  next[idx] = {
                                    ...cur,
                                    discountType,
                                    percentOff: clampPercentOff(cur.percentOff),
                                    amountOffUsd: undefined,
                                  };
                                }

                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            {normalizeDiscountType((o as any).discountType) === "percent" ? (
                              <>
                                <label className="text-xs font-semibold text-zinc-600">Percent off</label>
                                <input
                                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={Number.isFinite(Number((o as any).percentOff)) ? String((o as any).percentOff) : "20"}
                                  onChange={(e) => {
                                    const next = [...editor.offers] as OfferDraft[];
                                    const cur = next[idx] as any;
                                    next[idx] = { ...cur, percentOff: clampPercentOff(e.target.value) };
                                    setEditor({ ...editor, offers: next });
                                  }}
                                />
                              </>
                            ) : null}

                            {normalizeDiscountType((o as any).discountType) === "amount" ? (
                              <>
                                <label className="text-xs font-semibold text-zinc-600">Amount off (USD)</label>
                                <input
                                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={Number.isFinite(Number((o as any).amountOffUsd)) ? String((o as any).amountOffUsd) : "25"}
                                  onChange={(e) => {
                                    const next = [...editor.offers] as OfferDraft[];
                                    const cur = next[idx] as any;
                                    next[idx] = { ...cur, amountOffUsd: clampAmountOffUsd(e.target.value) };
                                    setEditor({ ...editor, offers: next });
                                  }}
                                />
                              </>
                            ) : null}

                            <label className="text-xs font-semibold text-zinc-600">Duration</label>
                            <PortalListboxDropdown
                              value={normalizeDiscountType((o as any).discountType) === "free_month" ? "repeating" : normalizeDiscountDuration((o as any).duration)}
                              options={[
                                { value: "once", label: "Once" },
                                { value: "repeating", label: "Repeating" },
                                { value: "forever", label: "Forever" },
                              ]}
                              onChange={(val) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                if (normalizeDiscountType(cur.discountType) === "free_month") return;
                                const duration = normalizeDiscountDuration(val);
                                next[idx] = {
                                  ...cur,
                                  duration,
                                  durationMonths: duration === "repeating" ? clampDurationMonths(cur.durationMonths) : undefined,
                                };
                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            {normalizeDiscountType((o as any).discountType) !== "free_month" && normalizeDiscountDuration((o as any).duration) === "repeating" ? (
                              <>
                                <label className="text-xs font-semibold text-zinc-600">Duration months</label>
                                <input
                                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                                  type="number"
                                  min={1}
                                  max={24}
                                  value={Number.isFinite(Number((o as any).durationMonths)) ? String((o as any).durationMonths) : "1"}
                                  onChange={(e) => {
                                    const next = [...editor.offers] as OfferDraft[];
                                    const cur = next[idx] as any;
                                    next[idx] = { ...cur, durationMonths: clampDurationMonths(e.target.value) };
                                    setEditor({ ...editor, offers: next });
                                  }}
                                />
                              </>
                            ) : null}

                            <label className="text-xs font-semibold text-zinc-600">Promo code (optional)</label>
                            <input
                              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                              placeholder="(e.g. BUILD20, optional)"
                              value={o.promoCode}
                              onChange={(e) => {
                                const next = [...editor.offers] as OfferDraft[];
                                const cur = next[idx] as any;
                                next[idx] = { ...cur, promoCode: e.target.value };
                                setEditor({ ...editor, offers: next });
                              }}
                            />

                            {!String(o.promoCode || "").trim() ? (
                              <div className="text-xs text-zinc-500">If left blank, a promo code is generated on save for sharing.</div>
                            ) : null}

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
                        onClick={() =>
                          setEditor({
                            ...editor,
                            offers: [
                              ...editor.offers,
                              {
                                kind: "discount",
                                label: "Discount",
                                promoCode: "",
                                appliesToServiceSlugs: [],
                                discountType: "percent",
                                percentOff: 20,
                                amountOffUsd: 25,
                                duration: "once",
                                durationMonths: 1,
                              },
                            ],
                          })
                        }
                      >
                        + Add discount offer
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-zinc-900">Notes</div>
                  <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                    Discount offers are enabled. If the ad links to Billing (or has no link), clicks route users to the discount checkout flow and the discount is auto-applied at Stripe checkout (promo code optional).
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
                                    <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "n/a"}</div>
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
                              <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "n/a"}</div>
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
