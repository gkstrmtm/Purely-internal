-- Hosted client blogs + branding + booking customization

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
