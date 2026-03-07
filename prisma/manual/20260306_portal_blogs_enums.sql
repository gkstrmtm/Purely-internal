-- Idempotent patch: ensure blog/newsletter enum types exist (for Prisma) and coerce
-- existing columns to use those enum types when present.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

-- Enum types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ClientBlogPostStatus'
  ) THEN
    CREATE TYPE "ClientBlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalBlogGenerationSource'
  ) THEN
    CREATE TYPE "PortalBlogGenerationSource" AS ENUM ('CRON', 'GENERATE_NOW', 'DRAFT_GENERATE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ClientNewsletterKind'
  ) THEN
    CREATE TYPE "ClientNewsletterKind" AS ENUM ('EXTERNAL', 'INTERNAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ClientNewsletterStatus'
  ) THEN
    CREATE TYPE "ClientNewsletterStatus" AS ENUM ('DRAFT', 'READY', 'SENT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNewsletterGenerationSource'
  ) THEN
    CREATE TYPE "PortalNewsletterGenerationSource" AS ENUM ('CRON', 'GENERATE_NOW');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNewsletterSendChannel'
  ) THEN
    CREATE TYPE "PortalNewsletterSendChannel" AS ENUM ('EMAIL', 'SMS');
  END IF;
END $$;

-- Column coercions (only when tables/columns exist and are not already the enum type)
DO $$
DECLARE
  udt TEXT;
BEGIN
  SELECT c.udt_name INTO udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ClientBlogPost'
    AND c.column_name = 'status';

  IF udt IS NOT NULL AND udt <> 'ClientBlogPostStatus' THEN
    EXECUTE 'ALTER TABLE "ClientBlogPost" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE $cmd$
      ALTER TABLE "ClientBlogPost"
      ALTER COLUMN "status" TYPE "ClientBlogPostStatus"
      USING (
        CASE
          WHEN ("status"::text) = 'PUBLISHED' THEN 'PUBLISHED'
          ELSE 'DRAFT'
        END
      )::"ClientBlogPostStatus";
    $cmd$;
    EXECUTE 'ALTER TABLE "ClientBlogPost" ALTER COLUMN "status" SET DEFAULT ''DRAFT''::"ClientBlogPostStatus"';
  END IF;
END $$;

DO $$
DECLARE
  udt TEXT;
BEGIN
  SELECT c.udt_name INTO udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalBlogGenerationEvent'
    AND c.column_name = 'source';

  IF udt IS NOT NULL AND udt <> 'PortalBlogGenerationSource' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalBlogGenerationEvent"
      ALTER COLUMN "source" TYPE "PortalBlogGenerationSource"
      USING (
        CASE
          WHEN ("source"::text) = 'GENERATE_NOW' THEN 'GENERATE_NOW'
          WHEN ("source"::text) = 'DRAFT_GENERATE' THEN 'DRAFT_GENERATE'
          ELSE 'CRON'
        END
      )::"PortalBlogGenerationSource";
    $cmd$;
  END IF;
END $$;

DO $$
DECLARE
  udt_kind TEXT;
  udt_status TEXT;
BEGIN
  SELECT c.udt_name INTO udt_kind
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ClientNewsletter'
    AND c.column_name = 'kind';

  IF udt_kind IS NOT NULL AND udt_kind <> 'ClientNewsletterKind' THEN
    EXECUTE $cmd$
      ALTER TABLE "ClientNewsletter"
      ALTER COLUMN "kind" TYPE "ClientNewsletterKind"
      USING (
        CASE
          WHEN ("kind"::text) = 'INTERNAL' THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END
      )::"ClientNewsletterKind";
    $cmd$;
  END IF;

  SELECT c.udt_name INTO udt_status
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ClientNewsletter'
    AND c.column_name = 'status';

  IF udt_status IS NOT NULL AND udt_status <> 'ClientNewsletterStatus' THEN
    EXECUTE 'ALTER TABLE "ClientNewsletter" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE $cmd$
      ALTER TABLE "ClientNewsletter"
      ALTER COLUMN "status" TYPE "ClientNewsletterStatus"
      USING (
        CASE
          WHEN ("status"::text) = 'SENT' THEN 'SENT'
          WHEN ("status"::text) = 'READY' THEN 'READY'
          ELSE 'DRAFT'
        END
      )::"ClientNewsletterStatus";
    $cmd$;
    EXECUTE 'ALTER TABLE "ClientNewsletter" ALTER COLUMN "status" SET DEFAULT ''DRAFT''::"ClientNewsletterStatus"';
  END IF;
END $$;

DO $$
DECLARE
  udt_src TEXT;
  udt_kind TEXT;
BEGIN
  SELECT c.udt_name INTO udt_src
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterGenerationEvent'
    AND c.column_name = 'source';

  IF udt_src IS NOT NULL AND udt_src <> 'PortalNewsletterGenerationSource' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterGenerationEvent"
      ALTER COLUMN "source" TYPE "PortalNewsletterGenerationSource"
      USING (
        CASE
          WHEN ("source"::text) = 'GENERATE_NOW' THEN 'GENERATE_NOW'
          ELSE 'CRON'
        END
      )::"PortalNewsletterGenerationSource";
    $cmd$;
  END IF;

  SELECT c.udt_name INTO udt_kind
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterGenerationEvent'
    AND c.column_name = 'kind';

  IF udt_kind IS NOT NULL AND udt_kind <> 'ClientNewsletterKind' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterGenerationEvent"
      ALTER COLUMN "kind" TYPE "ClientNewsletterKind"
      USING (
        CASE
          WHEN ("kind"::text) = 'INTERNAL' THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END
      )::"ClientNewsletterKind";
    $cmd$;
  END IF;
END $$;

DO $$
DECLARE
  udt_channel TEXT;
  udt_kind TEXT;
BEGIN
  SELECT c.udt_name INTO udt_channel
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterSendEvent'
    AND c.column_name = 'channel';

  IF udt_channel IS NOT NULL AND udt_channel <> 'PortalNewsletterSendChannel' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterSendEvent"
      ALTER COLUMN "channel" TYPE "PortalNewsletterSendChannel"
      USING (
        CASE
          WHEN ("channel"::text) = 'SMS' THEN 'SMS'
          ELSE 'EMAIL'
        END
      )::"PortalNewsletterSendChannel";
    $cmd$;
  END IF;

  SELECT c.udt_name INTO udt_kind
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterSendEvent'
    AND c.column_name = 'kind';

  IF udt_kind IS NOT NULL AND udt_kind <> 'ClientNewsletterKind' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterSendEvent"
      ALTER COLUMN "kind" TYPE "ClientNewsletterKind"
      USING (
        CASE
          WHEN ("kind"::text) = 'INTERNAL' THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END
      )::"ClientNewsletterKind";
    $cmd$;
  END IF;
END $$;
