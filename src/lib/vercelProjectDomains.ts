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

function getTeamQueryCandidates(teamId: string | null): string[] {
  if (!teamId) return [""];
  // Some projects are under a personal account; passing teamId can cause 401/403.
  return [`?teamId=${encodeURIComponent(teamId)}`, ""];
}

function extractVercelError(json: any): { code: string | null; message: string | null } {
  const code = typeof json?.error?.code === "string" ? json.error.code : null;
  const message =
    (typeof json?.error?.message === "string" && json.error.message) ||
    (typeof json?.message === "string" && json.message) ||
    (typeof json?.error === "string" && json.error) ||
    null;
  return { code, message };
}

function toCustomerFacingDomainProvisioningError(opts: { code: string | null; message: string | null }): string {
  const code = (opts.code || "").trim().toLowerCase();
  const message = (opts.message || "").trim();
  const hay = `${code} ${message}`.toLowerCase();

  if (hay.includes("not assigned to a project") || hay.includes("not assigned") || hay.includes("domain is not assigned")) {
    return (
      "We can’t finish hosting setup for this domain yet because it’s already connected to another website/project on the hosting provider. " +
      "Next step: disconnect the domain from the other project (or choose a different domain/subdomain), then click Verify again."
    );
  }

  if (
    hay.includes("already in use") ||
    hay.includes("domain_already_in_use") ||
    hay.includes("belongs to another") ||
    hay.includes("belongs to a different") ||
    hay.includes("domain_taken")
  ) {
    return (
      "This domain is already in use on another website/project. " +
      "Next step: remove it from the other host/project (or use a different domain/subdomain), then try again."
    );
  }

  if (hay.includes("invalid domain") || hay.includes("malformed") || hay.includes("invalid_hostname")) {
    return "Please enter a valid domain like example.com (no https://, no paths).";
  }

  if (hay.includes("rate limit") || hay.includes("too many requests") || hay.includes("429")) {
    return "Hosting verification is temporarily busy. Please wait 30-60 seconds and try again.";
  }

  if (hay.includes("unauthorized") || hay.includes("forbidden") || hay.includes("401") || hay.includes("403")) {
    return "We couldn’t access the hosting provider to verify this domain right now. Please try again in a minute.";
  }

  if (!message) {
    return "We couldn’t complete hosting verification for this domain yet. Please try again in a minute.";
  }

  // Avoid leaking raw provider phrasing; keep it short and generic.
  return "We couldn’t complete hosting verification for this domain yet. Please double-check your DNS records and try again in a minute.";
}

function normalizeVercelDomain(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "");
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
  if (hay.includes("already assigned") || hay.includes("assigned to another")) return true;
  if (hay.includes("is currently in use") || hay.includes("is already assigned")) return true;
  if (hay.includes("belongs to a different") || hay.includes("belongs to another")) return true;
  if (hay.includes("domain taken") || hay.includes("domain_taken")) return true;
  return false;
}

function getVercelRequestId(res: Response | null): string | null {
  if (!res) return null;
  return res.headers.get("x-vercel-id") || res.headers.get("x-vercel-trace-id") || res.headers.get("x-request-id") || null;
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init).catch(() => null);
  const json = res ? await res.json().catch(() => null) : null;
  return { res, json, requestId: getVercelRequestId(res) };
}

function isLikelyScopeMismatchStatus(status: number | null | undefined): boolean {
  return status === 401 || status === 403;
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

  const normalizedDomain = normalizeVercelDomain(domain);
  if (!normalizedDomain) {
    return { ok: false, configured: true, error: "Please enter a valid domain like example.com (no https://, no paths)." };
  }

  const qpCandidates = getTeamQueryCandidates(teamId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const pid = encodeURIComponent(projectIdOrName);
  const d = encodeURIComponent(normalizedDomain);

  const attempts: any[] = [];

  for (const qp of qpCandidates) {
    const attempt: any = { qp: qp || "(none)", steps: {} };
    attempts.push(attempt);

    // If the domain already exists on the project, skip straight to verify.
    const existing = await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains/${d}${qp}`,
      {
        method: "GET",
        headers,
      },
    );
    attempt.steps.existing = { status: existing.res?.status ?? null, requestId: existing.requestId, body: existing.json };

    if (existing.res && existing.res.ok) {
      // proceed
    } else if (existing.res && existing.res.status !== 404) {
      const { code, message } = extractVercelError(existing.json);
      attempt.steps.existingError = { code, message };
      // If a teamId is wrong, retry without it.
      if (isLikelyScopeMismatchStatus(existing.res.status) && qpCandidates.length > 1) {
        continue;
      }
      return {
        ok: false,
        configured: true,
        error: `Failed to fetch hosting domain status${message ? ` (${message})` : ""}`,
        debug: { attempts },
      };
    }

    // Add domain if missing (ignore if already exists on project).
    if (!existing.res || existing.res.status === 404) {
      const addV10 = await fetchJson(`https://api.vercel.com/v10/projects/${pid}/domains${qp}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ name: normalizedDomain }),
        },
      );

      const addRes = addV10.res;
      const addJson: any = addV10.json;
      attempt.steps.addV10 = { status: addRes?.status ?? null, requestId: addV10.requestId, body: addJson };

      // Some Vercel accounts/endpoints may not support v10; fallback to v9.
      const shouldFallback = !!addRes && (addRes.status === 404 || addRes.status === 405);
      const addV9 = shouldFallback
        ? await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains${qp}`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ name: normalizedDomain }),
            },
          )
        : null;

      if (addV9) attempt.steps.addV9 = { status: addV9.res?.status ?? null, requestId: addV9.requestId, body: addV9.json };

      const finalAddRes = addV9?.res ?? addRes;
      const finalAddJson = addV9?.json ?? addJson;

      const addOk =
        !!finalAddRes &&
        (finalAddRes.ok ||
          finalAddRes.status === 409 ||
          (finalAddRes.status === 400 && isLikelyAlreadyExistsError(finalAddJson)));

      if (!addOk) {
        const { code, message } = extractVercelError(finalAddJson);
        attempt.steps.addError = { status: finalAddRes?.status ?? null, code, message };

        // Some failures are transient or caused by eventual consistency. If Vercel actually
        // added the domain (or it already exists), a follow-up GET will succeed.
        const existingAfterAdd = await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains/${d}${qp}`,
          {
            method: "GET",
            headers,
          },
        );
        attempt.steps.existingAfterAdd = {
          status: existingAfterAdd.res?.status ?? null,
          requestId: existingAfterAdd.requestId,
          body: existingAfterAdd.json,
        };

        if (existingAfterAdd.res?.ok) {
          // Proceed to verify below.
        } else {
          // If we got an auth-ish error and we have another scope candidate, retry.
          if (isLikelyScopeMismatchStatus(finalAddRes?.status) && qpCandidates.length > 1) {
            continue;
          }

          const domainInUse = isLikelyDomainInUseError(finalAddJson);
          return {
            ok: false,
            configured: true,
            error: domainInUse
              ? "This domain is already in use on another website/project. Next step: remove it from the other host/project (or use a different domain/subdomain), then try again."
              : toCustomerFacingDomainProvisioningError({ code, message }),
            debug: { attempts },
          };
        }
      }
    }

    const verifyAttempts: any[] = [];
    attempt.steps.verifyAttempts = verifyAttempts;

    for (let i = 0; i < 3; i++) {
      const verify = await fetchJson(`https://api.vercel.com/v9/projects/${pid}/domains/${d}/verify${qp}`,
        {
          method: "POST",
          headers,
        },
      );

      const verifyJson: any = verify.json;
      verifyAttempts.push({
        i,
        status: verify.res?.status ?? null,
        requestId: verify.requestId,
        body: verifyJson,
      });

      // Vercel sometimes returns a non-2xx status while still including verification hints.
      const hasVerificationPayload = verifyJson && typeof verifyJson?.verified === "boolean";
      const verifyOk = !!verify.res && (verify.res.ok || hasVerificationPayload);
      if (verifyOk) {
        return {
          ok: true,
          configured: true,
          verified: !!verifyJson?.verified,
          verification: Array.isArray(verifyJson?.verification) ? verifyJson.verification : null,
          raw: verifyJson,
        };
      }

      const status = verify.res?.status ?? null;
      const { code, message } = extractVercelError(verifyJson);
      attempt.steps.verifyError = { status, code, message };

      if (isLikelyScopeMismatchStatus(status) && qpCandidates.length > 1) {
        break;
      }

      // Give Vercel a moment for eventual consistency after adding a domain.
      if (status === 404 || status === 409 || status === 429 || (status !== null && status >= 500)) {
        const delayMs = 250 * (i + 1);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      return {
        ok: false,
        configured: true,
        error: toCustomerFacingDomainProvisioningError({ code, message }),
        debug: { attempts },
      };
    }

    // If we exhausted retries or hit a scope mismatch, allow outer loop to try another qp candidate.
    if (qpCandidates.length > 1) continue;

    const last = verifyAttempts[verifyAttempts.length - 1];
    const { message } = extractVercelError(last?.body);
    return {
      ok: false,
      configured: true,
      error: toCustomerFacingDomainProvisioningError({ code: null, message }),
      debug: { attempts },
    };
  }

  return {
    ok: false,
    configured: true,
    error: "Failed to provision/verify domain on hosting project",
    debug: { attempts },
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
