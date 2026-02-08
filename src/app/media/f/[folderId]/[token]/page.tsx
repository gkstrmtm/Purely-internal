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

function mediaItemUrls(row: { id: string; publicToken: string }) {
  const downloadUrl = `/api/public/media/item/${row.id}/${row.publicToken}`;
  const shareUrl = `/media/i/${row.id}/${row.publicToken}`;
  return { downloadUrl, shareUrl };
}

function folderShareUrl(row: { id: string; publicToken: string }) {
  return `/media/f/${row.id}/${row.publicToken}`;
}

export default async function PublicMediaFolderPage({
  params,
}: {
  params: Promise<{ folderId: string; token: string }>;
}) {
  const { folderId, token } = await params;

  const folder = await (prisma as any).portalMediaFolder.findFirst({
    where: { id: String(folderId), publicToken: String(token) },
    select: { id: true, ownerId: true, name: true, tag: true, publicToken: true },
  });

  if (!folder) return notFound();

  const [folders, items] = await Promise.all([
    (prisma as any).portalMediaFolder.findMany({
      where: { ownerId: folder.ownerId, parentId: folder.id },
      orderBy: [{ nameKey: "asc" }],
      select: { id: true, name: true, tag: true, publicToken: true },
    }),
    (prisma as any).portalMediaItem.findMany({
      where: { ownerId: folder.ownerId, folderId: folder.id },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, fileName: true, mimeType: true, fileSize: true, tag: true, publicToken: true },
      take: 500,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-xs font-semibold text-zinc-500">Shared folder</div>
        <h1 className="mt-2 text-2xl font-bold text-brand-ink">{folder.name}</h1>
        <div className="mt-2 font-mono text-xs text-zinc-500">tag: {folder.tag}</div>

        {folders.length ? (
          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-900">Folders</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {folders.map((f: any) => (
                <Link
                  key={f.id}
                  href={folderShareUrl(f)}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
                >
                  <div className="text-sm font-semibold text-zinc-900">{f.name}</div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">tag: {f.tag}</div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <div className="text-sm font-semibold text-zinc-900">Files</div>
          {items.length ? (
            <div className="mt-3 space-y-2">
              {items.map((it: any) => (
                <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{it.fileName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span className="font-mono">tag: {it.tag}</span>
                      <span>•</span>
                      <span>{it.mimeType}</span>
                      <span>•</span>
                      <span>{formatBytes(it.fileSize)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={mediaItemUrls(it).shareUrl}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Preview
                    </Link>
                    <a
                      href={mediaItemUrls(it).downloadUrl}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
              No files in this folder.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
