"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconSend, IconSendHover } from "@/app/portal/PortalIcons";
import GlassSurface from "@/components/GlassSurface";
import { portalGlassBackdropClass, portalGlassButtonClass, portalGlassPanelClass } from "@/components/portalGlass";
import { buildPortalAiChatThreadHref } from "@/lib/portalAiChatThreadRefs";

type VersionPayload = {
  ok?: boolean;
  buildSha?: string | null;
  commitRef?: string | null;
  deploymentId?: string | null;
  nodeEnv?: string | null;
  now?: string;
};

type BugReportResponse = { ok?: boolean; reportId?: string; emailed?: boolean; error?: string };

type SuggestedSetupAction = {
  id: string;
  serviceSlug: string;
  title: string;
  description: string;
};

type SuggestedSetupCardState = "ready" | "applying" | "applied" | "error";

type SupportChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  suggestedSetup?: {
    key: string;
    title: string;
    actionIds: string[];
    detailLines: string[];
    status: SuggestedSetupCardState;
    error?: string | null;
  };
};

type WidgetSuggestedSetup = {
  key: string;
  serviceSlug: string;
  title: string;
  actionIds: string[];
  detailLines: string[];
  text: string;
};

function isSafeHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return false;
  if (raw.startsWith("/")) return true;
  try {
    const u = new URL(raw);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol);
  } catch {
    return false;
  }
}

function normalizeHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("www.")) return `https://${raw}`;
  return raw;
}

function renderInlineMarkdownish(text: string): Array<string | { t: "code" | "strong" | "em"; v: string }> {
  const out: Array<string | { t: "code" | "strong" | "em"; v: string }> = [];
  let s = text;

  const pushText = (v: string) => {
    if (!v) return;
    out.push(v);
  };

  while (s.length) {
    const idxCode = s.indexOf("`");
    const idxStrong = s.indexOf("**");
    const idxEm = s.indexOf("*");

    const candidates = [
      { idx: idxCode, kind: "code" as const },
      { idx: idxStrong, kind: "strong" as const },
      { idx: idxEm, kind: "em" as const },
    ].filter((c) => c.idx >= 0);

    if (candidates.length === 0) {
      pushText(s);
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const next = candidates[0]!;

    if (next.idx > 0) {
      pushText(s.slice(0, next.idx));
      s = s.slice(next.idx);
      continue;
    }

    if (next.kind === "code") {
      const end = s.indexOf("`", 1);
      if (end > 1) {
        out.push({ t: "code", v: s.slice(1, end) });
        s = s.slice(end + 1);
      } else {
        pushText(s);
        break;
      }
      continue;
    }

    if (next.kind === "strong") {
      const end = s.indexOf("**", 2);
      if (end > 2) {
        out.push({ t: "strong", v: s.slice(2, end) });
        s = s.slice(end + 2);
      } else {
        pushText(s);
        break;
      }
      continue;
    }

    if (s.startsWith("**")) {
      pushText(s.slice(0, 2));
      s = s.slice(2);
      continue;
    }
    const end = s.indexOf("*", 1);
    if (end > 1) {
      out.push({ t: "em", v: s.slice(1, end) });
      s = s.slice(end + 1);
    } else {
      pushText(s);
      break;
    }
  }

  return out;
}

function renderInlineTokens(tokens: ReturnType<typeof renderInlineMarkdownish>): React.ReactNode {
  return (
    <>
      {tokens.map((p, j) => {
        if (typeof p === "string") return <span key={j}>{p}</span>;
        if (p.t === "code") {
          return (
            <code key={j} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.95em]">
              {p.v}
            </code>
          );
        }
        if (p.t === "strong") return <strong key={j}>{p.v}</strong>;
        return <em key={j}>{p.v}</em>;
      })}
    </>
  );
}

function renderInlineWithLinks(text: string): React.ReactNode {
  const s = String(text || "");
  const hasMarkdownLinks = /\[[^\]]+\]\([^)\s]+\)/.test(s);

  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;

    if (start > lastIdx) {
      const chunk = s.slice(lastIdx, start);
      parts.push(
        <span key={`t_${lastIdx}_${start}`}>{renderInlineTokens(renderInlineMarkdownish(chunk))}</span>,
      );
    }

    const label = m[1] ?? "";
    const href = normalizeHref(m[2] ?? "");
    if (isSafeHref(href)) {
      const external = /^https?:\/\//i.test(href);
      parts.push(
        <a
          key={`link_${start}_${end}`}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          className="font-semibold text-brand-blue underline underline-offset-2 hover:opacity-90"
        >
          {renderInlineTokens(renderInlineMarkdownish(label))}
        </a>,
      );
    } else {
      parts.push(
        <span key={`bad_${start}_${end}`}>{renderInlineTokens(renderInlineMarkdownish(m[0]))}</span>,
      );
    }

    lastIdx = end;
  }

  if (lastIdx < s.length) {
    parts.push(
      <span key={`t_${lastIdx}_${s.length}`}>{renderInlineTokens(renderInlineMarkdownish(s.slice(lastIdx)))}</span>,
    );
  }

  if (!hasMarkdownLinks) {
    const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const nodes: React.ReactNode[] = [];
    let matchedAny = false;
    let li = 0;
    let um: RegExpExecArray | null;
    while ((um = urlRe.exec(s))) {
      matchedAny = true;
      const start = um.index;
      const end = start + um[0].length;
      if (start > li) {
        nodes.push(
          <span key={`u_${li}_${start}`}>{renderInlineTokens(renderInlineMarkdownish(s.slice(li, start)))}</span>,
        );
      }
      const href = normalizeHref(um[0]);
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`url_${start}_${end}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-brand-blue underline underline-offset-2 hover:opacity-90"
          >
            {um[0]}
          </a>,
        );
      } else {
        nodes.push(
          <span key={`ubad_${start}_${end}`}>{renderInlineTokens(renderInlineMarkdownish(um[0]))}</span>,
        );
      }
      li = end;
    }
    if (li < s.length) {
      nodes.push(
        <span key={`u_${li}_${s.length}`}>{renderInlineTokens(renderInlineMarkdownish(s.slice(li)))}</span>,
      );
    }
    if (matchedAny) return <>{nodes}</>;
  }

  return <>{parts}</>;
}

function renderMarkdownish(text: string): React.ReactNode {
  const lines = String(text || "").split(/\r?\n/);
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, i) => {
        const line = rawLine.trimEnd();
        if (!line) return <div key={i} />;

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const bullet = line.match(/^[-*]\s+(.*)$/);
        const ordered = line.match(/^\d+\.\s+(.*)$/);

        const body = heading ? heading[2] : bullet ? bullet[1] : ordered ? ordered[1] : line;
        const prefix = bullet ? "• " : ordered ? `${line.match(/^\d+/)?.[0] ?? ""}. ` : "";

        const content = (
          <>
            {prefix}
            {renderInlineWithLinks(body)}
          </>
        );

        if (heading) {
          return (
            <div key={i} className="font-semibold text-zinc-900">
              {content}
            </div>
          );
        }

        return (
          <div key={i} className="whitespace-pre-wrap">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function shortSha(sha: string | null | undefined) {
  const s = (sha ?? "").trim();
  if (!s) return "unknown";
  return s.length > 10 ? s.slice(0, 10) : s;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function titleFromWidgetText(textRaw: string, fallback: string) {
  const text = String(textRaw || "").trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  if (!text) return fallback;
  const sentence = text.split(/[.?!]/)[0]?.trim() || text;
  const cleaned = sentence.replace(/^please\s+/i, "").replace(/^can you\s+/i, "").replace(/^could you\s+/i, "").trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 6);
  const title = words.join(" ").trim().slice(0, 60);
  return title || fallback;
}

function newClientId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function titleCaseWord(word: string) {
  if (!word) return word;
  if (word.toUpperCase() === word) return word;
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function formatServiceSlugLabel(slug: string) {
  const raw = String(slug || "").trim();
  if (!raw) return "this page";
  const parts = raw.split("-").filter(Boolean);
  return parts.map((part) => (/^(ai|crm|sms)$/i.test(part) ? part.toUpperCase() : titleCaseWord(part))).join(" ");
}

function inferSuggestedSetupServiceSlug(pathname: string) {
  const cleanPath = String(pathname || "").replace(/^\/(portal|credit)/, "") || "";
  if (cleanPath === "/app" || cleanPath === "/app/" || cleanPath.startsWith("/app/dashboard")) return "dashboard";
  const match = cleanPath.match(/^\/app\/services\/([^/]+)/);
  return match?.[1] ?? null;
}

function buildWidgetSuggestedSetup(actions: SuggestedSetupAction[]): WidgetSuggestedSetup | null {
  if (!actions.length) return null;
  const serviceSlug = String(actions[0]?.serviceSlug || "").trim();
  const serviceLabel = formatServiceSlugLabel(actions[0]?.serviceSlug || "");
  const actionIds = actions.map((action) => action.id);
  const key = actionIds.join("|");
  const detailLines = actions.map((action) => `${action.title}: ${action.description}`).filter(Boolean);
  const intro =
    actions.length === 1
      ? `I found a suggested setup for ${serviceLabel}.`
      : `I found ${actions.length} suggested setup updates for ${serviceLabel}.`;
  const bulletLines = detailLines.map((line) => `- ${line}`).join("\n");

  return {
    key,
    serviceSlug,
    title: actions.length === 1 ? actions[0]!.title : `Suggested setup for ${serviceLabel}`,
    actionIds,
    detailLines,
    text: `${intro}\n${bulletLines}\n\nIf you want, I can apply it now.`,
  };
}

function buildSuggestedSetupMessage(
  suggestion: WidgetSuggestedSetup,
  opts?: { id?: string; status?: SuggestedSetupCardState; error?: string | null; text?: string },
): SupportChatMessage {
  return {
    id: opts?.id || `widget-suggested-setup-${suggestion.key}`,
    role: "assistant",
    text: opts?.text ?? suggestion.text,
    suggestedSetup: {
      key: suggestion.key,
      title: suggestion.title,
      actionIds: suggestion.actionIds,
      detailLines: suggestion.detailLines,
      status: opts?.status ?? "ready",
      error: opts?.error ?? null,
    },
  };
}

function ThinkingDots() {
  return (
    <div className="inline-flex items-center gap-1" aria-label="Thinking">
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-400/80 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-400/80 animate-bounce" style={{ animationDelay: "100ms" }} />
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-400/80 animate-bounce" style={{ animationDelay: "200ms" }} />
    </div>
  );
}

function IconContinueWithPura({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M12 13.5V7.5M9 10.5H15M9.9 19.2L11.36 21.1467C11.5771 21.4362 11.6857 21.5809 11.8188 21.6327C11.9353 21.678 12.0647 21.678 12.1812 21.6327C12.3143 21.5809 12.4229 21.4362 12.64 21.1467L14.1 19.2C14.3931 18.8091 14.5397 18.6137 14.7185 18.4645C14.9569 18.2656 15.2383 18.1248 15.5405 18.0535C15.7671 18 16.0114 18 16.5 18C17.8978 18 18.5967 18 19.1481 17.7716C19.8831 17.4672 20.4672 16.8831 20.7716 16.1481C21 15.5967 21 14.8978 21 13.5V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V13.5C3 14.8978 3 15.5967 3.22836 16.1481C3.53284 16.8831 4.11687 17.4672 4.85195 17.7716C5.40326 18 6.10218 18 7.5 18C7.98858 18 8.23287 18 8.45951 18.0535C8.76169 18.1248 9.04312 18.2656 9.2815 18.4645C9.46028 18.6137 9.60685 18.8091 9.9 19.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const defaultWidgetWelcomeMessage = (): SupportChatMessage => ({
  id: "widget-welcome",
  role: "assistant",
  text: "Ask a question, assign tasks, and more!",
});

const floatingToolsSecondaryButtonClass =
  [
    "rounded-2xl px-3 py-2 text-xs font-semibold text-zinc-500 transition-colors duration-100 hover:bg-white/80 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]",
    portalGlassButtonClass,
  ].join(" ");

const floatingToolsCloseButtonClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-zinc-600 transition-colors duration-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]";

const floatingToolsPrimaryButtonClass =
  "rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition-opacity duration-100 hover:opacity-95 disabled:opacity-60";

const floatingToolsGradientButtonClass =
  "rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-4 text-sm font-semibold text-white transition-opacity duration-100 hover:opacity-95 disabled:opacity-60";

const floatingToolsPuraSendButtonClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-blue text-white transition-all duration-100 hover:scale-105 hover:opacity-95 disabled:opacity-60";

const floatingToolsGlassSurfaceProps = {
  borderWidth: 0.04,
  blur: 7,
  displace: 0.22,
  distortionScale: -72,
  redOffset: 0,
  greenOffset: 2,
  blueOffset: 6,
  backgroundOpacity: 0.16,
  saturation: 1.05,
  brightness: 46,
  opacity: 0.985,
  mixBlendMode: "soft-light" as const,
  style: { background: "rgba(255,255,255,0.46)", boxShadow: "none" },
};

export function PortalFloatingTools() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";
  const isDashboardRoute = pathname === `${portalBase}/app`;
  const isSettingsRoute =
    pathname.startsWith(`${portalBase}/app/settings`) ||
    pathname.startsWith(`${portalBase}/app/profile`) ||
    pathname.startsWith(`${portalBase}/app/billing`);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [compactDock, setCompactDock] = useState(false);
  const [forceHidden, setForceHidden] = useState(false);
  const [profileHidden, setProfileHidden] = useState(false);
  const [version, setVersion] = useState<VersionPayload | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<SupportChatMessage[]>([defaultWidgetWelcomeMessage()]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pageSuggestion, setPageSuggestion] = useState<WidgetSuggestedSetup | null>(null);

  const chatMessagesRef = useRef<SupportChatMessage[]>(chatMessages);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const chatScrollRafRef = useRef<number | null>(null);
  const syncingSuggestionKeyRef = useRef<string | null>(null);

  const toolsCardRef = useRef<HTMLDivElement | null>(null);
  const chatPanelRef = useRef<HTMLDivElement | null>(null);
  const reportCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsSmallScreen(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const loadSuggestedSetupPreview = useCallback(async () => {
    if (typeof pathname === "string" && pathname.includes("/page-editor")) {
      setPageSuggestion(null);
      return;
    }
    const serviceSlug = inferSuggestedSetupServiceSlug(pathname);
    if (!serviceSlug) {
      setPageSuggestion(null);
      return;
    }

    const res = await fetch("/api/portal/suggested-setup/preview", { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) {
      setPageSuggestion(null);
      return;
    }

    const json = (await res.json().catch(() => null)) as { proposedActions?: SuggestedSetupAction[] } | null;
    const proposedActions = Array.isArray(json?.proposedActions)
      ? json.proposedActions
          .filter((action) => action && typeof action.id === "string" && typeof action.serviceSlug === "string")
          .map((action) => ({
            id: String(action.id),
            serviceSlug: String(action.serviceSlug),
            title: String(action.title || "Suggested setup"),
            description: String(action.description || ""),
          }))
      : [];

    setPageSuggestion(buildWidgetSuggestedSetup(proposedActions.filter((action) => action.serviceSlug === serviceSlug)));
  }, [pathname]);

  useEffect(() => {
    void loadSuggestedSetupPreview();
  }, [loadSuggestedSetupPreview]);

  useEffect(() => {
    if (!chatOpen || !chatThreadId) return;
    let mounted = true;
    (async () => {
      const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(chatThreadId)}/messages`, {
        cache: "no-store",
      }).catch(() => null as any);

      if (!mounted) return;

      if (!res?.ok) {
        setChatThreadId(null);
        setChatMessages([defaultWidgetWelcomeMessage()]);
        return;
      }

      const json = (await res.json().catch(() => null)) as { ok?: boolean; messages?: Array<{ id: string; role: string; text: string }> } | null;
      if (!json?.ok) {
        setChatThreadId(null);
        setChatMessages([defaultWidgetWelcomeMessage()]);
        return;
      }

      const nextMessages = Array.isArray(json.messages)
        ? json.messages
            .filter((message) => message && (message.role === "assistant" || message.role === "user"))
            .map((message) => ({ id: String(message.id), role: message.role as "assistant" | "user", text: String(message.text || "") }))
        : [];

      setChatMessages(nextMessages.length ? nextMessages : [defaultWidgetWelcomeMessage()]);
    })();
    return () => {
      mounted = false;
    };
  }, [chatOpen, chatThreadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const readHidden = () => root.getAttribute("data-pa-hide-floating-tools") === "1";
    const readPrefHidden = () => root.getAttribute("data-pa-hide-floating-tools-pref") === "1";
    setForceHidden(readHidden());
    setProfileHidden(readPrefHidden());

    const mo = new MutationObserver(() => {
      setForceHidden(readHidden());
      setProfileHidden(readPrefHidden());
    });
    mo.observe(root, { attributes: true, attributeFilter: ["data-pa-hide-floating-tools", "data-pa-hide-floating-tools-pref"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/profile", { cache: "no-store" }).catch(() => null as any);
      if (!mounted || !res?.ok) return;
      const json = (await res.json().catch(() => null)) as { user?: { hideFloatingTools?: boolean } | null } | null;
      const nextHidden = Boolean(json?.user?.hideFloatingTools);
      setProfileHidden(nextHidden);
      if (typeof document !== "undefined") {
        if (nextHidden) document.documentElement.setAttribute("data-pa-hide-floating-tools-pref", "1");
        else document.documentElement.removeAttribute("data-pa-hide-floating-tools-pref");
      }
    })();

    const onPrefChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ hidden?: boolean }>).detail;
      const nextHidden = Boolean(detail?.hidden);
      setProfileHidden(nextHidden);
    };

    window.addEventListener("pa.portal.floating-tools-pref", onPrefChanged as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener("pa.portal.floating-tools-pref", onPrefChanged as EventListener);
    };
  }, []);

  const hidden = forceHidden || profileHidden || (isSmallScreen && !isDashboardRoute && !isSettingsRoute && !chatOpen && !reportOpen);
  const moveDockToTopRight = false;
  const notePositionClass = moveDockToTopRight
    ? `fixed right-3 top-[calc(env(safe-area-inset-top)+4rem)] z-130103 max-w-[calc(100vw-1.5rem)] rounded-2xl px-4 py-3 text-sm text-zinc-800 sm:top-auto sm:right-4 sm:max-w-sm sm:bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+6rem)] ${portalGlassPanelClass}`
    : `fixed bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+6rem)] right-4 z-130103 max-w-sm rounded-2xl px-4 py-3 text-sm text-zinc-800 ${portalGlassPanelClass}`;
  const reportPanelPositionClass = moveDockToTopRight
    ? `absolute right-3 top-[calc(env(safe-area-inset-top)+4rem)] w-[min(520px,calc(100vw-1.5rem))] sm:top-auto sm:right-4 sm:bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1.5rem)] sm:w-[min(520px,calc(100vw-2rem))]`
    : `absolute bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1.5rem)] right-4 w-[min(520px,calc(100vw-2rem))]`;
  const chatPanelPositionClass = moveDockToTopRight
    ? `fixed right-3 top-[calc(env(safe-area-inset-top)+4rem)] z-130101 w-[min(520px,calc(100vw-1.5rem))] sm:right-4 sm:top-auto sm:bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1.5rem)] sm:w-[min(520px,calc(100vw-2rem))]`
    : `fixed bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1.5rem)] right-4 z-130101 w-[min(520px,calc(100vw-2rem))]`;
  const dockPositionClass = moveDockToTopRight
    ? "fixed right-3 top-[calc(env(safe-area-inset-top)+4rem)] z-130100 flex justify-end sm:top-auto sm:right-4 sm:bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1rem)]"
    : "fixed bottom-[calc(var(--pa-portal-embed-footer-offset,0px)+1rem)] right-4 z-130100 flex justify-end";

  useEffect(() => {
    if (!hidden) return;
    setReportOpen(false);
    setChatOpen(false);
    setMinimized(true);
  }, [hidden]);

  function scheduleChatScrollToBottom(force = false) {
    if (typeof window === "undefined") return;
    if (!force && !shouldAutoScrollRef.current) return;
    if (chatScrollRafRef.current) window.cancelAnimationFrame(chatScrollRafRef.current);
    chatScrollRafRef.current = window.requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    });
  }

  useEffect(() => {
    if (chatOpen) {
      shouldAutoScrollRef.current = true;
      scheduleChatScrollToBottom(true);
    }
  }, [chatOpen]);

  useEffect(() => {
    scheduleChatScrollToBottom();
  }, [chatMessages.length]);

  useEffect(() => {
    return () => {
      if (chatScrollRafRef.current) {
        window.cancelAnimationFrame(chatScrollRafRef.current);
        chatScrollRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("pa_portal_floating_tools_minimized");
    if (saved === "0") setMinimized(false);
    else setMinimized(true);

    const savedDock = window.localStorage.getItem("pa_portal_floating_tools_dock");
    setCompactDock(savedDock === "icon");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pa_portal_floating_tools_minimized", minimized ? "1" : "0");
  }, [minimized]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pa_portal_floating_tools_dock", compactDock ? "icon" : "pill");
  }, [compactDock]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    const setReserve = (px: number) => {
      const v = Number.isFinite(px) ? Math.max(0, Math.floor(px)) : 0;
      root.style.setProperty("--pa-portal-floating-tools-reserve", `${v}px`);
    };

    if (hidden || moveDockToTopRight) {
      setReserve(0);
      return;
    }

    const pickEl = () => {
      if (reportOpen) return reportCardRef.current;
      if (chatOpen) return chatPanelRef.current;
      if (!minimized) return toolsCardRef.current;
      return null;
    };

    const el = pickEl();
    if (!el) {
      setReserve(0);
      return;
    }

    const recompute = () => {
      const h = el.getBoundingClientRect().height;
      // The inbox floating email button already sits higher than the tools widget
      // (5.75rem vs 1.5rem). Reserve only the *additional* space needed.
      const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const baselineDeltaPx = (5.75 - 1.5) * remPx;
      const marginPx = 16;
      setReserve(Math.ceil(Math.max(0, h + marginPx - baselineDeltaPx)));
    };

    recompute();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => recompute()) : null;
    ro?.observe(el);
    window.addEventListener("resize", recompute);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [chatOpen, hidden, minimized, moveDockToTopRight, reportOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return () => {
      document.documentElement.style.removeProperty("--pa-portal-floating-tools-reserve");
    };
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
  }, [version?.buildSha]);

  if (hidden) return null;

  function persistMinimized(next: boolean) {
    setMinimized(next);
  }

  function stripDefaultWelcome(messages: SupportChatMessage[]) {
    return messages.filter((message) => message.id !== "widget-welcome");
  }

  function upsertSuggestedSetupMessage(
    messages: SupportChatMessage[],
    suggestion: WidgetSuggestedSetup,
    opts?: { id?: string; text?: string; status?: SuggestedSetupCardState; error?: string | null },
  ) {
    const withoutDefault = stripDefaultWelcome(messages);
    const filtered = withoutDefault.filter(
      (message) => message.suggestedSetup?.key !== suggestion.key && !(message.role === "assistant" && message.text === suggestion.text),
    );
    return [...filtered, buildSuggestedSetupMessage(suggestion, opts)];
  }

  function setSuggestionCardStatus(key: string, status: SuggestedSetupCardState, error?: string | null) {
    setChatMessages((current) =>
      current.map((message) =>
        message.suggestedSetup?.key === key
          ? {
              ...message,
              suggestedSetup: {
                ...message.suggestedSetup,
                status,
                error: error ?? null,
              },
            }
          : message,
      ),
    );
  }

  async function ensurePageSuggestionInThread(suggestion: WidgetSuggestedSetup) {
    if (syncingSuggestionKeyRef.current === suggestion.key) return chatThreadId;
    syncingSuggestionKeyRef.current = suggestion.key;

    let threadIdForSuggestion = chatThreadId;
    if (!threadIdForSuggestion) {
      const created = await fetch("/api/portal/ai-chat/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: pageSuggestion ? pageSuggestion.title : "Widget chat" }),
      }).catch(() => null as any);

      const createdJson = (created ? ((await created.json().catch(() => null)) as { ok?: boolean; thread?: { id?: string } | null } | null) : null) ?? null;
      if (!created?.ok || !createdJson?.ok || !createdJson.thread?.id) {
        syncingSuggestionKeyRef.current = null;
        return null;
      }

      threadIdForSuggestion = String(createdJson.thread.id);
      persistWidgetThreadId(threadIdForSuggestion);
    }

    const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSuggestion)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: typeof window !== "undefined" ? window.location.href : undefined,
        widgetSuggestion: {
          key: suggestion.key,
          serviceSlug: suggestion.serviceSlug,
          title: suggestion.title,
          actionIds: suggestion.actionIds,
          detailLines: suggestion.detailLines,
        },
      }),
    }).catch(() => null as any);

    const json = (await res?.json?.().catch(() => null)) as {
      ok?: boolean;
      assistantMessage?: { id: string; text: string } | null;
    } | null;

    if (res?.ok && json?.ok && json.assistantMessage) {
      const assistantMessage = json.assistantMessage;
      setChatMessages((current) =>
        upsertSuggestedSetupMessage(current, suggestion, {
          id: String(assistantMessage.id || `widget-suggested-setup-${suggestion.key}`),
          text: String(assistantMessage.text || suggestion.text),
        }),
      );
    }

    syncingSuggestionKeyRef.current = null;
    return threadIdForSuggestion;
  }

  function openChatPanel() {
    setReportOpen(false);
    setChatOpen(true);
    setMinimized(false);
    if (pageSuggestion) {
      setChatMessages((current) => upsertSuggestedSetupMessage(current, pageSuggestion));
      void ensurePageSuggestionInThread(pageSuggestion);
    }
    shouldAutoScrollRef.current = true;
    scheduleChatScrollToBottom(true);
  }

  async function applySuggestedSetupFromMessage(actionIds: string[], key: string) {
    if (!actionIds.length) return;
    setSuggestionCardStatus(key, "applying", null);

    const res = await fetch("/api/portal/suggested-setup/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionIds }),
    }).catch(() => null as any);

    const json = (await res?.json?.().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res?.ok || !json?.ok) {
      setSuggestionCardStatus(key, "error", json?.error ?? "Suggested setup could not be applied.");
      return;
    }

    setSuggestionCardStatus(key, "applied", null);
    setPageSuggestion(null);
    setNote("Suggested setup applied.");
    window.setTimeout(() => setNote(null), 3500);
    router.refresh();
    void loadSuggestedSetupPreview();
  }

  function persistWidgetThreadId(nextThreadId: string | null) {
    setChatThreadId(nextThreadId);
  }

  function continueWithPura() {
    if (typeof window === "undefined") return;
    const target = buildPortalAiChatThreadHref({
      basePath: portalBase,
      thread: chatThreadId ? { id: chatThreadId } : null,
    });
    window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: true } }));
    void router.prefetch(target);
    router.push(target, { scroll: false });
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
    setReportOpen(false);
    setSending(false);

    setNote(json.emailed ? "Bug report sent. Thanks!" : "Bug report saved (email not configured).");
    window.setTimeout(() => setNote(null), 3500);
  }

  async function sendSupportChat() {
    const text = chatInput.trim();
    if (!text || chatSending) return;

    setChatInput("");
    setChatSending(true);
    let threadIdForSend = chatThreadId;
    let createdThreadId: string | null = null;

    if (pageSuggestion) {
      const suggestedThreadId = await ensurePageSuggestionInThread(pageSuggestion);
      if (suggestedThreadId) threadIdForSend = suggestedThreadId;
    }

    if (!threadIdForSend) {
      const created = await fetch("/api/portal/ai-chat/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: titleFromWidgetText(text, "Widget chat") }),
      }).catch(() => null as any);

      const createdJson = (created ? ((await created.json().catch(() => null)) as { ok?: boolean; thread?: { id?: string } | null; error?: string } | null) : null) ?? null;
      if (!created?.ok || !createdJson?.ok || !createdJson.thread?.id) {
        setNote(String(createdJson?.error || "Support chat is unavailable.").trim() || null);
        window.setTimeout(() => setNote(null), 3500);
        setChatSending(false);
        scheduleChatScrollToBottom(true);
        return;
      }

      createdThreadId = String(createdJson.thread.id);
      threadIdForSend = createdThreadId;
      persistWidgetThreadId(createdThreadId);
    }

    const optimisticUserId = `optimistic-user-${newClientId()}`;
    const optimisticAssistantId = `optimistic-assistant-${newClientId()}`;
    setChatMessages((current) => [
      ...current,
      { id: optimisticUserId, role: "user", text },
      { id: optimisticAssistantId, role: "assistant", text: "" },
    ]);
    shouldAutoScrollRef.current = true;
    scheduleChatScrollToBottom(true);

    const res = await fetch(`/api/portal/ai-chat/threads/${encodeURIComponent(threadIdForSend)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    }).catch(() => null as any);

    if (!res?.ok) {
      setChatMessages((current) => {
        const cleaned = current.filter((message) => message.id !== optimisticUserId && message.id !== optimisticAssistantId);
        return cleaned;
      });
      setNote("Support chat is unavailable.");
      window.setTimeout(() => setNote(null), 3500);
      setChatSending(false);
      scheduleChatScrollToBottom(true);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      userMessage?: { id: string; role: "user"; text: string };
      assistantMessage?: { id: string; role: "assistant"; text: string };
    };
    if (!json?.ok) {
      setChatMessages((current) => {
        const cleaned = current.filter((message) => message.id !== optimisticUserId && message.id !== optimisticAssistantId);
        return cleaned;
      });
      setNote(String(json?.error || "Support chat failed.").trim() || null);
      window.setTimeout(() => setNote(null), 3500);
      setChatSending(false);
      scheduleChatScrollToBottom(true);
      return;
    }

    if (createdThreadId) persistWidgetThreadId(createdThreadId);

    setChatMessages((current) => {
      const cleaned = current.filter((message) => message.id !== optimisticUserId && message.id !== optimisticAssistantId);
      const next = [...cleaned];
      if (json.userMessage) next.push({ id: String(json.userMessage.id), role: "user", text: String(json.userMessage.text || "") });
      if (json.assistantMessage) next.push({ id: String(json.assistantMessage.id), role: "assistant", text: String(json.assistantMessage.text || "") });
      return next;
    });
    setChatSending(false);
    scheduleChatScrollToBottom(true);
  }

  return (
    <>
      {note ? (
        <div className={notePositionClass}>
          {note}
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-130102">
          <button
            type="button"
            className={classNames("absolute inset-0", portalGlassBackdropClass)}
            aria-label="Close"
            onClick={() => (!sending ? setReportOpen(false) : null)}
          />

          <div
            ref={reportCardRef}
            className={reportPanelPositionClass}
          >
            <GlassSurface {...floatingToolsGlassSurfaceProps} width="100%" height="auto" borderRadius={24} className="rounded-3xl shadow-2xl">
              <div className="w-full rounded-3xl bg-[rgba(255,255,255,0.62)] p-5 backdrop-blur-[2px]">
                <div className="mb-3 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Report a bug</div>
                    <div className="mt-1 text-xs text-zinc-500">{versionLabel}</div>
                  </div>
                  <button
                    type="button"
                    className={classNames(floatingToolsCloseButtonClass, "text-[1.35rem] leading-none disabled:opacity-60")}
                    onClick={() => setReportOpen(false)}
                    disabled={sending}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-4">
                  <textarea
                    className="min-h-30 w-full rounded-2xl border border-white/35 bg-white/55 p-3 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue)"
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
                    className={floatingToolsPrimaryButtonClass}
                    onClick={() => void submit()}
                    disabled={sending}
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </GlassSurface>
          </div>
        </div>
      ) : null}

      {chatOpen ? (
        <div
          ref={chatPanelRef}
          className={chatPanelPositionClass}
        >
          <GlassSurface {...floatingToolsGlassSurfaceProps} width="100%" height="auto" borderRadius={24} className="rounded-3xl shadow-2xl">
            <div className="w-full rounded-3xl bg-[rgba(255,255,255,0.62)] p-5 backdrop-blur-[2px]">
              <div className="mb-3 h-1.5 w-16 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(251,113,133,0.35))]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Pura</div>
                  <div className="mt-1 text-xs text-zinc-500">{versionLabel}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="group inline-flex items-center rounded-2xl bg-transparent text-sm font-semibold text-zinc-700 transition-colors duration-100 hover:text-zinc-900"
                    onClick={continueWithPura}
                    aria-label="Continue with Pura"
                    title="Continue with Pura"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-zinc-700 transition-all duration-100 group-hover:scale-105 group-hover:bg-zinc-50 group-hover:text-zinc-900">
                      <IconContinueWithPura />
                    </span>
                    <span className="ml-2 max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-[max-width,opacity] duration-200 group-hover:max-w-40 group-hover:opacity-100">
                      Continue with Pura
                    </span>
                  </button>
                  <button
                    type="button"
                    className={classNames(floatingToolsCloseButtonClass, "text-[1.35rem] leading-none")}
                    onClick={() => setChatOpen(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div
                ref={chatScrollRef}
                onScroll={() => {
                  const el = chatScrollRef.current;
                  if (!el) return;
                  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  shouldAutoScrollRef.current = distanceFromBottom < 140;
                }}
                className="mt-4 max-h-[55vh] space-y-3 overflow-auto"
              >
                {chatMessages.map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className={
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed " +
                      (m.role === "user"
                        ? "ml-10 bg-brand-blue font-semibold text-white"
                        : "mr-10 border border-zinc-200 bg-white text-zinc-800")
                    }
                  >
                    {m.role === "assistant" && m.id.startsWith("optimistic-assistant-") ? <ThinkingDots /> : m.role === "assistant" ? renderMarkdownish(m.text) : m.text}
                    {m.role === "assistant" && m.suggestedSetup ? (
                      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Suggestion</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900">{m.suggestedSetup.title}</div>
                        {m.suggestedSetup.detailLines.length ? (
                          <div className="mt-1 space-y-1 text-xs text-zinc-600">
                            {m.suggestedSetup.detailLines.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            className={classNames(
                              "rounded-xl px-3 py-2 text-xs font-semibold text-white transition-transform duration-150",
                              m.suggestedSetup.status === "applied"
                                ? "bg-emerald-600"
                                : m.suggestedSetup.status === "applying"
                                  ? "bg-zinc-400"
                                  : "bg-brand-blue hover:opacity-95",
                            )}
                            onClick={() => void applySuggestedSetupFromMessage(m.suggestedSetup!.actionIds, m.suggestedSetup!.key)}
                            disabled={m.suggestedSetup.status === "applying" || m.suggestedSetup.status === "applied"}
                          >
                            {m.suggestedSetup.status === "applied"
                              ? "Applied"
                              : m.suggestedSetup.status === "applying"
                                ? "Applying…"
                                : "Apply now"}
                          </button>
                          {m.suggestedSetup.status === "error" && m.suggestedSetup.error ? (
                            <div className="text-xs text-red-600">{m.suggestedSetup.error}</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={pageSuggestion ? "Reply to this suggestion…" : "Ask a question, assign tasks, and more!"}
                  className="h-11 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendSupportChat();
                  }}
                  disabled={chatSending}
                />
                <button
                  type="button"
                  className={classNames(floatingToolsPuraSendButtonClass, (!chatInput.trim() || chatSending) && "opacity-60")}
                  onClick={() => void sendSupportChat()}
                  disabled={!chatInput.trim() || chatSending}
                  aria-label="Send"
                >
                  <IconSend />
                </button>
              </div>

              <div className="mt-2 text-xs text-zinc-500">Continue in Pura anytime, or use Report bug if something is broken.</div>
            </div>
          </GlassSurface>
        </div>
      ) : null}

      {!reportOpen && !chatOpen ? <div className={dockPositionClass}>
        {minimized ? (
          compactDock ? (
            <div className="group flex items-center justify-end gap-2">
              <GlassSurface {...floatingToolsGlassSurfaceProps} width="auto" height={40} borderRadius={20} className="pointer-events-auto rounded-full opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
                <button
                  type="button"
                  className="pointer-events-none h-10 rounded-full bg-[rgba(255,255,255,0.62)] px-3 py-2 text-xs font-semibold text-zinc-700 backdrop-blur-[2px] transition-all duration-150 group-hover:pointer-events-auto hover:bg-[rgba(255,255,255,0.72)]"
                  onClick={() => setCompactDock(false)}
                  aria-label="Expand tools"
                >
                  Show
                </button>
              </GlassSurface>
              <div className="relative z-130140 h-11 w-11 overflow-visible">
                {pageSuggestion ? <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-130150 h-3.5 w-3.5 rounded-full bg-brand-pink ring-[2.5px] ring-white shadow-[0_0_0_1px_rgba(255,255,255,0.72),0_8px_18px_rgba(244,114,182,0.52)]" /> : null}
                <GlassSurface {...floatingToolsGlassSurfaceProps} width={44} height={44} borderRadius={18} className="pointer-events-auto rounded-2xl shadow-lg">
                  <button
                    type="button"
                    className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgba(255,255,255,0.62)] text-zinc-800 backdrop-blur-[2px] transition-all duration-100 hover:scale-105 hover:bg-[rgba(255,255,255,0.72)]"
                    onClick={() => persistMinimized(false)}
                    aria-label="Open chat and report tools"
                  >
                    <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(251,113,133,0.55))] text-white">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M7 18.4 4.6 20c-.4.3-1 .1-1-.4V6.4C3.6 5.1 4.7 4 6 4h12c1.3 0 2.4 1.1 2.4 2.4v7.2c0 1.3-1.1 2.4-2.4 2.4H8.8c-.2 0-.4 0-.6.2Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                </GlassSurface>
              </div>
            </div>
          ) : (
            <div className="group flex items-center justify-end gap-2">
              <GlassSurface {...floatingToolsGlassSurfaceProps} width="auto" height={40} borderRadius={20} className="pointer-events-auto rounded-full opacity-0 shadow-lg transition-all duration-150 group-hover:opacity-100">
                <button
                  type="button"
                  className="pointer-events-none h-10 rounded-full bg-[rgba(255,255,255,0.62)] px-3 py-2 text-xs font-semibold text-zinc-700 backdrop-blur-[2px] transition-all duration-150 group-hover:pointer-events-auto hover:bg-[rgba(255,255,255,0.72)]"
                  onClick={() => setCompactDock(true)}
                  aria-label="Hide tools"
                >
                  Hide
                </button>
              </GlassSurface>
              <GlassSurface {...floatingToolsGlassSurfaceProps} width="auto" height={44} borderRadius={22} className="pointer-events-auto overflow-visible rounded-full shadow-lg">
                <button
                  type="button"
                  className="relative flex h-11 items-center gap-2 rounded-full bg-[rgba(255,255,255,0.62)] px-3 py-2 text-xs font-semibold text-zinc-800 backdrop-blur-[2px] transition-colors duration-100 hover:bg-[rgba(255,255,255,0.72)]"
                  onClick={() => persistMinimized(false)}
                  aria-label="Open tools"
                >
                  {pageSuggestion ? <span className="absolute right-1.5 top-1 z-20 h-2.5 w-2.5 rounded-full bg-brand-pink ring-2 ring-white shadow-[0_0_0_1px_rgba(255,255,255,0.65),0_4px_12px_rgba(244,114,182,0.42)]" /> : null}
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(251,113,133,0.55))] text-white">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M7 18.4 4.6 20c-.4.3-1 .1-1-.4V6.4C3.6 5.1 4.7 4 6 4h12c1.3 0 2.4 1.1 2.4 2.4v7.2c0 1.3-1.1 2.4-2.4 2.4H8.8c-.2 0-.4 0-.6.2Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">Chat and Report</span>
                </button>
              </GlassSurface>
            </div>
          )
        ) : (
          <div
            ref={toolsCardRef}
            className="w-[min(320px,calc(100vw-2rem))]"
          >
            <GlassSurface {...floatingToolsGlassSurfaceProps} width="100%" height="auto" borderRadius={24} className="overflow-visible rounded-3xl shadow-2xl">
              <div className="w-full rounded-3xl bg-[rgba(255,255,255,0.62)] p-4 backdrop-blur-[2px]">
                <div className="mb-3 h-1.5 w-14 rounded-full bg-[linear-gradient(90deg,rgba(29,78,216,0.9),rgba(29,78,216,0.25))]" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-zinc-500">Version</div>
                    <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{versionLabel}</div>
                  </div>
                  <button
                    type="button"
                    className={classNames(floatingToolsCloseButtonClass, "text-[1.35rem] leading-none")}
                    onClick={() => persistMinimized(true)}
                    aria-label="Minimize"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div />
                  <button
                    type="button"
                    className={classNames(
                      "rounded-2xl px-3 py-2 text-sm font-semibold",
                      "bg-(--color-brand-blue) text-white transition-opacity duration-100 hover:opacity-95",
                    )}
                    onClick={() => setReportOpen(true)}
                  >
                    Report bug
                  </button>

                  <button
                    type="button"
                    className={classNames(
                      "relative rounded-2xl px-3 py-2 text-sm font-semibold",
                      "bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) text-white transition-opacity duration-100 hover:opacity-95",
                    )}
                    onClick={openChatPanel}
                  >
                    {pageSuggestion ? <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white/95 ring-2 ring-brand-pink" /> : null}
                    Chat
                  </button>
                </div>
              </div>
            </GlassSurface>
          </div>
        )}
      </div> : null}
    </>
  );
}
