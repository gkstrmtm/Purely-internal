import { prisma } from "@/lib/db";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  checkedAt: number;
  exists: boolean;
};

const columnCache = new Map<string, CacheEntry>();

export async function hasPublicColumn(tableName: string, columnName: string): Promise<boolean> {
  const cacheKey = `${tableName}.${columnName}`.toLowerCase();
  const cached = columnCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.checkedAt < CACHE_TTL_MS) return cached.exists;

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      select exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and lower(table_name) = lower(${tableName})
          and lower(column_name) = lower(${columnName})
      ) as "exists";
    `;

    const exists = Boolean(rows?.[0]?.exists);
    columnCache.set(cacheKey, { checkedAt: now, exists });
    return exists;
  } catch {
    columnCache.set(cacheKey, { checkedAt: now, exists: false });
    return false;
  }
}
