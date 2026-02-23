import { Prisma } from "@prisma/client";

export function isHrSchemaMissingError(err: unknown): boolean {
  if (!err) return false;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021") return true; // table does not exist
  }

  const rec = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const message = String(rec?.message || "").toLowerCase();

  if (message.includes("hrcandidate")) return true;
  if (message.includes("hrfollowup")) return true;
  if (message.includes("hrcandidatefollowup")) return true;
  if (message.includes("hrinterview")) return true;
  if (message.includes("hrhiringdecision")) return true;
  if (message.includes("hrfollowupstatus")) return true;
  if (message.includes("hrfollowupchannel")) return true;

  return false;
}

export function hrSchemaMissingResponse() {
  return {
    ok: false as const,
    error: "HR schema not installed",
    code: "HR_SCHEMA_MISSING" as const,
  };
}
