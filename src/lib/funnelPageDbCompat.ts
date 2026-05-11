import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";

export async function dbHasCreditFunnelPageDraftHtmlColumn(): Promise<boolean> {
  return dbHasPublicColumn({
    tableNames: ["CreditFunnelPage", "creditfunnelpage"],
    columnName: "draftHtml",
  });
}

export function withDraftHtmlSelect<T extends Record<string, unknown>>(select: T, hasDraftHtml: boolean): T & { draftHtml?: true } {
  return (hasDraftHtml ? { ...select, draftHtml: true } : { ...select }) as T & { draftHtml?: true };
}

export function applyDraftHtmlWriteCompat<T extends Record<string, unknown>>(data: T, hasDraftHtml: boolean): T {
  if (hasDraftHtml) return data;

  const next = { ...data } as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(next, "draftHtml") && next.customHtml === undefined) {
    next.customHtml = next.draftHtml;
  }
  delete next.draftHtml;
  return next as T;
}

export function normalizeDraftHtml<T extends Record<string, unknown>>(page: T): T & { draftHtml: string } {
  return {
    ...page,
    draftHtml: typeof (page as { draftHtml?: unknown }).draftHtml === "string" ? String((page as { draftHtml?: string }).draftHtml || "") : "",
  };
}

export function normalizeDraftHtmlList<T extends Record<string, unknown>>(pages: T[]): Array<T & { draftHtml: string }> {
  return Array.isArray(pages) ? pages.map((page) => normalizeDraftHtml(page)) : [];
}

export async function dbHasCreditFunnelPageFoundationArtifactColumns(): Promise<boolean> {
  const [hasHash, hasJson] = await Promise.all([
    dbHasPublicColumn({
      tableNames: ["CreditFunnelPage", "creditfunnelpage"],
      columnName: "foundationArtifactHash",
    }),
    dbHasPublicColumn({
      tableNames: ["CreditFunnelPage", "creditfunnelpage"],
      columnName: "foundationArtifactJson",
    }),
  ]);

  return hasHash && hasJson;
}

export function withFoundationArtifactSelect<T extends Record<string, unknown>>(
  select: T,
  hasFoundationArtifact: boolean,
): T & { foundationArtifactHash?: true; foundationArtifactJson?: true } {
  return (
    hasFoundationArtifact
      ? { ...select, foundationArtifactHash: true, foundationArtifactJson: true }
      : { ...select }
  ) as T & { foundationArtifactHash?: true; foundationArtifactJson?: true };
}

export function applyFoundationArtifactWriteCompat<T extends Record<string, unknown>>(data: T, hasFoundationArtifact: boolean): T {
  if (hasFoundationArtifact) return data;

  const next = { ...data } as Record<string, unknown>;
  delete next.foundationArtifactHash;
  delete next.foundationArtifactJson;
  return next as T;
}