import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function envFlagEnabled(value: string | undefined): boolean {
	const normalized = String(value || "").trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveDatasourceUrl() {
	if (process.env.NODE_ENV === "production") return undefined;
	const databaseUrl = String(process.env.DATABASE_URL || "").trim();
	const directUrl = String(process.env.DIRECT_URL || "").trim();
	const preferDirectUrl = envFlagEnabled(process.env.PRISMA_USE_DIRECT_URL);
	if (preferDirectUrl && directUrl) return directUrl;
	return databaseUrl || directUrl || undefined;
}

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		datasourceUrl: resolveDatasourceUrl(),
	});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
