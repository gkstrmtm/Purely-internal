type PortalPageLoadingShellProps = {
  embedded?: boolean;
  fullBleed?: boolean;
  sections?: 1 | 2;
  showHeader?: boolean;
  minHeightClassName?: string;
  className?: string;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalPageLoadingShell({
  embedded = false,
  fullBleed = false,
  sections = 1,
  showHeader = true,
  minHeightClassName,
  className,
}: PortalPageLoadingShellProps) {
  const blockClassName =
    "animate-pulse rounded-[1.4rem] border border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.8))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";

  return (
    <div
      className={classNames(
        fullBleed ? "w-full" : embedded ? "w-full" : "mx-auto w-full max-w-6xl px-4 sm:px-6",
        minHeightClassName,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={classNames(
          "overflow-hidden rounded-[1.9rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.84))] p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] supports-backdrop-filter:bg-[rgba(255,255,255,0.58)] supports-backdrop-filter:backdrop-blur-2xl sm:p-5",
          fullBleed ? "h-full min-h-[calc(100dvh-10rem)]" : "",
        )}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/78 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[rgba(59,130,246,0.75)]" />
          Loading
        </div>
        {showHeader ? (
          <div className="flex items-center justify-between gap-4">
            <div className={classNames("h-7 w-40 rounded-2xl", blockClassName)} />
            <div className={classNames("h-10 w-28 rounded-2xl", blockClassName)} />
          </div>
        ) : null}

        <div className={classNames(showHeader ? "mt-6" : "mt-0", sections === 2 ? "grid grid-cols-1 gap-6 xl:grid-cols-2" : "space-y-4")}>
          <div className="space-y-4">
            <div className={classNames("h-12 w-48 rounded-2xl", blockClassName)} />
            <div className={classNames("h-28 rounded-3xl", blockClassName)} />
            <div className={classNames("h-40 rounded-3xl", blockClassName)} />
          </div>

          {sections === 2 ? (
            <div className="space-y-4">
              <div className={classNames("h-12 w-40 rounded-2xl", blockClassName)} />
              <div className={classNames("h-20 rounded-3xl", blockClassName)} />
              <div className={classNames("h-52 rounded-3xl", blockClassName)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
