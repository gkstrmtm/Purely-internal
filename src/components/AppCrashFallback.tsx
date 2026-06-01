"use client";

import { useEffect } from "react";

type AppCrashFallbackProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  scope?: "route" | "global";
};

export function AppCrashFallback({ error, reset, scope = "route" }: AppCrashFallbackProps) {
  useEffect(() => {
    console.error(scope === "global" ? "[global-error]" : "[route-error]", error);
  }, [error, scope]);

  const isGlobal = scope === "global";
  const summary = isGlobal
    ? "The app hit an unexpected error before it could finish rendering."
    : "This page hit an unexpected error while rendering.";
  const detail = process.env.NODE_ENV === "development"
    ? error.message || summary
    : "The safest next step is to retry once or reload the page.";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
        <p className="text-xs font-medium text-zinc-400">Temporary failure</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">This view crashed.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{summary}</p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{detail}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {isGlobal ? "Reload app" : "Reload page"}
          </button>
        </div>

        {error.digest ? <p className="mt-4 text-xs text-zinc-500">Reference: {error.digest}</p> : null}

        {process.env.NODE_ENV === "development" && error.stack ? (
          <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-zinc-300">
            {error.stack}
          </pre>
        ) : null}
      </div>
    </div>
  );
}