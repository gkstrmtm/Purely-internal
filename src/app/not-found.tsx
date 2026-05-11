import Link from "next/link";

export const metadata = {
  title: "Page not found • Purely Automation",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Page not found.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Go home
          </Link>
          <Link
            href="/credit/app"
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Open portal
          </Link>
        </div>
      </div>
    </div>
  );
}
