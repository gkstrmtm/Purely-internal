import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaDatasourceUrl?: string | null };

function resolvePrismaDatasourceUrl() {
	const raw = String(process.env.DATABASE_URL || "").trim();
	if (!raw) return undefined;
	if (process.env.NODE_ENV === "production") return undefined;

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return undefined;
	}

	const host = String(url.host || "").toLowerCase();
	const isSupabasePooler = host.includes("pooler.supabase.com") && url.searchParams.get("pgbouncer") === "true";
	if (!isSupabasePooler) return undefined;

	const requestedLimit = Number.parseInt(String(process.env.PRISMA_LOCAL_CONNECTION_LIMIT || ""), 10);
	const requestedPoolTimeout = Number.parseInt(String(process.env.PRISMA_LOCAL_POOL_TIMEOUT || ""), 10);
	const connectionLimit = Number.isFinite(requestedLimit) && requestedLimit > 1 ? requestedLimit : 5;
	const poolTimeout = Number.isFinite(requestedPoolTimeout) && requestedPoolTimeout > 0 ? requestedPoolTimeout : 30;

	const currentLimit = Number.parseInt(String(url.searchParams.get("connection_limit") || ""), 10);
	const currentPoolTimeout = Number.parseInt(String(url.searchParams.get("pool_timeout") || ""), 10);

	if (!Number.isFinite(currentLimit) || currentLimit < connectionLimit) {
		url.searchParams.set("connection_limit", String(connectionLimit));
	}

	if (!Number.isFinite(currentPoolTimeout) || currentPoolTimeout < poolTimeout) {
		url.searchParams.set("pool_timeout", String(poolTimeout));
	}

	return url.toString();
}

const prismaDatasourceUrl = resolvePrismaDatasourceUrl();

if (globalForPrisma.prisma && globalForPrisma.prismaDatasourceUrl !== (prismaDatasourceUrl ?? null)) {
	void globalForPrisma.prisma.$disconnect().catch(() => {});
	globalForPrisma.prisma = undefined;
}

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient(prismaDatasourceUrl ? { datasources: { db: { url: prismaDatasourceUrl } } } : undefined);

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
	globalForPrisma.prismaDatasourceUrl = prismaDatasourceUrl ?? null;
}
