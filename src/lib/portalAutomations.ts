import { prisma } from "@/lib/db";

const SERVICE_SLUG = "automations";

export async function findOwnerByPortalAutomationsWebhookToken(tokenRaw: string): Promise<string | null> {
  const token = String(tokenRaw || "").trim();
  if (token.length < 12) return null;

  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
  });

  for (const row of rows) {
    const t = typeof (row as any)?.dataJson?.webhookToken === "string" ? String((row as any).dataJson.webhookToken).trim() : "";
    if (t && t === token) return row.ownerId;
  }

  return null;
}
