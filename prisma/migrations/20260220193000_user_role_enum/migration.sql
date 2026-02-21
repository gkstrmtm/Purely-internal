-- Ensure User.role uses the Prisma Role enum (idempotent)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('DIALER', 'CLOSER', 'MANAGER', 'ADMIN', 'CLIENT');
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Convert column type if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'role'
      AND udt_name <> 'Role'
  ) THEN
    -- Existing default is text; drop it before changing the column type.
    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

    ALTER TABLE "User"
      ALTER COLUMN "role" TYPE "Role"
      USING (
        CASE
          WHEN "role" IN ('DIALER', 'CLOSER', 'MANAGER', 'ADMIN', 'CLIENT') THEN "role"::"Role"
          ELSE 'CLIENT'::"Role"
        END
      );
  END IF;
END $$;

-- Ensure default matches enum type
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'DIALER'::"Role";
