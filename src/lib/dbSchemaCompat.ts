import { prisma } from "@/lib/db";

const columnExistenceCache = new Map<string, Promise<boolean>>();

function cacheKey(tableNames: string[], columnName: string) {
  return `${tableNames.join(",")}::${columnName}`;
}

export async function dbHasPublicColumn(opts: {
  tableNames: string[];
  columnName: string;
}): Promise<boolean> {
  const tableNames = Array.isArray(opts.tableNames) ? opts.tableNames.map((t) => String(t || "").trim()).filter(Boolean) : [];
  const columnName = String(opts.columnName || "").trim();
  if (!tableNames.length || !columnName) return false;

  const key = cacheKey(tableNames, columnName);
  const existing = columnExistenceCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    // Note: we intentionally query information_schema so this keeps working even
    // when Prisma's model/schema is ahead of the actual database schema.
    const inList = tableNames
      .map((t) => `'${t.replace(/'/g, "''")}'`)
      .join(", ");

    const sql = `
      select 1 as ok
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (${inList})
        and column_name = '${columnName.replace(/'/g, "''")}'
      limit 1;
    `;

    const rows = await prisma.$queryRawUnsafe<Array<{ ok: number }>>(sql).catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  })();

  columnExistenceCache.set(key, promise);
  return promise;
}

export function isMissingColumnError(err: unknown, columnName: string): boolean {
  const col = String(columnName || "").trim().toLowerCase();
  if (!col) return false;

  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = String(msg || "").toLowerCase();

  return m.includes("column") && m.includes("does not exist") && m.includes(col);
}

export async function dbHasUserClientPortalVariantColumn(): Promise<boolean> {
  return dbHasPublicColumn({
    // Defensive: some DBs may have unquoted lower-case names.
    tableNames: ["User", "user"],
    columnName: "clientPortalVariant",
  });
}
