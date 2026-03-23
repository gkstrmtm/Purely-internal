-- Suggested Setup diagnostics for Supabase (Postgres)
-- Run this in Supabase SQL Editor to confirm the minimum tables exist.

select
  to_regclass('public."PortalServiceSetup"') as "PortalServiceSetup",
  to_regclass('public."BusinessProfile"') as "BusinessProfile",
  to_regclass('public."User"') as "User",
  to_regclass('public."PortalTask"') as "PortalTask",
  to_regclass('public."PortalMediaFolder"') as "PortalMediaFolder",
  to_regclass('public."PortalAiOutboundCallCampaign"') as "PortalAiOutboundCallCampaign",
  to_regclass('public."PortalNurtureCampaign"') as "PortalNurtureCampaign";

-- If BusinessProfile exists but preview still fails, verify key columns exist.
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('BusinessProfile', 'PortalServiceSetup')
  and column_name in (
    'ownerId',
    'businessName',
    'websiteUrl',
    'industry',
    'businessModel',
    'primaryGoals',
    'targetCustomer',
    'brandVoice',
    'logoUrl',
    'brandPrimaryHex',
    'brandSecondaryHex',
    'brandAccentHex',
    'brandTextHex',
    'brandFontFamily',
    'brandFontGoogleFamily',
    'serviceSlug',
    'dataJson'
  )
order by table_name, column_name;

-- If PortalServiceSetup is missing, Suggested Setup cannot function.
-- In that case, you need to apply the Prisma migrations in prisma/migrations.
