import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
	prisma?: PrismaClient;
	prismaDatasourceUrl?: string;
};

function envFlagEnabled(value: string | undefined): boolean {
	const normalized = String(value || "").trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldPreferDirectUrlInDev(databaseUrl: string, directUrl: string): boolean {
	if (!directUrl) return false;
	if (!databaseUrl) return true;

	try {
		const parsed = new URL(databaseUrl);
		const connectionLimitRaw = parsed.searchParams.get("connection_limit");
		const connectionLimit = connectionLimitRaw ? Number(connectionLimitRaw) : Number.NaN;
		const looksPooled =
			parsed.searchParams.get("pgbouncer") === "true" || parsed.hostname.toLowerCase().includes("pooler.");
		if (looksPooled && Number.isFinite(connectionLimit) && connectionLimit <= 1) {
			return true;
		}
	} catch {
		return false;
	}

	return false;
}

function normalizeDevPooledDatabaseUrl(databaseUrl: string): string {
	const raw = String(databaseUrl || "").trim();
	if (!raw || process.env.NODE_ENV === "production") return raw;

	try {
		const parsed = new URL(raw);
		const hostname = parsed.hostname.toLowerCase();
		const looksPooled = parsed.searchParams.get("pgbouncer") === "true" || hostname.includes("pooler.");
		if (!looksPooled) return raw;

		const connectionLimitRaw = parsed.searchParams.get("connection_limit");
		const connectionLimit = connectionLimitRaw ? Number(connectionLimitRaw) : Number.NaN;
		if (Number.isFinite(connectionLimit) && connectionLimit > 1) return raw;

		parsed.searchParams.set("connection_limit", process.env.PRISMA_DEV_CONNECTION_LIMIT || "5");
		return parsed.toString();
	} catch {
		return raw;
	}
}

function resolveDatasourceUrl() {
	if (process.env.NODE_ENV === "production") return undefined;
	const databaseUrl = String(process.env.DATABASE_URL || "").trim();
	const directUrl = String(process.env.DIRECT_URL || "").trim();
	const preferDirectUrl = envFlagEnabled(process.env.PRISMA_USE_DIRECT_URL);
	if (preferDirectUrl && directUrl) return directUrl;
	return normalizeDevPooledDatabaseUrl(databaseUrl) || directUrl || undefined;
}

function createPrismaClient(datasourceUrl: string | undefined) {
	return new PrismaClient({
		datasourceUrl,
	});
}

const resolvedDatasourceUrl = resolveDatasourceUrl();
const cachedPrisma = globalForPrisma.prisma;
const cachedDatasourceUrl = globalForPrisma.prismaDatasourceUrl;

export const prisma =
	cachedPrisma && cachedDatasourceUrl === resolvedDatasourceUrl
		? cachedPrisma
		: createPrismaClient(resolvedDatasourceUrl);

if (process.env.NODE_ENV !== "production") {
	if (cachedPrisma && cachedPrisma !== prisma) {
		void cachedPrisma.$disconnect().catch(() => undefined);
	}
	globalForPrisma.prisma = prisma;
	globalForPrisma.prismaDatasourceUrl = resolvedDatasourceUrl;
}
