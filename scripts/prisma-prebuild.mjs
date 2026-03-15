import { spawnSync } from "node:child_process";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    timeout: opts.timeoutMs,
    env: opts.env,
  });
  if (res.status !== 0 && !opts.allowFailure) process.exit(res.status ?? 1);
  return res;
}

const shouldRunMigrations = Boolean(process.env.VERCEL || process.env.CI || process.env.RUN_PRISMA_MIGRATIONS === "1");

const isVercel = Boolean(process.env.VERCEL);
const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
const isVercelProduction = isVercel && vercelEnv === "production";
const forceMigrations = process.env.RUN_PRISMA_MIGRATIONS === "1";
const allowMigrateFailure = String(process.env.ALLOW_PRISMA_MIGRATE_FAILURE || "").trim() === "1";
const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;

// `prisma generate` does not require a live database connection.
// We always run it so local builds don't break when schema changes.
console.log("[prebuild] Running prisma generate...");
run("npx", ["prisma", "generate"], { timeoutMs: 180_000 });

if (!shouldRunMigrations) {
  console.log("[prebuild] Skipping prisma migrate deploy (not Vercel/CI). Set RUN_PRISMA_MIGRATIONS=1 to run migrations.");
  process.exit(0);
}

if (isVercelProduction && !allowMigrateFailure && !directUrl && !databaseUrl) {
  console.log("[prebuild] Missing DIRECT_URL/DATABASE_URL on Vercel production; cannot run prisma migrate deploy.");
  process.exit(1);
}

// Prisma migrations are often slow/unreliable through poolers (pgbouncer). On Vercel we prefer a
// direct connection for migrate deploy. If DIRECT_URL isn't available, we skip migrations to
// avoid long/hanging builds.
if (forceMigrations) {
  if (!directUrl && !databaseUrl) {
    console.log("[prebuild] RUN_PRISMA_MIGRATIONS=1 but no DATABASE_URL/DIRECT_URL set; skipping prisma migrate deploy.");
  } else {
    console.log("[prebuild] RUN_PRISMA_MIGRATIONS=1: running prisma migrate deploy...");
    run("npx", ["prisma", "migrate", "deploy"], {
      timeoutMs: 180_000,
      env: directUrl ? { ...process.env, DATABASE_URL: directUrl } : process.env,
    });
  }
} else if (directUrl) {
  console.log("[prebuild] Running prisma migrate deploy (using DIRECT_URL)...");
  const res = run("npx", ["prisma", "migrate", "deploy"], {
    timeoutMs: 120_000,
    env: { ...process.env, DATABASE_URL: directUrl },
    allowFailure: !(isVercelProduction && !allowMigrateFailure),
  });
  if (res.status !== 0) {
    const msg = "[prebuild] prisma migrate deploy failed (likely DB unreachable/schema drift).";
    if (isVercelProduction && !allowMigrateFailure) {
      console.log(`${msg} Failing build (Vercel production).`);
      process.exit(res.status ?? 1);
    }
    console.log(`${msg} Continuing build; set RUN_PRISMA_MIGRATIONS=1 to fail hard.`);
  }
} else if (isVercel && databaseUrl) {
  console.log("[prebuild] DIRECT_URL not set on Vercel; attempting prisma migrate deploy using DATABASE_URL...");
  const res = run("npx", ["prisma", "migrate", "deploy"], {
    timeoutMs: 120_000,
    env: process.env,
    allowFailure: !(isVercelProduction && !allowMigrateFailure),
  });
  if (res.status !== 0) {
    const msg = "[prebuild] prisma migrate deploy failed using DATABASE_URL (likely pooler/DB unreachable/schema drift).";
    if (isVercelProduction && !allowMigrateFailure) {
      console.log(`${msg} Failing build (Vercel production).`);
      process.exit(res.status ?? 1);
    }
    console.log(`${msg} Continuing build; set RUN_PRISMA_MIGRATIONS=1 to fail hard.`);
  }
} else if (isVercel) {
  if (isVercelProduction && !allowMigrateFailure) {
    console.log("[prebuild] DIRECT_URL not set on Vercel production; failing build to avoid shipping schema drift.");
    process.exit(1);
  }
  console.log("[prebuild] DIRECT_URL not set on Vercel; skipping prisma migrate deploy to avoid long builds.");
} else {
  console.log("[prebuild] Skipping prisma migrate deploy (no DIRECT_URL). Set RUN_PRISMA_MIGRATIONS=1 to force.");
}
