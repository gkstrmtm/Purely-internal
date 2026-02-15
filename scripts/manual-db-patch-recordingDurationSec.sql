-- Manual DB patch (Postgres)
-- Adds duration hint support for Outbound Manual Call recordings.
-- Safe to run multiple times.

ALTER TABLE "PortalAiOutboundCallManualCall"
  ADD COLUMN IF NOT EXISTS "recordingDurationSec" INTEGER;
