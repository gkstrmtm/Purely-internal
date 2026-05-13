const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = process.env.PORTAL_BASE_URL || "http://localhost:3000";
const PORTAL_VARIANT_HEADER = "x-portal-variant";

const PORTAL_LOGIN_EMAIL = process.env.PORTAL_LOGIN_EMAIL || "admin@purelyautomation.dev";
const PORTAL_LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || "admin1234";
const CREDIT_LOGIN_EMAIL = process.env.CREDIT_LOGIN_EMAIL || "credit-client@purelyautomation.dev";
const CREDIT_LOGIN_PASSWORD = process.env.CREDIT_LOGIN_PASSWORD || "credit1234";
const DEFAULT_TIMEOUT_MS = Number(process.env.AUTH_ACCESS_TIMEOUT_MS || 120000);

const SAFE_SIGNUP_DOMAIN = process.env.AUTH_SAFE_SIGNUP_DOMAIN || "example.invalid";
const SKIP_SIGNUP = process.env.AUTH_SKIP_SIGNUP === "1";
const OUTPUT_PATH = process.env.AUTH_ACCESS_OUT ? path.resolve(process.cwd(), process.env.AUTH_ACCESS_OUT) : null;

function logStep(message) {
  console.error(`[auth-access] ${message}`);
}

function parseSetCookie(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function parseCookieDirective(rawCookie) {
  const parts = String(rawCookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const first = parts[0] || "";
  const eqIndex = first.indexOf("=");
  const name = eqIndex >= 0 ? first.slice(0, eqIndex) : first;
  const value = eqIndex >= 0 ? first.slice(eqIndex + 1) : "";
  const directives = new Map();

  for (let index = 1; index < parts.length; index += 1) {
    const segment = parts[index];
    const splitIndex = segment.indexOf("=");
    if (splitIndex === -1) {
      directives.set(segment.toLowerCase(), true);
    } else {
      directives.set(segment.slice(0, splitIndex).trim().toLowerCase(), segment.slice(splitIndex + 1).trim());
    }
  }

  return { name, value, directives };
}

function applySetCookies(cookieJar, rawCookies) {
  for (const rawCookie of rawCookies) {
    const parsed = parseCookieDirective(rawCookie);
    if (!parsed.name) continue;

    const maxAge = Number(parsed.directives.get("max-age"));
    const expires = parsed.directives.get("expires");
    const isExpired =
      parsed.value === "" ||
      maxAge === 0 ||
      (typeof expires === "string" && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= Date.now());

    if (isExpired) {
      cookieJar.delete(parsed.name);
      continue;
    }

    cookieJar.set(parsed.name, parsed.value);
  }
}

function cookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function request(method, route, options = {}) {
  const url = new URL(route, BASE_URL);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const headers = {
    Accept: options.accept || "text/html,application/json;q=0.9,*/*;q=0.8",
    ...(options.jsonBody ? { "Content-Type": "application/json" } : {}),
    ...(options.cookieJar && options.cookieJar.size ? { Cookie: cookieHeader(options.cookieJar) } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: options.jsonBody ? JSON.stringify(options.jsonBody) : undefined,
    redirect: "manual",
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });

  const body = await response.text();
  const setCookie = parseSetCookie(response);
  if (options.cookieJar) {
    applySetCookies(options.cookieJar, setCookie);
  }

  return {
    status: response.status,
    body,
    headers: response.headers,
    setCookie,
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function fetchRouteWithRedirects(route, cookieJar) {
  const redirects = [];
  const visited = new Set();
  let currentRoute = route;

  for (let step = 0; step < 10; step += 1) {
    if (visited.has(currentRoute)) {
      throw new Error(`Redirect loop detected at ${currentRoute}`);
    }
    visited.add(currentRoute);

    const response = await request("GET", currentRoute, { cookieJar });
    const location = response.headers.get("location");
    if (location && [301, 302, 303, 307, 308].includes(response.status)) {
      const nextUrl = new URL(location, new URL(currentRoute, BASE_URL));
      const nextRoute = `${nextUrl.pathname}${nextUrl.search}`;
      redirects.push({ status: response.status, location: nextRoute });
      currentRoute = nextRoute;
      continue;
    }

    return {
      route,
      finalPath: currentRoute,
      finalStatus: response.status,
      redirects,
      body: response.body,
      text: cleanText(response.body),
    };
  }

  throw new Error(`Too many redirects while resolving ${route}`);
}

function createResult(flow, routeApi, expectedBehavior, actualBehavior, status, proof = {}) {
  return { flow, routeApi, expectedBehavior, actualBehavior, status, proof };
}

function redirectedTo(result, targetPath) {
  return result.finalPath === targetPath && result.redirects.some((step) => step.location === targetPath);
}

function containsAny(content, indicators) {
  return indicators.find((indicator) => content.includes(indicator)) || "";
}

function uniqueSafeEmail(prefix) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@${SAFE_SIGNUP_DOMAIN}`.toLowerCase();
}

function signupPayload(overrides = {}) {
  return {
    name: "P020 Auth Test",
    email: uniqueSafeEmail("p020-auth"),
    phone: "+15555550123",
    password: "StrongPass123!",
    businessName: "P020 Auth Validation",
    city: "Austin",
    state: "Texas",
    websiteUrl: "",
    hasWebsite: "NO",
    acquisitionMethods: ["Referrals"],
    callsPerMonthRange: "0_10",
    industry: "Home Services",
    businessModel: "Local service business",
    targetCustomer: "Local homeowners",
    brandVoice: "Clear and helpful",
    billingPreference: "credits",
    goalIds: ["appointments"],
    selectedServiceSlugs: ["booking", "inbox"],
    selectedPlanIds: ["core"],
    selectedPlanQuantities: {},
    ...overrides,
  };
}

function pad(value, width) {
  const text = String(value || "");
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

async function run() {
  logStep(`Base URL: ${BASE_URL}`);
  const results = [];

  const unauthPortal = await fetchRouteWithRedirects("/portal/app", new Map());
  results.push(
    createResult(
      "Protected portal route without session",
      "/portal/app",
      "Unauthenticated access redirects to /portal/login.",
      `${unauthPortal.finalStatus} -> ${unauthPortal.finalPath}`,
      redirectedTo(unauthPortal, "/portal/login") ? "pass" : "fail",
      { redirects: unauthPortal.redirects },
    ),
  );

  const unauthCredit = await fetchRouteWithRedirects("/credit/app", new Map());
  results.push(
    createResult(
      "Protected credit route without session",
      "/credit/app",
      "Unauthenticated access redirects to /credit/login.",
      `${unauthCredit.finalStatus} -> ${unauthCredit.finalPath}`,
      redirectedTo(unauthCredit, "/credit/login") ? "pass" : "fail",
      { redirects: unauthCredit.redirects },
    ),
  );

  const invalidPortalJar = new Map();
  const invalidPortalLogin = await request("POST", "/portal/api/login", {
    cookieJar: invalidPortalJar,
    jsonBody: { email: PORTAL_LOGIN_EMAIL, password: `${PORTAL_LOGIN_PASSWORD}-wrong` },
    headers: { [PORTAL_VARIANT_HEADER]: "portal" },
  });
  const invalidPortalJson = extractJson(invalidPortalLogin.body);
  results.push(
    createResult(
      "Invalid portal login",
      "/portal/api/login",
      "Wrong credentials return 401 with a clear error and no session cookie.",
      `${invalidPortalLogin.status} ${String(invalidPortalJson?.error || "")}`.trim(),
      invalidPortalLogin.status === 401 && String(invalidPortalJson?.error || "").includes("Invalid email or password") && invalidPortalJar.size === 0 ? "pass" : "fail",
      { setCookieCount: invalidPortalLogin.setCookie.length },
    ),
  );

  const portalJar = new Map();
  const portalLogin = await request("POST", "/portal/api/login", {
    cookieJar: portalJar,
    jsonBody: { email: PORTAL_LOGIN_EMAIL, password: PORTAL_LOGIN_PASSWORD },
    headers: { [PORTAL_VARIANT_HEADER]: "portal" },
  });
  const portalLoginJson = extractJson(portalLogin.body);
  const portalDashboard = await fetchRouteWithRedirects("/portal/app", portalJar);
  const portalRefresh = await fetchRouteWithRedirects("/portal/app", portalJar);
  const portalDashboardIndicator = containsAny(portalDashboard.text, ["Your services, billing, and automation stats.", "Dashboard"]);
  results.push(
    createResult(
      "Portal login",
      "/portal/api/login -> /portal/app",
      "Known valid portal account signs in, reaches the portal workspace, and stays authenticated on refresh.",
      `${portalLogin.status} -> ${portalDashboard.finalStatus} ${portalDashboard.finalPath} | refresh -> ${portalRefresh.finalStatus} ${portalRefresh.finalPath}`,
      portalLogin.status === 200 && portalJar.has("pa.portal.session") && portalDashboard.finalStatus === 200 && portalDashboard.finalPath === "/portal/app" && Boolean(portalDashboardIndicator) && portalRefresh.finalStatus === 200 && portalRefresh.finalPath === "/portal/app" ? "pass" : "fail",
      {
        cookieNames: Array.from(portalJar.keys()),
        defaultFrom: portalLoginJson?.defaultFrom || null,
        dashboardIndicator: portalDashboardIndicator,
      },
    ),
  );

  const creditWithPortalCookie = await fetchRouteWithRedirects("/credit/app", portalJar);
  results.push(
    createResult(
      "Portal user blocked from credit workspace",
      "/credit/app",
      "A portal-only session cannot enter the credit workspace.",
      `${creditWithPortalCookie.finalStatus} -> ${creditWithPortalCookie.finalPath}`,
      redirectedTo(creditWithPortalCookie, "/credit/login") ? "pass" : "fail",
      { redirects: creditWithPortalCookie.redirects },
    ),
  );

  const portalLogout = await request("POST", "/portal/api/logout", {
    cookieJar: portalJar,
    headers: { [PORTAL_VARIANT_HEADER]: "portal" },
  });
  const portalAfterLogout = await fetchRouteWithRedirects("/portal/app", portalJar);
  results.push(
    createResult(
      "Portal logout",
      "/portal/api/logout -> /portal/app",
      "Logout clears the portal session and protected routes stop loading afterward.",
      `${portalLogout.status} | after logout ${portalAfterLogout.finalStatus} -> ${portalAfterLogout.finalPath}`,
      portalLogout.status === 200 && !portalJar.has("pa.portal.session") && redirectedTo(portalAfterLogout, "/portal/login") ? "pass" : "fail",
      { logoutSetCookieCount: portalLogout.setCookie.length },
    ),
  );

  const creditJar = new Map();
  const creditLogin = await request("POST", "/credit/api/login", {
    cookieJar: creditJar,
    jsonBody: { email: CREDIT_LOGIN_EMAIL, password: CREDIT_LOGIN_PASSWORD },
  });
  const creditLoginJson = extractJson(creditLogin.body);
  const creditDashboard = await fetchRouteWithRedirects("/credit/app", creditJar);
  const creditRefresh = await fetchRouteWithRedirects("/credit/app", creditJar);
  const creditDashboardIndicator = containsAny(creditDashboard.text, ["Your credit services, billing, and workflow stats.", "Dashboard"]);
  results.push(
    createResult(
      "Credit login",
      "/credit/api/login -> /credit/app",
      "Known valid credit account signs in, reaches the credit workspace, and stays authenticated on refresh.",
      `${creditLogin.status} -> ${creditDashboard.finalStatus} ${creditDashboard.finalPath} | refresh -> ${creditRefresh.finalStatus} ${creditRefresh.finalPath}`,
      creditLogin.status === 200 && creditJar.has("pa.credit.session") && creditDashboard.finalStatus === 200 && creditDashboard.finalPath === "/credit/app" && Boolean(creditDashboardIndicator) && creditRefresh.finalStatus === 200 && creditRefresh.finalPath === "/credit/app" ? "pass" : "fail",
      {
        cookieNames: Array.from(creditJar.keys()),
        defaultFrom: creditLoginJson?.defaultFrom || null,
        dashboardIndicator: creditDashboardIndicator,
      },
    ),
  );

  const portalWithCreditCookie = await fetchRouteWithRedirects("/portal/app", creditJar);
  results.push(
    createResult(
      "Credit user blocked from portal workspace",
      "/portal/app",
      "A credit-only session cannot enter the main portal workspace.",
      `${portalWithCreditCookie.finalStatus} -> ${portalWithCreditCookie.finalPath}`,
      redirectedTo(portalWithCreditCookie, "/portal/login") ? "pass" : "fail",
      { redirects: portalWithCreditCookie.redirects },
    ),
  );

  const creditLogout = await request("POST", "/credit/api/logout", {
    cookieJar: creditJar,
  });
  const creditAfterLogout = await fetchRouteWithRedirects("/credit/app", creditJar);
  results.push(
    createResult(
      "Credit logout",
      "/credit/api/logout -> /credit/app",
      "Logout clears the credit session and protected routes stop loading afterward.",
      `${creditLogout.status} | after logout ${creditAfterLogout.finalStatus} -> ${creditAfterLogout.finalPath}`,
      creditLogout.status === 200 && !creditJar.has("pa.credit.session") && redirectedTo(creditAfterLogout, "/credit/login") ? "pass" : "fail",
      { logoutSetCookieCount: creditLogout.setCookie.length },
    ),
  );

  if (SKIP_SIGNUP) {
    results.push(
      createResult(
        "Portal signup",
        "/api/auth/client-signup",
        "Safe signup validation is attempted when enabled.",
        "Skipped via AUTH_SKIP_SIGNUP=1.",
        "blocked",
      ),
    );
  } else {
    const portalSignupJar = new Map();
    const portalSignupBody = signupPayload({ email: uniqueSafeEmail("p020-portal-signup") });
    const portalSignup = await request("POST", "/api/auth/client-signup", {
      cookieJar: portalSignupJar,
      jsonBody: portalSignupBody,
      headers: { [PORTAL_VARIANT_HEADER]: "portal" },
      timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 300000),
    });
    const portalSignupJson = extractJson(portalSignup.body);

    if (portalSignup.status === 200) {
      const portalOnboarding = await fetchRouteWithRedirects("/portal/app/onboarding", portalSignupJar);
      const onboardingIndicator = containsAny(portalOnboarding.text, ["Quick setup", "First, verify your email address."]);
      results.push(
        createResult(
          "Portal signup",
          "/api/auth/client-signup -> /portal/app/onboarding",
          "A safe new portal account is created, signed in, and can reach onboarding or the verification gate.",
          `${portalSignup.status} -> ${portalOnboarding.finalStatus} ${portalOnboarding.finalPath}`,
          portalSignupJar.has("pa.portal.session") && portalOnboarding.finalStatus === 200 && portalOnboarding.finalPath === "/portal/app/onboarding" && Boolean(onboardingIndicator) ? "pass" : "fail",
          {
            email: portalSignupBody.email,
            onboardingIndicator,
            requestId: portalSignupJson?.requestId || null,
          },
        ),
      );

      const creditSignupJar = new Map();
      const creditSignupBody = signupPayload({ email: uniqueSafeEmail("p020-credit-signup") });
      const creditSignup = await request("POST", "/api/auth/client-signup", {
        cookieJar: creditSignupJar,
        jsonBody: creditSignupBody,
        headers: { [PORTAL_VARIANT_HEADER]: "credit" },
        timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 300000),
      });
      const creditSignupJson = extractJson(creditSignup.body);
      if (creditSignup.status === 200) {
        const creditOnboarding = await fetchRouteWithRedirects("/credit/app/onboarding", creditSignupJar);
        const creditOnboardingIndicator = containsAny(creditOnboarding.text, ["Quick setup", "First, verify your email address."]);
        results.push(
          createResult(
            "Credit signup",
            "/api/auth/client-signup -> /credit/app/onboarding",
            "A safe new credit account is created, signed in, and can reach credit onboarding or the verification gate.",
            `${creditSignup.status} -> ${creditOnboarding.finalStatus} ${creditOnboarding.finalPath}`,
            creditSignupJar.has("pa.credit.session") && creditOnboarding.finalStatus === 200 && creditOnboarding.finalPath === "/credit/app/onboarding" && Boolean(creditOnboardingIndicator) ? "pass" : "fail",
            {
              email: creditSignupBody.email,
              onboardingIndicator: creditOnboardingIndicator,
              requestId: creditSignupJson?.requestId || null,
            },
          ),
        );
      } else {
        results.push(
          createResult(
            "Credit signup",
            "/api/auth/client-signup",
            "A safe new credit account can be created when signup is enabled and the environment allows it.",
            `${creditSignup.status} ${String(creditSignupJson?.error || "")}`.trim(),
            creditSignup.status === 403 || creditSignup.status === 503 ? "blocked" : "fail",
            { requestId: creditSignupJson?.requestId || null, email: creditSignupBody.email },
          ),
        );
      }
    } else {
      results.push(
        createResult(
          "Portal signup",
          "/api/auth/client-signup",
          "A safe new portal account can be created when signup is enabled and the environment allows it.",
          `${portalSignup.status} ${String(portalSignupJson?.error || "")}`.trim(),
          portalSignup.status === 403 || portalSignup.status === 503 ? "blocked" : "fail",
          { requestId: portalSignupJson?.requestId || null, email: portalSignupBody.email },
        ),
      );
    }
  }

  const header = `${pad("status", 8)} ${pad("flow", 34)} ${pad("route/API", 42)} ${pad("expected", 44)} actual`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const result of results) {
    console.log(
      `${pad(result.status, 8)} ${pad(result.flow, 34)} ${pad(result.routeApi, 42)} ${pad(result.expectedBehavior, 44)} ${result.actualBehavior}`,
    );
  }

  const failed = results.filter((result) => result.status === "fail");
  const blocked = results.filter((result) => result.status === "blocked");
  const output = {
    ok: failed.length === 0,
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    summary: {
      pass: results.filter((result) => result.status === "pass").length,
      fail: failed.length,
      blocked: blocked.length,
      total: results.length,
    },
    results,
  };

  if (OUTPUT_PATH) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    logStep(`Wrote report to ${OUTPUT_PATH}`);
  }

  if (failed.length) {
    console.error("\nauth-access-validation: FAIL");
    for (const result of failed) {
      console.error(`- ${result.flow}: ${result.actualBehavior}`);
    }
    if (blocked.length) {
      console.error(`Blocked: ${blocked.map((result) => result.flow).join(", ")}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\nauth-access-validation: OK (${results.length} checks, ${blocked.length} blocked)`);
}

run().catch((error) => {
  console.error(`auth-access-validation: FAIL\n${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
});