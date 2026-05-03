import { spawn } from "node:child_process";
import path from "node:path";

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextDistDir = String(process.env.NEXT_DIST_DIR || "").trim() || ".next-dev";
const args = [nextBin, "dev", ...process.argv.slice(2)];
const env = {
  ...process.env,
  NEXT_DIST_DIR: nextDistDir,
};

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});