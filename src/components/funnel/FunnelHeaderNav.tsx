"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type FunnelHeaderNavItem = {
  id: string;
  label: string;
  kind: "url" | "page" | "anchor";
  url?: string;
  pageSlug?: string;
  anchorId?: string;
  newTab?: boolean;
};

export type FunnelHeaderSize = "sm" | "md" | "lg";
export type FunnelHeaderMobileTrigger = "hamburger" | "directory";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizePathBase(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  const noTrailing = s.endsWith("/") ? s.slice(0, -1) : s;
  return noTrailing || "";
}

function normalizeAnchorId(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  return s.startsWith("#") ? s.slice(1) : s;
}

function buildHref(args: {
  item: FunnelHeaderNavItem;
  funnelPathBase?: string;
}): string {
  const { item } = args;
  if (item.kind === "anchor") {
    const a = normalizeAnchorId(item.anchorId || "");
    return a ? `#${a}` : "#";
  }
  if (item.kind === "url") {
    return String(item.url || "").trim() || "#";
  }

  const targetSlug = String(item.pageSlug || "").trim();
  const base = normalizePathBase(args.funnelPathBase || "");
  if (!base) return targetSlug ? `/${encodeURIComponent(targetSlug)}` : "/";
  return targetSlug ? `${base}/${encodeURIComponent(targetSlug)}` : base;
}

export function FunnelHeaderNav({
  logoUrl,
  logoAlt,
  logoHref,
  items,
  sticky,
  transparent,
  mobileMode,
  size,
  mobileTrigger,
  mobileTriggerLabel,
  forceTriggerOnDesktop,
  className,
  style,
  funnelPathBase,
  disabled,
}: {
  logoUrl?: string;
  logoAlt?: string;
  logoHref?: string;
  items: FunnelHeaderNavItem[];
  sticky?: boolean;
  transparent?: boolean;
  mobileMode?: "dropdown" | "slideover";
  size?: FunnelHeaderSize;
  mobileTrigger?: FunnelHeaderMobileTrigger;
  mobileTriggerLabel?: string;
  forceTriggerOnDesktop?: boolean;
  className?: string;
  style?: CSSProperties;
  funnelPathBase?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const scrollToAnchor = useCallback((rawAnchorId: string) => {
    const id = normalizeAnchorId(rawAnchorId);
    if (!id) return false;

    try {
      const el = document.getElementById(id);
      if (!el) return false;

      el.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        window.history.pushState(null, "", `#${id}`);
      } catch {
        // ignore
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const normalizedItems = useMemo(() => {
    const out = (Array.isArray(items) ? items : []).filter(Boolean);
    return out.slice(0, 20);
  }, [items]);

  const resolvedLogoHref = useMemo(() => {
    const raw = String(logoHref || "").trim();
    if (raw) return raw;
    const base = normalizePathBase(funnelPathBase || "");
    return base || "/";
  }, [funnelPathBase, logoHref]);

  const onNavClick = useCallback(
    (e: React.MouseEvent) => {
      if (!disabled) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [disabled],
  );

  const mode: "dropdown" | "slideover" = mobileMode === "slideover" ? "slideover" : "dropdown";
  const headerSize: FunnelHeaderSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
  const trigger: FunnelHeaderMobileTrigger = mobileTrigger === "directory" ? "directory" : "hamburger";
  const triggerLabel = (mobileTriggerLabel || "Directory").trim() || "Directory";
  const forceTrigger = forceTriggerOnDesktop === true;

  const paddingYClass = headerSize === "lg" ? "py-4" : headerSize === "sm" ? "py-2" : "py-3";
  const logoClass = headerSize === "lg" ? "h-10" : headerSize === "sm" ? "h-7" : "h-8";
  const iconBtnClass = headerSize === "lg" ? "h-11 w-11" : headerSize === "sm" ? "h-9 w-9" : "h-10 w-10";

  return (
    <header
      className={classNames(
        sticky ? "sticky top-0 z-40" : "relative",
        "w-full",
        transparent ? "bg-transparent" : "bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/70",
        transparent ? "border-b border-transparent" : "border-b border-zinc-200",
        className,
      )}
      style={style}
    >
      <div className={classNames("mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4", paddingYClass)}>
        <a
          href={resolvedLogoHref}
          onClick={(e) => {
            if (disabled) return onNavClick(e);
            if (mode === "dropdown") setOpen(false);
          }}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-900"
          data-funnel-editor-interactive="true"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={logoAlt || "Logo"} className={classNames(logoClass, "w-auto")} />
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700">Logo</div>
          )}
        </a>

        {/* Desktop nav */}
        <nav className={classNames(forceTrigger ? "hidden" : "hidden sm:flex", "items-center gap-4")} aria-label="Primary">
          {normalizedItems.map((it) => {
            const href = buildHref({ item: it, funnelPathBase });
            const label = (it.label || "Link").trim() || "Link";
            const newTab = it.newTab === true && it.kind === "url";
            return (
              <a
                key={it.id}
                href={href}
                onClick={(e) => {
                  if (disabled) return onNavClick(e);
                  if (it.kind === "anchor") {
                    e.preventDefault();
                    setOpen(false);
                    const ok = scrollToAnchor(String(it.anchorId || ""));
                    if (!ok) {
                      try {
                        window.location.hash = normalizeAnchorId(String(it.anchorId || ""));
                      } catch {
                        // ignore
                      }
                    }
                    return;
                  }
                  setOpen(false);
                }}
                target={newTab ? "_blank" : undefined}
                rel={newTab ? "noopener noreferrer" : undefined}
                className="text-sm font-semibold text-zinc-700 hover:text-zinc-900"
                data-funnel-editor-interactive="true"
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Mobile toggle */}
        {trigger === "directory" ? (
          <button
            type="button"
            data-funnel-editor-interactive="true"
            className={classNames(
              "inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
              forceTrigger ? "" : "sm:hidden",
              disabled ? "opacity-60" : "",
            )}
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => {
              if (disabled) return;
              setOpen((v) => !v);
            }}
          >
            <span>{triggerLabel}</span>
            <span className="text-base">▾</span>
          </button>
        ) : (
          <button
            type="button"
            data-funnel-editor-interactive="true"
            className={classNames(
              "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
              forceTrigger ? "" : "sm:hidden",
              iconBtnClass,
            )}
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => {
              if (disabled) return;
              setOpen((v) => !v);
            }}
          >
            <span className="text-lg font-bold">≡</span>
          </button>
        )}
      </div>

      {/* Mobile menu */}
      {mode === "dropdown" ? (
        <div className={classNames(forceTrigger ? "" : "sm:hidden", open ? "block" : "hidden")}>
          <div className="space-y-1 border-t border-zinc-200 bg-white px-4 py-3">
            {normalizedItems.map((it) => {
              const href = buildHref({ item: it, funnelPathBase });
              const label = (it.label || "Link").trim() || "Link";
              const newTab = it.newTab === true && it.kind === "url";
              return (
                <a
                  key={it.id}
                  href={href}
                  onClick={(e) => {
                    if (disabled) return onNavClick(e);
                    if (it.kind === "anchor") {
                      e.preventDefault();
                      setOpen(false);
                      const ok = scrollToAnchor(String(it.anchorId || ""));
                      if (!ok) {
                        try {
                          window.location.hash = normalizeAnchorId(String(it.anchorId || ""));
                        } catch {
                          // ignore
                        }
                      }
                      return;
                    }
                    setOpen(false);
                  }}
                  target={newTab ? "_blank" : undefined}
                  rel={newTab ? "noopener noreferrer" : undefined}
                  className="block rounded-xl px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  data-funnel-editor-interactive="true"
                >
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={classNames(forceTrigger ? "" : "sm:hidden", open ? "block" : "hidden")}>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => {
              if (disabled) return;
              setOpen(false);
            }}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[min(85vw,340px)] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold text-zinc-900">Menu</div>
              <button
                type="button"
                data-funnel-editor-interactive="true"
                className="h-10 w-10 rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                onClick={() => {
                  if (disabled) return;
                  setOpen(false);
                }}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <div className="space-y-1 px-4 py-3">
              {normalizedItems.map((it) => {
                const href = buildHref({ item: it, funnelPathBase });
                const label = (it.label || "Link").trim() || "Link";
                const newTab = it.newTab === true && it.kind === "url";
                return (
                  <a
                    key={it.id}
                    href={href}
                    onClick={(e) => {
                      if (disabled) return onNavClick(e);
                      if (it.kind === "anchor") {
                        e.preventDefault();
                        setOpen(false);
                        const ok = scrollToAnchor(String(it.anchorId || ""));
                        if (!ok) {
                          try {
                            window.location.hash = normalizeAnchorId(String(it.anchorId || ""));
                          } catch {
                            // ignore
                          }
                        }
                        return;
                      }
                      setOpen(false);
                    }}
                    target={newTab ? "_blank" : undefined}
                    rel={newTab ? "noopener noreferrer" : undefined}
                    className="block rounded-xl px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    data-funnel-editor-interactive="true"
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
