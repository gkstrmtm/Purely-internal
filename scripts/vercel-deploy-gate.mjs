const mode = String(process.argv[2] || "enforce").trim().toLowerCase();
const branch = String(process.env.VERCEL_GIT_COMMIT_REF || "").trim();
const isVercel = String(process.env.VERCEL || "").trim() === "1" || Boolean(process.env.VERCEL_ENV);
const allowNonMain = String(process.env.ALLOW_VERCEL_NON_MAIN_DEPLOY || "").trim() === "1";

function log(message) {
  console.log(`[vercel-deploy-gate] ${message}`);
}

if (!isVercel) {
  if (mode === "ignore") {
    log("Not running on Vercel; do not ignore build.");
    process.exit(1);
  }
  log("Not running on Vercel; branch enforcement skipped.");
  process.exit(0);
}

if (allowNonMain) {
  if (mode === "ignore") {
    log("ALLOW_VERCEL_NON_MAIN_DEPLOY=1 set; do not ignore build.");
    process.exit(1);
  }
  log("ALLOW_VERCEL_NON_MAIN_DEPLOY=1 set; allowing this Vercel build.");
  process.exit(0);
}

if (branch === "main") {
  if (mode === "ignore") {
    log("Branch is main; do not ignore build.");
    process.exit(1);
  }
  log("Branch is main; continuing build.");
  process.exit(0);
}

if (mode === "ignore") {
  log(`Ignoring Vercel build for branch \"${branch || "(unknown)"}\". Only main may deploy.`);
  process.exit(0);
}

console.error(`[vercel-deploy-gate] Blocking Vercel build for branch \"${branch || "(unknown)"}\". Only main may deploy.`);
process.exit(1);