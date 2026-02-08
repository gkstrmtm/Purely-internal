import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { newPublicToken } from "@/lib/portalMedia";

import { PublicMediaFolderClient } from "./PublicMediaFolderClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function looksLikeNullToken(token: string) {
  const t = String(token || "").trim().toLowerCase();
  return t === "null" || t === "undefined";
}

export default async function PublicMediaFolderPage(props: {
  params: Promise<{ folderId: string; token: string }>;
}) {
  const { folderId, token } = await props.params;

  // Backward-compat: older links were sometimes generated with a literal "null" token
  // when a folder row didn't yet have a publicToken.
  if (looksLikeNullToken(token)) {
    const folder = await (prisma as any).portalMediaFolder.findFirst({
      where: { id: String(folderId) },
      select: { id: true, publicToken: true },
    });

    if (folder) {
      const existing = typeof folder.publicToken === "string" ? folder.publicToken.trim() : "";
      const nextToken = existing || newPublicToken();

      if (!existing) {
        try {
          await (prisma as any).portalMediaFolder.update({
            where: { id: folder.id },
            data: { publicToken: nextToken },
            select: { id: true },
          });
        } catch {
          // ignore
        }
      }

      redirect(`/media/f/${encodeURIComponent(folderId)}/${encodeURIComponent(nextToken)}`);
    }
  }

  return <PublicMediaFolderClient folderId={String(folderId)} token={String(token)} />;
}
