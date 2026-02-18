import { prisma } from "@/lib/db";

type DbLike = {
	$executeRawUnsafe: (sql: string) => Promise<unknown>;
};

export async function ensureConnectSchema(db: DbLike = prisma) {
	// Drift-hardening: create tables/indexes/constraints if missing.
	// Keep SQL Postgres-safe and idempotent.
	const statements: string[] = [
		`CREATE TABLE IF NOT EXISTS "ConnectRoom" (
			"id" TEXT PRIMARY KEY,
			"title" TEXT,
			"createdByUserId" TEXT,
			"hostParticipantId" TEXT,
			"waitingRoomEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
			"locked" BOOLEAN NOT NULL DEFAULT FALSE,
			"muteOnJoin" BOOLEAN NOT NULL DEFAULT FALSE,
			"cameraOffOnJoin" BOOLEAN NOT NULL DEFAULT FALSE,
			"allowScreenShare" BOOLEAN NOT NULL DEFAULT TRUE,
			"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"endedAt" TIMESTAMP(3)
		);`,

		`CREATE TABLE IF NOT EXISTS "ConnectParticipant" (
			"id" TEXT PRIMARY KEY,
			"roomId" TEXT NOT NULL,
			"userId" TEXT,
			"displayName" TEXT NOT NULL,
			"isGuest" BOOLEAN NOT NULL DEFAULT TRUE,
			"secret" TEXT NOT NULL,
			"status" TEXT NOT NULL DEFAULT 'approved',
			"admittedAt" TIMESTAMP(3),
			"deniedAt" TIMESTAMP(3),
			"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"leftAt" TIMESTAMP(3)
		);`,

		`CREATE TABLE IF NOT EXISTS "ConnectSignal" (
			"id" TEXT PRIMARY KEY,
			"roomId" TEXT NOT NULL,
			"fromParticipantId" TEXT NOT NULL,
			"toParticipantId" TEXT,
			"kind" TEXT NOT NULL,
			"payload" JSONB NOT NULL,
			"seq" SERIAL NOT NULL,
			"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,

		`CREATE UNIQUE INDEX IF NOT EXISTS "ConnectSignal_seq_key" ON "ConnectSignal"("seq");`,
		`CREATE INDEX IF NOT EXISTS "ConnectRoom_createdByUserId_createdAt_idx" ON "ConnectRoom"("createdByUserId","createdAt");`,
		`CREATE INDEX IF NOT EXISTS "ConnectRoom_createdAt_idx" ON "ConnectRoom"("createdAt");`,
		`CREATE INDEX IF NOT EXISTS "ConnectRoom_hostParticipantId_idx" ON "ConnectRoom"("hostParticipantId");`,
		`CREATE INDEX IF NOT EXISTS "ConnectParticipant_roomId_createdAt_idx" ON "ConnectParticipant"("roomId","createdAt");`,
		`CREATE INDEX IF NOT EXISTS "ConnectParticipant_roomId_leftAt_idx" ON "ConnectParticipant"("roomId","leftAt");`,
		`CREATE INDEX IF NOT EXISTS "ConnectParticipant_roomId_status_idx" ON "ConnectParticipant"("roomId","status");`,
		`CREATE INDEX IF NOT EXISTS "ConnectParticipant_userId_createdAt_idx" ON "ConnectParticipant"("userId","createdAt");`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "ConnectParticipant_id_secret_key" ON "ConnectParticipant"("id","secret");`,
		`CREATE INDEX IF NOT EXISTS "ConnectSignal_roomId_seq_idx" ON "ConnectSignal"("roomId","seq");`,
		`CREATE INDEX IF NOT EXISTS "ConnectSignal_roomId_createdAt_idx" ON "ConnectSignal"("roomId","createdAt");`,
		`CREATE INDEX IF NOT EXISTS "ConnectSignal_toParticipantId_seq_idx" ON "ConnectSignal"("toParticipantId","seq");`,

		// Drift-hardening: older deployments may have created the base tables already.
		`ALTER TABLE "ConnectRoom" ADD COLUMN IF NOT EXISTS "hostParticipantId" TEXT;`,
		`ALTER TABLE "ConnectRoom" ADD COLUMN IF NOT EXISTS "waitingRoomEnabled" BOOLEAN NOT NULL DEFAULT FALSE;`,
		`ALTER TABLE "ConnectRoom" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT FALSE;`,
		`ALTER TABLE "ConnectRoom" ADD COLUMN IF NOT EXISTS "muteOnJoin" BOOLEAN NOT NULL DEFAULT FALSE;`,
		`ALTER TABLE "ConnectRoom" ADD COLUMN IF NOT EXISTS "cameraOffOnJoin" BOOLEAN NOT NULL DEFAULT FALSE;`,
		`ALTER TABLE "ConnectRoom" ADD COLUMN IF NOT EXISTS "allowScreenShare" BOOLEAN NOT NULL DEFAULT TRUE;`,

		`ALTER TABLE "ConnectParticipant" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'approved';`,
		`ALTER TABLE "ConnectParticipant" ADD COLUMN IF NOT EXISTS "admittedAt" TIMESTAMP(3);`,
		`ALTER TABLE "ConnectParticipant" ADD COLUMN IF NOT EXISTS "deniedAt" TIMESTAMP(3);`,

		`DO $$ BEGIN
			ALTER TABLE "ConnectRoom" ADD CONSTRAINT "ConnectRoom_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

		`DO $$ BEGIN
			ALTER TABLE "ConnectParticipant" ADD CONSTRAINT "ConnectParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ConnectRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

		`DO $$ BEGIN
			ALTER TABLE "ConnectParticipant" ADD CONSTRAINT "ConnectParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

		`DO $$ BEGIN
			ALTER TABLE "ConnectSignal" ADD CONSTRAINT "ConnectSignal_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ConnectRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

		`DO $$ BEGIN
			ALTER TABLE "ConnectSignal" ADD CONSTRAINT "ConnectSignal_fromParticipantId_fkey" FOREIGN KEY ("fromParticipantId") REFERENCES "ConnectParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

		`DO $$ BEGIN
			ALTER TABLE "ConnectSignal" ADD CONSTRAINT "ConnectSignal_toParticipantId_fkey" FOREIGN KEY ("toParticipantId") REFERENCES "ConnectParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
	];

	for (const sql of statements) {
		await db.$executeRawUnsafe(sql);
	}
}
