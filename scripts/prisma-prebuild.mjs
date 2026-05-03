import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function wrapCommandForPlatform(cmd, args) {
  if (process.platform !== "win32") return { cmd, args };

  const commandLine = [cmd, ...args]
    .map((part) => {
      const value = String(part ?? "");
      return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
    })
    .join(" ");

  return {
    cmd: "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function run(cmd, args, opts = {}) {
  const platformCommand = wrapCommandForPlatform(cmd, args);
  const res = spawnSync(platformCommand.cmd, platformCommand.args, {
    stdio: opts.captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
    shell: false,
    timeout: opts.timeoutMs,
    env: opts.env ?? process.env,
    encoding: opts.captureOutput ? "utf8" : undefined,
  });
  if (opts.captureOutput) {
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
  if (res.error) {
    console.error(`[prebuild] Failed to launch ${cmd}: ${res.error.message}`);
  }
  if (opts.allowWindowsEngineRenameFailure && res.status !== 0 && process.platform === "win32") {
    const output = `${res.stdout || ""}\n${res.stderr || ""}`;
    const engineFile = path.join(process.cwd(), "node_modules", ".prisma", "client", "query_engine-windows.dll.node");
    const windowsEngineRenameFailure =
      output.includes("EPERM: operation not permitted, rename") &&
      output.includes("query_engine-windows.dll.node.tmp") &&
      output.includes("query_engine-windows.dll.node");

    if (windowsEngineRenameFailure && fs.existsSync(engineFile)) {
      console.warn("[prebuild] Prisma generate hit a locked Windows engine rename, but an existing engine is already present. Continuing build.");
      return res;
    }
  }
  if (res.status !== 0 && !opts.allowFailure) process.exit(res.status ?? 1);
  return res;
}

// IMPORTANT:
// - `prisma generate` is safe during builds (no live DB required).
// - `prisma migrate deploy` is NOT safe to run implicitly on Vercel/CI because it can fail
//   for reasons unrelated to the app build (DB unreachable, pooler issues, drift), which
//   blocks deployments.
//
// Keep migrations opt-in via env so deployments don't get bricked.
const shouldRunMigrations = process.env.RUN_PRISMA_MIGRATIONS === "1";

const isVercel = Boolean(process.env.VERCEL);
const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
const isVercelProduction = isVercel && vercelEnv === "production";
const allowMigrateFailure = String(process.env.ALLOW_PRISMA_MIGRATE_FAILURE || "").trim() === "1";
const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;

// `prisma generate` does not require a live database connection.
// We always run it so local builds don't break when schema changes.
console.log("[prebuild] Running prisma generate...");
run("npx", ["prisma", "generate"], {
  timeoutMs: 180_000,
  captureOutput: true,
  allowWindowsEngineRenameFailure: true,
});

if (!shouldRunMigrations) {
  console.log("[prebuild] Skipping prisma migrate deploy. Set RUN_PRISMA_MIGRATIONS=1 to run migrations.");
  process.exit(0);
}

if (!directUrl && !databaseUrl) {
  console.log("[prebuild] RUN_PRISMA_MIGRATIONS=1 but no DATABASE_URL/DIRECT_URL set; cannot run prisma migrate deploy.");
  process.exit(1);
}

console.log("[prebuild] RUN_PRISMA_MIGRATIONS=1: running prisma migrate deploy...");
run("npx", ["prisma", "migrate", "deploy"], {
  timeoutMs: 180_000,
  env: directUrl ? { ...process.env, DATABASE_URL: directUrl } : process.env,
  allowFailure: Boolean(allowMigrateFailure) && !isVercelProduction,
});
