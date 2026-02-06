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
const forceMigrations = process.env.RUN_PRISMA_MIGRATIONS === "1";
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
    allowFailure: true,
  });
  if (res.status !== 0) {
    console.log(
      "[prebuild] prisma migrate deploy failed (likely DB unreachable). Continuing build; set RUN_PRISMA_MIGRATIONS=1 to fail hard.",
    );
  }
} else if (isVercel) {
  console.log("[prebuild] DIRECT_URL not set on Vercel; skipping prisma migrate deploy to avoid long builds.");
} else {
  console.log("[prebuild] Skipping prisma migrate deploy (no DIRECT_URL). Set RUN_PRISMA_MIGRATIONS=1 to force.");
}
