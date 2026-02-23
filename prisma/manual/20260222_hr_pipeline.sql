-- Targeted, idempotent schema patch for HR pipeline (2026-02-22)
-- This is intended for environments where Prisma Migrate/Push is unreliable.

-- Fail fast on locks/hangs.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

-- Role enum: add HR.
DO $$
BEGIN
  BEGIN
    ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

-- Enums.
DO $$
BEGIN
  CREATE TYPE "HrCandidateStatus" AS ENUM ('APPLIED','SCREENING','INTERVIEWING','OFFERED','HIRED','REJECTED','WITHDRAWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HrScreeningDecision" AS ENUM ('PASS','FAIL','MAYBE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HrInterviewStatus" AS ENUM ('SCHEDULED','COMPLETED','NO_SHOW','CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HrHiringDecision" AS ENUM ('HIRE','NO_HIRE','HOLD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HrFollowUpChannel" AS ENUM ('EMAIL','SMS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HrFollowUpStatus" AS ENUM ('PENDING','SENDING','SENT','FAILED','CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tables.
CREATE TABLE IF NOT EXISTS "HrCandidate" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "status" "HrCandidateStatus" NOT NULL DEFAULT 'APPLIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE IF EXISTS "HrCandidate" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "HrCandidateScreening" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "decision" "HrScreeningDecision",
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateScreening_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HrCandidateInterview" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "HrInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
  "connectRoomId" TEXT,
  "meetingJoinUrl" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateInterview_pkey" PRIMARY KEY ("id")
);

ALTER TABLE IF EXISTS "HrCandidateInterview" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "HrCandidateEvaluation" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "interviewId" TEXT,
  "decision" "HrHiringDecision",
  "ratingOverall" INTEGER,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HrCandidateFollowUp" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "channel" "HrFollowUpChannel" NOT NULL,
  "toAddress" TEXT NOT NULL,
  "subject" TEXT,
  "bodyText" TEXT NOT NULL,
  "sendAt" TIMESTAMP(3) NOT NULL,
  "status" "HrFollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HrCandidateInvite" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "employeeInviteId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateInvite_pkey" PRIMARY KEY ("id")
);

-- Indexes.
CREATE INDEX IF NOT EXISTS "HrCandidate_status_createdAt_idx" ON "HrCandidate" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "HrCandidate_createdAt_idx" ON "HrCandidate" ("createdAt");

CREATE INDEX IF NOT EXISTS "HrCandidateScreening_candidateId_createdAt_idx" ON "HrCandidateScreening" ("candidateId", "createdAt");

CREATE INDEX IF NOT EXISTS "HrCandidateInterview_candidateId_scheduledAt_idx" ON "HrCandidateInterview" ("candidateId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "HrCandidateInterview_scheduledAt_idx" ON "HrCandidateInterview" ("scheduledAt");

CREATE INDEX IF NOT EXISTS "HrCandidateEvaluation_candidateId_createdAt_idx" ON "HrCandidateEvaluation" ("candidateId", "createdAt");
CREATE INDEX IF NOT EXISTS "HrCandidateEvaluation_interviewId_idx" ON "HrCandidateEvaluation" ("interviewId");

CREATE INDEX IF NOT EXISTS "HrCandidateFollowUp_status_sendAt_idx" ON "HrCandidateFollowUp" ("status", "sendAt");
CREATE INDEX IF NOT EXISTS "HrCandidateFollowUp_candidateId_sendAt_idx" ON "HrCandidateFollowUp" ("candidateId", "sendAt");

CREATE INDEX IF NOT EXISTS "HrCandidateInvite_candidateId_createdAt_idx" ON "HrCandidateInvite" ("candidateId", "createdAt");
CREATE INDEX IF NOT EXISTS "HrCandidateInvite_employeeInviteId_idx" ON "HrCandidateInvite" ("employeeInviteId");

-- FKs (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateScreening_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateScreening"
      ADD CONSTRAINT "HrCandidateScreening_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInterview_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateInterview"
      ADD CONSTRAINT "HrCandidateInterview_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateEvaluation_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateEvaluation"
      ADD CONSTRAINT "HrCandidateEvaluation_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateEvaluation_interviewId_fkey') THEN
    ALTER TABLE "HrCandidateEvaluation"
      ADD CONSTRAINT "HrCandidateEvaluation_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "HrCandidateInterview"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateFollowUp_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateFollowUp"
      ADD CONSTRAINT "HrCandidateFollowUp_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInvite_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateInvite"
      ADD CONSTRAINT "HrCandidateInvite_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInvite_employeeInviteId_fkey') THEN
    ALTER TABLE "HrCandidateInvite"
      ADD CONSTRAINT "HrCandidateInvite_employeeInviteId_fkey"
      FOREIGN KEY ("employeeInviteId") REFERENCES "EmployeeInvite"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateScreening_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateScreening"
      ADD CONSTRAINT "HrCandidateScreening_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInterview_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateInterview"
      ADD CONSTRAINT "HrCandidateInterview_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateEvaluation_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateEvaluation"
      ADD CONSTRAINT "HrCandidateEvaluation_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateFollowUp_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateFollowUp"
      ADD CONSTRAINT "HrCandidateFollowUp_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInvite_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateInvite"
      ADD CONSTRAINT "HrCandidateInvite_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
