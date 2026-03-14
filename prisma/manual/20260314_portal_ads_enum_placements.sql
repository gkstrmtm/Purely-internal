-- Manual Supabase patch: bring PortalAdPlacement enum up to date.
-- Safe/non-destructive: only adds missing enum values.
-- Note: In Postgres, ALTER TYPE ... ADD VALUE is best run outside an explicit transaction.

-- Optional sanity check (shows current enum labels):
-- select e.enumlabel
-- from pg_type t
-- join pg_enum e on t.oid = e.enumtypid
-- where t.typname = 'PortalAdPlacement'
-- order by e.enumsortorder;

ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'TOP_BANNER';
ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'POPUP_CARD';
ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'HOSTED_BLOG_PAGE';
ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'HOSTED_REVIEWS_PAGE';
