import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// Only attempt migrations when a database is configured.
if (!process.env.DATABASE_URL) {
  console.log("[prebuild] DATABASE_URL not set; skipping prisma migrate/generate.");
  process.exit(0);
}

const shouldRun = Boolean(process.env.VERCEL || process.env.CI || process.env.RUN_PRISMA_MIGRATIONS === "1");
if (!shouldRun) {
  console.log("[prebuild] Not running on Vercel/CI; skipping prisma migrate/generate.");
  process.exit(0);
}

console.log("[prebuild] Running prisma migrate deploy...");
run("npx", ["prisma", "migrate", "deploy"]);

console.log("[prebuild] Running prisma generate...");
run("npx", ["prisma", "generate"]);
