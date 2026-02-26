import { NextResponse } from "next/server";

import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function stripSpecialSegments(pathname: string): string {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .filter((seg) => {
      if (!seg) return false;
      if (seg.startsWith("(") && seg.endsWith(")")) return false; // route groups
      if (seg.startsWith("@")) return false; // parallel routes
      if (seg === "_not-found") return false;
      return true;
    });

  return "/" + segments.join("/");
}

function normalizeManifestKeyToUrlPath(key: string): string | null {
  // Keys look like "/portal/app/billing/page" or "/portal/app/page"
  if (!key.startsWith("/")) return null;
  if (key.includes("/api/")) return null;
  if (!key.endsWith("/page")) return null;

  const withoutSuffix = key.slice(0, -"/page".length);
  const cleaned = stripSpecialSegments(withoutSuffix);

  if (!cleaned.startsWith("/portal/")) return null;
  return cleaned === "/portal/app" ? "/portal/app" : cleaned;
}

async function listPortalAppPathsFromManifest(): Promise<string[] | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const manifestPath = path.join(process.cwd(), ".next", "server", "app-paths-manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const json = JSON.parse(raw) as Record<string, unknown>;
  return Object.keys(json);
}

async function listPortalAppPathsFromSource(): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const rootDir = path.join(process.cwd(), "src", "app", "portal", "app");
  const pageFileNames = new Set(["page.tsx", "page.ts", "page.jsx", "page.js"]);

  const out = new Set<string>();

  async function walk(currentDir: string, relSegments: string[]): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (ent.isFile() && pageFileNames.has(ent.name)) {
        const rawPath = "/portal/app" + (relSegments.length ? "/" + relSegments.join("/") : "");
        out.add(stripSpecialSegments(rawPath));
      }

      if (ent.isDirectory()) {
        await walk(path.join(currentDir, ent.name), [...relSegments, ent.name]);
      }
    }
  }

  await walk(rootDir, []);
  return Array.from(out);
}

export async function GET(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const prefixRaw = (url.searchParams.get("prefix") ?? "/portal/app").trim();
  const prefix = prefixRaw || "/portal/app";

  try {
    let keys: string[] = [];
    try {
      keys = (await listPortalAppPathsFromManifest()) ?? [];
    } catch {
      keys = [];
    }

    const paths = new Set<string>();

    if (keys.length) {
      for (const key of keys) {
        const p = normalizeManifestKeyToUrlPath(key);
        if (!p) continue;
        if (!p.startsWith(prefix)) continue;
        paths.add(p);
      }
    } else {
      for (const p of await listPortalAppPathsFromSource()) {
        if (!p.startsWith(prefix)) continue;
        paths.add(p);
      }
    }

    // Convenience wildcard option
    if (prefix.endsWith("/*")) {
      paths.add(prefix);
    } else {
      paths.add(prefix.replace(/\/+$/, "") + "/*");
    }

    const xs = Array.from(paths);
    xs.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, paths: xs });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load portal app paths." }, { status: 500 });
  }
}
