function parseUrl(raw) {
  try {
    return new URL(String(raw || "").trim());
  } catch {
    return null;
  }
}

function isRemoteSupabase(u) {
  const host = String(u?.host || "").toLowerCase();
  if (!host) return false;
  if (host.includes("localhost") || host.startsWith("127.") || host.startsWith("0.0.0.0")) return false;
  return host.includes("supabase.") || host.includes("supabase.co") || host.includes("supabase.com");
}

function fail(msg) {
  console.error("\nDB GUARD: blocked a potentially destructive DB command.\n");
  console.error(msg);
  console.error("\nIf you really intend to run this against a remote DB, re-run with:");
  console.error("  ALLOW_PROD_DB_MUTATIONS=1 <your command>\n");
  process.exit(2);
}

const allow = String(process.env.ALLOW_PROD_DB_MUTATIONS || "").trim() === "1";

const db = parseUrl(process.env.DATABASE_URL);
const direct = parseUrl(process.env.DIRECT_URL);

const remote = (db && isRemoteSupabase(db)) || (direct && isRemoteSupabase(direct));

if (remote && !allow) {
  const dbHost = db?.host ? `DATABASE_URL host: ${db.host}` : "DATABASE_URL host: (unparseable or missing)";
  const directHost = direct?.host ? `DIRECT_URL host: ${direct.host}` : "DIRECT_URL host: (unparseable or missing)";
  fail([
    "This command appears to target a remote Supabase database.",
    dbHost,
    directHost,
  ].join("\n"));
}

// Allow
process.exit(0);
