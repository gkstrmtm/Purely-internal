import { prisma } from "@/lib/db";

export const LEAD_SCRAPE_RUN_CANCEL_REQUESTED = "__lead_scrape_run_cancel_requested__";
export const LEAD_SCRAPE_RUN_CANCELED_MESSAGE = "Run canceled.";

export class LeadScrapeRunCanceledError extends Error {
  constructor(message = LEAD_SCRAPE_RUN_CANCELED_MESSAGE) {
    super(message);
    this.name = "LeadScrapeRunCanceledError";
  }
}

export function normalizeLeadScrapeRunId(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = text.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return normalized || null;
}

export async function requestLeadScrapeRunCancellation(ownerId: string, runId: string): Promise<boolean> {
  const normalizedRunId = normalizeLeadScrapeRunId(runId);
  if (!normalizedRunId) return false;

  const updated = await prisma.portalLeadScrapeRun.updateMany({
    where: { id: normalizedRunId, ownerId },
    data: { error: LEAD_SCRAPE_RUN_CANCEL_REQUESTED },
  });

  return updated.count > 0;
}

export async function isLeadScrapeRunCancellationRequested(runId: string): Promise<boolean> {
  const normalizedRunId = normalizeLeadScrapeRunId(runId);
  if (!normalizedRunId) return false;

  const row = await prisma.portalLeadScrapeRun.findUnique({
    where: { id: normalizedRunId },
    select: { error: true },
  }).catch(() => null);

  return row?.error === LEAD_SCRAPE_RUN_CANCEL_REQUESTED;
}

export async function throwIfLeadScrapeRunCanceled(runId: string | null | undefined): Promise<void> {
  const normalizedRunId = normalizeLeadScrapeRunId(runId);
  if (!normalizedRunId) return;
  if (await isLeadScrapeRunCancellationRequested(normalizedRunId)) {
    throw new LeadScrapeRunCanceledError();
  }
}

export function finalizeLeadScrapeRunError(error: string | null): string | null {
  return error === LEAD_SCRAPE_RUN_CANCEL_REQUESTED ? LEAD_SCRAPE_RUN_CANCELED_MESSAGE : error;
}
