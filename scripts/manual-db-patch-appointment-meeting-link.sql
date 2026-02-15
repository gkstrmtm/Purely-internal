-- Manual DB patch (Postgres)
-- Adds per-appointment meeting link + platform and reminder tracking.
-- Safe to run multiple times.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingPlatform" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingJoinUrl" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingJoinUrlSetAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingJoinUrlSetByUserId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingReminder24hSentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "meetingReminder1hSentAt" TIMESTAMP(3);
