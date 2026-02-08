import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let idx = 0;
  let v = n;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  return `${v.toFixed(v >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export default async function PublicMediaItemPage({
  params,
}: {
  params: Promise<{ itemId: string; token: string }>;
}) {
  const { itemId, token } = await params;

  const row = await (prisma as any).portalMediaItem.findFirst({
    where: { id: String(itemId), publicToken: String(token) },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, tag: true, publicToken: true, folderId: true },
  });

  if (!row) return notFound();

  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const isImg = String(row.mimeType || "").startsWith("image/");

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-xs font-semibold text-zinc-500">Shared file</div>
        <h1 className="mt-2 break-words text-2xl font-bold text-brand-ink">{row.fileName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="font-mono">tag: {row.tag}</span>
          <span>•</span>
          <span>{row.mimeType}</span>
          <span>•</span>
          <span>{formatBytes(row.fileSize)}</span>
        </div>

        {isImg ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <img src={downloadUrl} alt={row.fileName} className="w-full object-cover" />
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
            Preview not available for this file type.
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            Download
          </a>
          <Link
            href="/portal"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Open portal
          </Link>
        </div>
      </div>
    </div>
  );
}
