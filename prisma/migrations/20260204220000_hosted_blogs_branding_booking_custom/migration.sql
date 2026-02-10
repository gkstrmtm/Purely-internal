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
