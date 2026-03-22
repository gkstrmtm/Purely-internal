-- Add a third brand color to BusinessProfile
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "brandSecondaryHex" TEXT;
