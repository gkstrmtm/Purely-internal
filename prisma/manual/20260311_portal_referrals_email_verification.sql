-- Idempotent patch: portal referrals + email verification

-- User columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "portalReferralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "portalReferralCodeCreatedAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "portalReferralCodeCreatedIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationEmailSentAt" TIMESTAMPTZ;

-- Unique referral code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'User_portalReferralCode_key'
  ) THEN
    CREATE UNIQUE INDEX "User_portalReferralCode_key" ON "User"("portalReferralCode") WHERE "portalReferralCode" IS NOT NULL;
  END IF;
END $$;

-- PortalReferral table
CREATE TABLE IF NOT EXISTS "PortalReferral" (
  "id" TEXT PRIMARY KEY,
  "inviterId" TEXT NOT NULL,
  "invitedUserId" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "invitedIp" TEXT,
  "invitedVerifiedAt" TIMESTAMPTZ,
  "creditsAwardedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PortalReferral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PortalReferral_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PortalReferral_invitedUserId_key'
  ) THEN
    CREATE UNIQUE INDEX "PortalReferral_invitedUserId_key" ON "PortalReferral"("invitedUserId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PortalReferral_inviterId_createdAt_idx'
  ) THEN
    CREATE INDEX "PortalReferral_inviterId_createdAt_idx" ON "PortalReferral"("inviterId", "createdAt");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PortalReferral_invitedEmail_idx'
  ) THEN
    CREATE INDEX "PortalReferral_invitedEmail_idx" ON "PortalReferral"("invitedEmail");
  END IF;
END $$;

-- PortalEmailVerificationToken table
CREATE TABLE IF NOT EXISTS "PortalEmailVerificationToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PortalEmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PortalEmailVerificationToken_tokenHash_key'
  ) THEN
    CREATE UNIQUE INDEX "PortalEmailVerificationToken_tokenHash_key" ON "PortalEmailVerificationToken"("tokenHash");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PortalEmailVerificationToken_userId_createdAt_idx'
  ) THEN
    CREATE INDEX "PortalEmailVerificationToken_userId_createdAt_idx" ON "PortalEmailVerificationToken"("userId", "createdAt");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'PortalEmailVerificationToken_expiresAt_idx'
  ) THEN
    CREATE INDEX "PortalEmailVerificationToken_expiresAt_idx" ON "PortalEmailVerificationToken"("expiresAt");
  END IF;
END $$;
