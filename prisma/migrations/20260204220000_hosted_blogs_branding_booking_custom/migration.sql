-- Hosted client blogs + branding + booking customization

-- NOTE: Some environments historically had BusinessProfile created manually (outside Prisma).
-- Prisma uses a shadow database that replays migrations from scratch; ensure the table exists
-- so this migration is replayable in clean databases.
CREATE TABLE IF NOT EXISTS "BusinessProfile" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"ownerId" TEXT NOT NULL,
	"businessName" TEXT NOT NULL,
	"websiteUrl" TEXT,
	"industry" TEXT,
	"businessModel" TEXT,
	"primaryGoals" JSONB,
	"targetCustomer" TEXT,
	"brandVoice" TEXT,
	"logoUrl" TEXT,
	"brandPrimaryHex" TEXT,
	"brandAccentHex" TEXT,
	"brandTextHex" TEXT,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "BusinessProfile_ownerId_key" UNIQUE ("ownerId"),
	CONSTRAINT "BusinessProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- BusinessProfile branding fields
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "brandPrimaryHex" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "brandAccentHex" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "brandTextHex" TEXT;

-- NOTE: Some environments historically had ClientBlogSite/ClientBlogPost created outside Prisma.
-- Prisma uses a shadow database that replays migrations from scratch; ensure these tables exist
-- so later migrations (blog generation events, newsletters) can add FKs safely.
CREATE TABLE IF NOT EXISTS "ClientBlogSite" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"ownerId" TEXT NOT NULL,
	"name" TEXT NOT NULL,
	"slug" TEXT,
	"primaryDomain" TEXT,
	"verificationToken" TEXT NOT NULL,
	"verifiedAt" TIMESTAMP(3),
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "ClientBlogSite_ownerId_key" UNIQUE ("ownerId"),
	CONSTRAINT "ClientBlogSite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ClientBlogPost" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"siteId" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'DRAFT',
	"slug" TEXT NOT NULL,
	"title" TEXT NOT NULL,
	"excerpt" TEXT NOT NULL,
	"content" TEXT NOT NULL,
	"seoKeywords" JSONB,
	"publishedAt" TIMESTAMP(3),
	"archivedAt" TIMESTAMP(3),
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "ClientBlogPost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientBlogSite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientBlogSite_slug_key" ON "ClientBlogSite"("slug");
CREATE INDEX IF NOT EXISTS "ClientBlogSite_ownerId_idx" ON "ClientBlogSite"("ownerId");
CREATE INDEX IF NOT EXISTS "ClientBlogSite_primaryDomain_idx" ON "ClientBlogSite"("primaryDomain");

CREATE UNIQUE INDEX IF NOT EXISTS "ClientBlogPost_siteId_slug_key" ON "ClientBlogPost"("siteId","slug");
CREATE INDEX IF NOT EXISTS "ClientBlogPost_siteId_status_publishedAt_idx" ON "ClientBlogPost"("siteId","status","publishedAt");
CREATE INDEX IF NOT EXISTS "ClientBlogPost_siteId_archivedAt_idx" ON "ClientBlogPost"("siteId","archivedAt");

-- ClientBlogSite hosted slug
ALTER TABLE "ClientBlogSite" ADD COLUMN IF NOT EXISTS "slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ClientBlogSite_slug_key" ON "ClientBlogSite"("slug");

-- PortalBookingSite customization fields
ALTER TABLE "PortalBookingSite" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "PortalBookingSite" ADD COLUMN IF NOT EXISTS "notificationEmails" JSONB;
ALTER TABLE "PortalBookingSite" ADD COLUMN IF NOT EXISTS "appointmentPurpose" TEXT;
ALTER TABLE "PortalBookingSite" ADD COLUMN IF NOT EXISTS "toneDirection" TEXT;
ALTER TABLE "PortalBookingSite" ADD COLUMN IF NOT EXISTS "meetingLocation" TEXT;
ALTER TABLE "PortalBookingSite" ADD COLUMN IF NOT EXISTS "meetingDetails" TEXT;
