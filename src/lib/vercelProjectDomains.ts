type VercelConfig = {
  token: string | null;
  projectIdOrName: string | null;
  teamId: string | null;
};

export function getVercelDomainProvisioningConfig(): VercelConfig {
  const token = (process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN || "").trim();
  const projectIdOrName = (
    process.env.VERCEL_PROJECT_ID ||
    process.env.VERCEL_PROJECT_ID_OR_NAME ||
    process.env.VERCEL_PROJECT_NAME ||
    ""
  ).trim();
  const teamId = (process.env.VERCEL_TEAM_ID || "").trim();

  return {
    token: token || null,
    projectIdOrName: projectIdOrName || null,
    teamId: teamId || null,
  };
}

export function formatVercelVerificationRecords(verification: unknown): string {
  if (!Array.isArray(verification) || verification.length === 0) return "";
  const lines = (verification as any[])
    .map((v) => {
      const type = typeof v?.type === "string" ? v.type.trim() : "";
      const host = typeof v?.domain === "string" ? v.domain.trim() : "";
      const value = typeof v?.value === "string" ? v.value.trim() : "";
      if (!type || !host || !value) return null;
      return `${type} ${host} = ${value}`;
    })
    .filter(Boolean) as string[];
  if (lines.length === 0) return "";
  return ` Required verification record(s): ${lines.join(" | ")}.`;
}

export type EnsureVercelProjectDomainResult =
  | { ok: false; configured: false; error: string }
  | { ok: false; configured: true; error: string; debug?: unknown }
  | {
      ok: true;
      configured: true;
      verified: boolean;
      verification: any[] | null;
      raw: unknown;
    };

/**
 * Ensures the given domain exists on the configured Vercel project and attempts to verify it.
 * This is required for Vercel to issue an SSL cert + serve the custom domain reliably.
 */
export async function ensureVercelProjectDomain(domain: string): Promise<EnsureVercelProjectDomainResult> {
  const { token, projectIdOrName, teamId } = getVercelDomainProvisioningConfig();
  if (!token || !projectIdOrName) {
    return {
      ok: false,
      configured: false,
      error: "Platform domain provisioning is not configured",
    };
  }

  const qp = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Add domain (ignore if already exists on project).
  const addRes = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/domains${qp}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: domain }),
    },
  ).catch(() => null);

  let addJson: any = null;
  if (addRes) addJson = await addRes.json().catch(() => null);

  const addOk = !!addRes && (addRes.ok || addRes.status === 400);
  if (!addOk) {
    return {
      ok: false,
      configured: true,
      error: "Failed to add domain to hosting project",
      debug: { status: addRes?.status, body: addJson },
    };
  }

  const verifyRes = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}/domains/${encodeURIComponent(domain)}/verify${qp}`,
    {
      method: "POST",
      headers,
    },
  ).catch(() => null);

  const verifyJson = verifyRes ? await verifyRes.json().catch(() => null) : null;
  if (!verifyRes || !verifyRes.ok) {
    return {
      ok: false,
      configured: true,
      error: "Failed to verify domain on hosting project",
      debug: { status: verifyRes?.status, body: verifyJson },
    };
  }

  return {
    ok: true,
    configured: true,
    verified: !!(verifyJson as any)?.verified,
    verification: Array.isArray((verifyJson as any)?.verification) ? (verifyJson as any).verification : null,
    raw: verifyJson,
  };
}

export async function checkHttpsReachable(domain: string): Promise<{ ok: true; status: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return { ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function getAllowedVercelApexARecords(platformARecords: string[]): string[] {
  // Vercel commonly uses 76.76.21.21 for apex A records.
  const base = new Set(["76.76.21.21", ...platformARecords].filter(Boolean));
  return Array.from(base);
}
