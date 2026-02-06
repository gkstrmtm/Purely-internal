-- PortalBooking calendar ID for per-calendar automation scoping

ALTER TABLE "PortalBooking" ADD COLUMN IF NOT EXISTS "calendarId" TEXT;

-- Helps cron queries that scan by site + calendar + end time
CREATE INDEX IF NOT EXISTS "PortalBooking_siteId_calendarId_endAt_idx" ON "PortalBooking"("siteId", "calendarId", "endAt");
