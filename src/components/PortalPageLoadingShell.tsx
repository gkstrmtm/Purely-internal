type PortalPageLoadingShellProps = {
  embedded?: boolean;
  fullBleed?: boolean;
  sections?: 1 | 2;
  showHeader?: boolean;
  minHeightClassName?: string;
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
}: PortalPageLoadingShellProps) {
  return (
    <div
      className={classNames(
        fullBleed ? "w-full" : embedded ? "w-full" : "mx-auto w-full max-w-6xl px-4 sm:px-6",
        minHeightClassName,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={classNames(
          "animate-pulse rounded-3xl border border-zinc-200/90 bg-zinc-50/95 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)]",
          fullBleed ? "h-full min-h-[calc(100dvh-10rem)] bg-white" : "",
        )}
      >
        <div className="mb-4 text-sm font-semibold text-zinc-500">Loading…</div>
        {showHeader ? (
          <div className="flex items-center justify-between gap-4">
            <div className="h-7 w-40 rounded-2xl bg-zinc-200" />
            <div className="h-10 w-28 rounded-2xl bg-zinc-200" />
          </div>
        ) : null}

        <div className={classNames(showHeader ? "mt-6" : "mt-0", sections === 2 ? "grid grid-cols-1 gap-6 xl:grid-cols-2" : "space-y-4")}>
          <div className="space-y-4">
            <div className="h-12 w-48 rounded-2xl bg-zinc-200" />
            <div className="h-28 rounded-3xl bg-zinc-200" />
            <div className="h-40 rounded-3xl bg-zinc-200" />
          </div>

          {sections === 2 ? (
            <div className="space-y-4">
              <div className="h-12 w-40 rounded-2xl bg-zinc-200" />
              <div className="h-20 rounded-3xl bg-zinc-200" />
              <div className="h-52 rounded-3xl bg-zinc-200" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
