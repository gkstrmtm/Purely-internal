"use client";

import { useEffect, useMemo, useState } from "react";

import type { BookingMeetingIntegrationStatus, BookingMeetingOauthProvider } from "@/lib/bookingMeetingIntegrations.shared";

export type PortalMeetingPlatformValue = "PURELY_CONNECT" | "ZOOM" | "GOOGLE_MEET" | "OTHER";

export type PortalMeetingMode =
  | "PURELY_CONNECT"
  | "ZOOM"
  | "GOOGLE_MEET"
  | "PHONE"
  | "IN_PERSON"
  | "CUSTOM_LINK";

const MEETING_MODE_META: Record<
  PortalMeetingMode,
  {
    title: string;
    description: string;
    badge?: string;
    defaultLocation: string;
    detailLabel?: string;
    detailPlaceholder?: string;
    detailHelpText?: string;
  }
> = {
  PURELY_CONNECT: {
    title: "Purely Connect",
    description: "Create a secure room automatically for every booking.",
    badge: "Automatic",
    defaultLocation: "",
  },
  ZOOM: {
    title: "Zoom",
    description: "Create a fresh Zoom meeting automatically for every booking.",
    badge: "Popular",
    defaultLocation: "Zoom meeting",
  },
  GOOGLE_MEET: {
    title: "Google Meet",
    description: "Create a fresh Google Meet link automatically for every booking.",
    defaultLocation: "Google Meet",
  },
  PHONE: {
    title: "Phone call",
    description: "Book the call and handle it by phone.",
    defaultLocation: "Phone call",
    detailLabel: "Phone number or instructions",
    detailPlaceholder: "+1 (555) 555-5555 or call instructions",
    detailHelpText: "Optional. Add the number or any notes guests need before the call.",
  },
  IN_PERSON: {
    title: "In person",
    description: "Use a real-world location instead of a video room.",
    defaultLocation: "In-person meeting",
    detailLabel: "Venue or address",
    detailPlaceholder: "123 Main St, Suite 400",
    detailHelpText: "Optional. Add the venue, address, or arrival notes.",
  },
  CUSTOM_LINK: {
    title: "Custom link",
    description: "Use a dedicated link that is not tied to a built-in platform.",
    defaultLocation: "Meeting link provided after booking",
    detailLabel: "Meeting link",
    detailPlaceholder: "https://...",
    detailHelpText: "Optional. Add a fixed link if you already use one.",
  },
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikePhone(value: string) {
  const trimmed = value.trim();
  return /^tel:/i.test(trimmed) || /\+?\d[\d\s().-]{6,}/.test(trimmed) || trimmed.toLowerCase().includes("phone");
}

function looksLikeInPerson(value: string) {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.includes("in person") ||
    trimmed.includes("in-person") ||
    trimmed.includes("suite") ||
    trimmed.includes("street") ||
    trimmed.includes("st.") ||
    trimmed.includes("avenue") ||
    trimmed.includes("ave") ||
    trimmed.includes("road") ||
    trimmed.includes("rd") ||
    trimmed.includes("floor")
  );
}

export function getPortalMeetingMode(
  platform: PortalMeetingPlatformValue | string | null | undefined,
  meetingLocation: string | null | undefined,
): PortalMeetingMode {
  if (platform === "PURELY_CONNECT") return "PURELY_CONNECT";
  if (platform === "ZOOM") return "ZOOM";
  if (platform === "GOOGLE_MEET") return "GOOGLE_MEET";

  const trimmedLocation = String(meetingLocation || "").trim();
  if (!trimmedLocation) return "CUSTOM_LINK";
  if (looksLikePhone(trimmedLocation)) return "PHONE";
  if (looksLikeInPerson(trimmedLocation)) return "IN_PERSON";
  if (looksLikeUrl(trimmedLocation)) return "CUSTOM_LINK";
  return "CUSTOM_LINK";
}

export function getPortalMeetingModeMeta(mode: PortalMeetingMode) {
  return MEETING_MODE_META[mode];
}

export function getPortalMeetingLocationDetail(mode: PortalMeetingMode, meetingLocation: string | null | undefined) {
  const trimmedLocation = String(meetingLocation || "").trim();
  const meta = MEETING_MODE_META[mode];
  if (!trimmedLocation || trimmedLocation === meta.defaultLocation) return "";
  return trimmedLocation;
}

export function buildPortalMeetingLocationValue(mode: PortalMeetingMode, detail: string) {
  const trimmedDetail = String(detail || "").trim();
  const meta = MEETING_MODE_META[mode];
  if (mode === "PURELY_CONNECT") return "";
  return trimmedDetail || meta.defaultLocation;
}

export function getPortalMeetingLocationSummary(
  platform: PortalMeetingPlatformValue | string | null | undefined,
  meetingLocation: string | null | undefined,
) {
  const mode = getPortalMeetingMode(platform, meetingLocation);
  const meta = MEETING_MODE_META[mode];
  const detail = getPortalMeetingLocationDetail(mode, meetingLocation);
  return {
    mode,
    title: meta.title,
    summary: detail || meta.defaultLocation || "Purely Connect video room",
    configured: mode === "PURELY_CONNECT" || Boolean(detail || meta.defaultLocation),
  };
}

export function PortalMeetingPlatformConfigurator({
  platform,
  meetingLocation,
  integrationStatus,
  busy = false,
  title = "Meeting platform",
  description = "Choose the main platform first. Only show one focused configuration field when that platform actually needs more detail.",
  onPlatformChange,
  onMeetingLocationChange,
  onMeetingLocationCommit,
}: {
  platform: PortalMeetingPlatformValue | string | null | undefined;
  meetingLocation: string;
  integrationStatus?: BookingMeetingIntegrationStatus | null;
  busy?: boolean;
  title?: string;
  description?: string;
  onPlatformChange: (platform: PortalMeetingPlatformValue) => void | Promise<void>;
  onMeetingLocationChange: (value: string) => void;
  onMeetingLocationCommit: (value: string | undefined) => void | Promise<void>;
}) {
  const derivedMode = useMemo(
    () => getPortalMeetingMode(platform, meetingLocation),
    [meetingLocation, platform],
  );
  const [selectedMode, setSelectedMode] = useState<PortalMeetingMode>(derivedMode);
  const [detailDraft, setDetailDraft] = useState(() => getPortalMeetingLocationDetail(derivedMode, meetingLocation));
  const [currentPath, setCurrentPath] = useState("/portal/app/services/booking");

  useEffect(() => {
    setSelectedMode(derivedMode);
    setDetailDraft(getPortalMeetingLocationDetail(derivedMode, meetingLocation));
  }, [derivedMode, meetingLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrentPath(`${window.location.pathname}${window.location.search}`);
  }, []);

  const commitMode = (nextMode: PortalMeetingMode, nextDetail: string) => {
    const nextPlatform: PortalMeetingPlatformValue =
      nextMode === "PURELY_CONNECT"
        ? "PURELY_CONNECT"
        : nextMode === "ZOOM"
          ? "ZOOM"
          : nextMode === "GOOGLE_MEET"
            ? "GOOGLE_MEET"
            : "OTHER";
    const nextLocation = buildPortalMeetingLocationValue(nextMode, nextDetail);
    setSelectedMode(nextMode);
    onMeetingLocationChange(nextLocation);
    void onPlatformChange(nextPlatform);
    void onMeetingLocationCommit(nextLocation || undefined);
  };

  const activeMeta = MEETING_MODE_META[selectedMode];
  const providerKey: BookingMeetingOauthProvider | null =
    selectedMode === "ZOOM" ? "zoom" : selectedMode === "GOOGLE_MEET" ? "google_meet" : null;
  const providerStatus = providerKey ? integrationStatus?.providers?.[providerKey] ?? null : null;
  const connectHref = providerKey ? `/api/portal/booking/integrations/${providerKey}/connect?next=${encodeURIComponent(currentPath)}` : null;
  const showsDetailField = selectedMode === "PHONE" || selectedMode === "IN_PERSON" || selectedMode === "CUSTOM_LINK";

  const providerStatusNotice = useMemo(() => {
    if (!providerKey || !providerStatus) return null;
    if (!integrationStatus?.encryptionConfigured) {
      return {
        tone: "warning" as const,
        text: "Secure integration storage is not configured on this environment yet.",
      };
    }
    if (!providerStatus.oauthConfigured) {
      return {
        tone: "warning" as const,
        text: `${activeMeta.title} OAuth is not configured on this environment yet.`,
      };
    }
    if (!providerStatus.connected) {
      return {
        tone: "info" as const,
        text: `Connect your ${activeMeta.title} account to create a fresh meeting automatically for each booking.`,
      };
    }
    return {
      tone: "success" as const,
      text: providerStatus.connectedEmail
        ? `${activeMeta.title} is connected as ${providerStatus.connectedEmail}. A fresh meeting will be created automatically for each booking.`
        : `${activeMeta.title} is connected. A fresh meeting will be created automatically for each booking.`,
    };
  }, [activeMeta.title, integrationStatus?.encryptionConfigured, providerKey, providerStatus]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
      <div className="font-medium text-zinc-800">{title}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-600">{description}</div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(["PURELY_CONNECT", "ZOOM", "GOOGLE_MEET", "PHONE", "IN_PERSON", "CUSTOM_LINK"] as PortalMeetingMode[]).map((mode) => {
          const meta = MEETING_MODE_META[mode];
          const selected = selectedMode === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={busy}
              onClick={() => {
                const nextDetail = mode === selectedMode ? detailDraft : "";
                setDetailDraft(nextDetail);
                commitMode(mode, nextDetail);
              }}
              className={classNames(
                "rounded-2xl border px-3 py-3 text-left transition",
                selected
                  ? "border-zinc-900 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">{meta.title}</div>
                {meta.badge ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {meta.badge}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-600">{meta.description}</div>
            </button>
          );
        })}
      </div>

      {selectedMode === "PURELY_CONNECT" ? (
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs leading-5 text-zinc-600">
          Guests get a secure Purely Connect room automatically. No extra handoff field is needed here.
        </div>
      ) : null}

      {providerKey && providerStatusNotice ? (
        <div
          className={classNames(
            "mt-3 rounded-2xl border px-3 py-3 text-xs leading-5",
            providerStatusNotice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : providerStatusNotice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-blue-200 bg-blue-50 text-blue-900",
          )}
        >
          <div>{providerStatusNotice.text}</div>
          {!providerStatus?.connected && integrationStatus?.encryptionConfigured && providerStatus?.oauthConfigured && connectHref ? (
            <a
              href={connectHref}
              className="mt-3 inline-flex items-center justify-center rounded-xl border border-current/20 bg-white px-3 py-2 text-xs font-semibold text-current hover:bg-white/80"
            >
              Connect {activeMeta.title}
            </a>
          ) : null}
        </div>
      ) : null}

      {showsDetailField && activeMeta.detailLabel ? (
        <label className="mt-3 block rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm">
          <div className="font-medium text-zinc-800">{activeMeta.detailLabel}</div>
          {activeMeta.detailHelpText ? <div className="mt-1 text-xs leading-5 text-zinc-600">{activeMeta.detailHelpText}</div> : null}
          <input
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
            placeholder={activeMeta.detailPlaceholder}
            value={detailDraft}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDetailDraft(nextValue);
              onMeetingLocationChange(buildPortalMeetingLocationValue(selectedMode, nextValue));
            }}
            onBlur={() => {
              const nextValue = buildPortalMeetingLocationValue(selectedMode, detailDraft);
              onMeetingLocationChange(nextValue);
              void onMeetingLocationCommit(nextValue || undefined);
            }}
            disabled={busy}
          />
        </label>
      ) : null}
    </div>
  );
}