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

function extractVercelError(json: any): { code: string | null; message: string | null } {
  const code = typeof json?.error?.code === "string" ? json.error.code : null;
  const message =
    (typeof json?.error?.message === "string" && json.error.message) ||
    (typeof json?.message === "string" && json.message) ||
    (typeof json?.error === "string" && json.error) ||
    null;
  return { code, message };
}

function isLikelyAlreadyExistsError(json: any): boolean {
  const { code, message } = extractVercelError(json);
  const hay = `${code || ""} ${message || ""}`.toLowerCase();
  if (!hay) return false;
  if (hay.includes("already exists")) return true;
  if (hay.includes("domain_exists") || hay.includes("domain_already")) return true;
  return false;
}

function isLikelyDomainInUseError(json: any): boolean {
  const { code, message } = extractVercelError(json);
  const hay = `${code || ""} ${message || ""}`.toLowerCase();
  if (!hay) return false;
  if (hay.includes("in use") || hay.includes("already in use")) return true;
  if (hay.includes("domain_already_in_use")) return true;
  return false;
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init).catch(() => null);
  const json = res ? await res.json().catch(() => null) : null;
  return { res, json };
}

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

  const pid = encodeURIComponent(projectIdOrName);
  const d = encodeURIComponent(domain);

  // If the domain already exists on the project, skip straight to verify.
  const existing = await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains/${d}${qp}`,
    {
      method: "GET",
      headers,
    },
  );
  if (existing.res && existing.res.ok) {
    // proceed
  } else if (existing.res && existing.res.status !== 404) {
    const { code, message } = extractVercelError(existing.json);
    return {
      ok: false,
      configured: true,
      error: `Failed to fetch hosting domain status${message ? ` (${message})` : ""}`,
      debug: { status: existing.res.status, code, body: existing.json },
    };
  }

  // Add domain if missing (ignore if already exists on project).
  if (!existing.res || existing.res.status === 404) {
    const addV10 = await fetchJson(`https://api.vercel.com/v10/projects/${pid}/domains${qp}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: domain }),
      },
    );

    const addRes = addV10.res;
    const addJson: any = addV10.json;

    // Some Vercel accounts/endpoints may not support v10; fallback to v9.
    const shouldFallback = !!addRes && (addRes.status === 404 || addRes.status === 405);
    const addV9 = shouldFallback
      ? await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains${qp}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ name: domain }),
          },
        )
      : null;

    const finalAddRes = addV9?.res ?? addRes;
    const finalAddJson = addV9?.json ?? addJson;

    const addOk =
      !!finalAddRes &&
      (finalAddRes.ok ||
        finalAddRes.status === 409 ||
        (finalAddRes.status === 400 && isLikelyAlreadyExistsError(finalAddJson)));

    if (!addOk) {
      const { code, message } = extractVercelError(finalAddJson);
      const suffix = message ? ` (${message})` : "";
      const domainInUse = isLikelyDomainInUseError(finalAddJson);
      return {
        ok: false,
        configured: true,
        error: domainInUse
          ? `Domain is already in use on another hosting project${suffix}`
          : `Failed to add domain to hosting project${suffix}`,
        debug: { status: finalAddRes?.status, code, body: finalAddJson },
      };
    }
  }

  const verify = await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains/${d}/verify${qp}`,
    {
      method: "POST",
      headers,
    },
  );

  const verifyJson: any = verify.json;

  // Vercel sometimes returns a non-2xx status while still including verification hints.
  const hasVerificationPayload = verifyJson && typeof verifyJson?.verified === "boolean";
  if (!verify.res || (!verify.res.ok && !hasVerificationPayload)) {
    const { code, message } = extractVercelError(verifyJson);
    return {
      ok: false,
      configured: true,
      error: `Failed to verify domain on hosting project${message ? ` (${message})` : ""}`,
      debug: { status: verify.res?.status, code, body: verifyJson },
    };
  }

  return {
    ok: true,
    configured: true,
    verified: !!verifyJson?.verified,
    verification: Array.isArray(verifyJson?.verification) ? verifyJson.verification : null,
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
