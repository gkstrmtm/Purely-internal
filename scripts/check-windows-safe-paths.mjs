import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const INVALID_SEGMENT_CHARS = /[<>:"\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

function listTrackedFiles() {
  try {
    const output = execSync("git ls-files -z", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output.split("\0").filter(Boolean);
  } catch {
    return listWorkspaceFiles(process.cwd());
  }
}

function listWorkspaceFiles(rootDir) {
  const ignoredDirs = new Set([".git", ".next", ".vercel", "node_modules"]);
  const files = [];
  const pendingDirs = [rootDir];

  while (pendingDirs.length) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) continue;

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        pendingDirs.push(path.join(currentDir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;

      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath);
      files.push(relativePath.split(path.sep).join("/"));
    }
  }

  return files;
}

function validateSegment(segment) {
  if (!segment) return null;

  if (INVALID_SEGMENT_CHARS.test(segment)) {
    return "contains characters unsupported by Windows";
  }

  if (/[ .]$/.test(segment)) {
    return "ends with a space or period, which Windows rejects";
  }

  const basename = segment.split(".")[0]?.toUpperCase();
  if (basename && RESERVED_WINDOWS_NAMES.has(basename)) {
    return "uses a reserved Windows device name";
  }

  return null;
}

function main() {
  const invalidPaths = [];

  for (const trackedPath of listTrackedFiles()) {
    for (const segment of trackedPath.split("/")) {
      const reason = validateSegment(segment);
      if (!reason) continue;

      invalidPaths.push({ trackedPath, segment, reason });
      break;
    }
  }

  if (!invalidPaths.length) {
    return;
  }

  console.error("Tracked files contain Windows-invalid path segments.");
  for (const { trackedPath, segment, reason } of invalidPaths) {
    console.error(`${trackedPath} -> ${segment} (${reason})`);
  }
  process.exit(1);
}

main();