import { prisma } from "@/lib/db";

const CACHE_TTL_MS = 10 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 1000;

type CacheEntry = {
  checkedAt: number;
  exists: boolean;
};

const columnCache = new Map<string, CacheEntry>();

const tableCache = new Map<string, CacheEntry>();

export async function hasPublicTable(tableName: string): Promise<boolean> {
  const cacheKey = String(tableName || "").toLowerCase();
  const cached = tableCache.get(cacheKey);
  const now = Date.now();

  if (cached) {
    const ttl = cached.exists ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
    if (now - cached.checkedAt < ttl) return cached.exists;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      select exists(
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and lower(table_name) = lower(${tableName})
      ) as "exists";
    `;

    const exists = Boolean(rows?.[0]?.exists);
    tableCache.set(cacheKey, { checkedAt: now, exists });
    return exists;
  } catch {
    // Fallback: pg_catalog
    try {
      const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        select exists(
          select 1
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind in ('r','p','v','m','f')
            and lower(c.relname) = lower(${tableName})
        ) as "exists";
      `;

      const exists = Boolean(rows?.[0]?.exists);
      tableCache.set(cacheKey, { checkedAt: now, exists });
      return exists;
    } catch {
      tableCache.set(cacheKey, { checkedAt: now, exists: false });
      return false;
    }
  }
}

export function invalidatePublicTableCache(tableName: string) {
  const cacheKey = String(tableName || "").toLowerCase();
  tableCache.delete(cacheKey);
}

export async function hasPublicColumn(tableName: string, columnName: string): Promise<boolean> {
  const cacheKey = `${tableName}.${columnName}`.toLowerCase();
  const cached = columnCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.checkedAt < CACHE_TTL_MS) return cached.exists;

  // Primary check: information_schema.
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
    // Fallback check: pg_catalog (more reliable on some hosted Postgres setups).
    try {
      const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        select exists(
          select 1
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and lower(c.relname) = lower(${tableName})
            and lower(a.attname) = lower(${columnName})
            and a.attnum > 0
            and not a.attisdropped
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
}
