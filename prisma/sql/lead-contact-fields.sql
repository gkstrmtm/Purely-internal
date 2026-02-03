-- Add Lead contact + interest fields for closers/management visibility.
-- Run this in Supabase SQL editor (production) once deployed.

alter table if exists "Lead"
  add column if not exists "contactPhone" text null,
  add column if not exists "interestedService" text null;
