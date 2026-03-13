-- Add optional business font fields to BusinessProfile

ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "brandFontFamily" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "brandFontGoogleFamily" TEXT;
