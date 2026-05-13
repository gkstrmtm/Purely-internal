const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = process.env.PORTAL_BASE_URL || "http://localhost:3000";
const PORTAL_LOGIN_EMAIL = process.env.PORTAL_LOGIN_EMAIL || "admin@purelyautomation.dev";
const PORTAL_LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || "admin1234";
const CREDIT_LOGIN_EMAIL = process.env.CREDIT_LOGIN_EMAIL || "credit-client@purelyautomation.dev";
const CREDIT_LOGIN_PASSWORD = process.env.CREDIT_LOGIN_PASSWORD || "credit1234";
const INCLUDE_PREFERRED = process.env.ROUTE_SMOKE_INCLUDE_PREFERRED !== "0";
const OUTPUT_PATH = process.env.ROUTE_SMOKE_OUT ? path.resolve(process.cwd(), process.env.ROUTE_SMOKE_OUT) : null;

const REQUIRED_ROUTES = [
  {
    kind: "required",
    session: "portal",
    route: "/portal/app",
    expectedFinalPath: "/portal/app",
    expectedStatus: 200,
    indicators: ["Your services, billing, and automation stats.", "Dashboard"],
  },
  {
    kind: "required",
    session: "portal",
    route: "/portal/app/services",
    expectedFinalPath: "/portal/app/services",
    expectedStatus: 200,
    indicators: ["Everything available in your portal.", "Services"],
  },
  {
    kind: "required",
    session: "portal",
    route: "/portal/app/services/credit-reports",
    expectedFinalPath: "/portal/app/services/credit-reports",
    expectedStatus: 404,
    indicators: ["Page not found"],
  },
  {
    kind: "required",
    session: "portal",
    route: "/portal/app/services/dispute-letters",
    expectedFinalPath: "/portal/app/services/dispute-letters",
    expectedStatus: 404,
    indicators: ["Page not found"],
  },
  {
    kind: "required",
    session: "credit",
    route: "/credit/app",
    expectedFinalPath: "/credit/app",
    expectedStatus: 200,
    indicators: ["Your credit services, billing, and workflow stats.", "Dashboard"],
  },
  {
    kind: "required",
    session: "credit",
    route: "/credit/app/services",
    expectedFinalPath: "/credit/app/services",
    expectedStatus: 200,
    indicators: ["Everything available in your credit workspace.", "Services"],
  },
  {
    kind: "required",
    session: "credit",
    route: "/credit/app/services/credit-reports",
    expectedFinalPath: "/credit/app/services/credit-reports",
    expectedStatus: 200,
    indicators: ["Credit reports"],
  },
  {
    kind: "required",
    session: "credit",
    route: "/credit/app/services/dispute-letters",
    expectedFinalPath: "/credit/app/services/dispute-letters",
    expectedStatus: 200,
    indicators: ["Dispute letters"],
  },
  {
    kind: "required",
    session: "credit",
    route: "/credit/app/disputes",
    expectedFinalPath: "/credit/app/services/dispute-letters",
    expectedStatus: 200,
    expectRedirect: true,
    indicators: ["Dispute letters"],
  },
];

const PREFERRED_ROUTES = [
  {
    kind: "preferred",
    session: "portal",
    route: "/portal/app/people/contacts",
    expectedFinalPath: "/portal/app/people/contacts",
    expectedStatus: 200,
    indicators: ["People", "Search contacts"],
  },
  {
    kind: "preferred",
    session: "portal",
    route: "/portal/app/tasks",
    expectedFinalPath: "/portal/app/services/tasks",
    expectedStatus: 200,
    expectRedirect: true,
    indicators: ["Internal tasks for your portal team.", "Tasks"],
  },
  {
    kind: "preferred",
    session: "portal",
    route: "/portal/app/settings",
    expectedFinalPath: "/portal/app/settings",
    expectedStatus: 200,
    indicators: ["Settings"],
  },
  {
    kind: "preferred",
    session: "credit",
    route: "/credit/app/people/contacts",
    expectedFinalPath: "/credit/app/people/contacts",
    expectedStatus: 200,
    indicators: ["People", "Search contacts"],
  },
  {
    kind: "preferred",
    session: "credit",
    route: "/credit/app/tasks",
    expectedFinalPath: "/credit/app/services/tasks",
    expectedStatus: 200,
    expectRedirect: true,
    indicators: ["Internal tasks for your portal team.", "Tasks"],
  },
  {
    kind: "preferred",
    session: "credit",
    route: "/credit/app/settings",
    expectedFinalPath: "/credit/app/settings",
    expectedStatus: 200,
    indicators: ["Settings"],
  },
];

function logStep(message) {
  console.error(`[route-smoke] ${message}`);
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

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match ? match[1] : "");
}

function extractH1(html) {
  const match = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return cleanText(match ? match[1] : "");
}

function parseSetCookie(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function cookieHeaderFromSetCookie(rawCookies) {
  return rawCookies.map((item) => String(item).split(";")[0]).join("; ");
}

async function request(method, route, options = {}) {
  const url = new URL(route, BASE_URL);
  const headers = {
    Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    ...(options.jsonBody ? { "Content-Type": "application/json" } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: options.jsonBody ? JSON.stringify(options.jsonBody) : undefined,
    redirect: "manual",
  });
  const body = await response.text();

  return {
    status: response.status,
    body,
    headers: response.headers,
    setCookie: parseSetCookie(response),
  };
}

async function loginPortal() {
  const response = await request("POST", "/portal/api/login", {
    jsonBody: {
      email: PORTAL_LOGIN_EMAIL,
      password: PORTAL_LOGIN_PASSWORD,
    },
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    cookie: cookieHeaderFromSetCookie(response.setCookie),
    body: response.body,
  };
}

async function loginCredit() {
  const response = await request("POST", "/credit/api/login", {
    jsonBody: {
      email: CREDIT_LOGIN_EMAIL,
      password: CREDIT_LOGIN_PASSWORD,
    },
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    cookie: cookieHeaderFromSetCookie(response.setCookie),
    body: response.body,
  };
}

async function fetchRouteWithRedirects(route, cookie) {
  const redirects = [];
  const visited = new Set();
  let currentRoute = route;

  for (let step = 0; step < 10; step += 1) {
    if (visited.has(currentRoute)) {
      throw new Error(`Redirect loop detected at ${currentRoute}`);
    }
    visited.add(currentRoute);

    const response = await request("GET", currentRoute, { cookie });
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
      title: extractTitle(response.body),
      h1: extractH1(response.body),
      text: cleanText(response.body),
    };
  }

  throw new Error(`Too many redirects while resolving ${route}`);
}

function findIndicator(content, indicators) {
  return indicators.find((indicator) => content.includes(indicator)) || "";
}

function formatRedirects(redirects) {
  if (!redirects.length) return "none";
  return redirects.map((entry) => `${entry.status}:${entry.location}`).join(" -> ");
}

function pad(value, width) {
  const text = String(value || "");
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

async function run() {
  logStep(`Base URL: ${BASE_URL}`);

  const [portalAuth, creditAuth] = await Promise.all([loginPortal(), loginCredit()]);
  if (!portalAuth.ok) {
    throw new Error(`Portal login failed with status ${portalAuth.status}: ${portalAuth.body}`);
  }
  if (!creditAuth.ok) {
    throw new Error(`Credit login failed with status ${creditAuth.status}: ${creditAuth.body}`);
  }

  const routes = INCLUDE_PREFERRED ? [...REQUIRED_ROUTES, ...PREFERRED_ROUTES] : [...REQUIRED_ROUTES];
  const results = [];

  for (const route of routes) {
    logStep(`Checking ${route.route}`);
    const cookie = route.session === "credit" ? creditAuth.cookie : portalAuth.cookie;
    const resolved = await fetchRouteWithRedirects(route.route, cookie);
    const searchableContent = [resolved.text, resolved.h1, resolved.title].filter(Boolean).join("\n");
    const matchedIndicator = findIndicator(searchableContent, route.indicators);

    const issues = [];
    if (resolved.finalPath !== route.expectedFinalPath) {
      issues.push(`expected final path ${route.expectedFinalPath} but got ${resolved.finalPath}`);
    }
    if (resolved.finalStatus !== route.expectedStatus) {
      issues.push(`expected status ${route.expectedStatus} but got ${resolved.finalStatus}`);
    }
    if (route.expectRedirect && !resolved.redirects.length) {
      issues.push("expected redirect but none occurred");
    }
    if (!route.expectRedirect && resolved.redirects.length && route.expectedFinalPath === route.route) {
      issues.push(`unexpected redirect: ${formatRedirects(resolved.redirects)}`);
    }
    if (!matchedIndicator) {
      issues.push(`none of the expected indicators were found: ${route.indicators.join(", ")}`);
    }

    results.push({
      ...route,
      ok: issues.length === 0,
      finalPath: resolved.finalPath,
      finalStatus: resolved.finalStatus,
      redirectBehavior: formatRedirects(resolved.redirects),
      indicator: matchedIndicator || resolved.h1 || resolved.title || "",
      title: resolved.title,
      h1: resolved.h1,
      issues,
    });
  }

  const header = `${pad("kind", 9)} ${pad("session", 7)} ${pad("route", 38)} ${pad("status", 6)} ${pad("final", 38)} ${pad("indicator", 34)} redirects`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const result of results) {
    console.log(
      `${pad(result.kind, 9)} ${pad(result.session, 7)} ${pad(result.route, 38)} ${pad(result.finalStatus, 6)} ${pad(result.finalPath, 38)} ${pad(result.indicator, 34)} ${result.redirectBehavior}`,
    );
  }

  const failed = results.filter((result) => !result.ok);
  const output = {
    ok: failed.length === 0,
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    includePreferred: INCLUDE_PREFERRED,
    results,
  };

  if (OUTPUT_PATH) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    logStep(`Wrote report to ${OUTPUT_PATH}`);
  }

  if (failed.length) {
    console.error("\nroute-browser-smoke: FAIL");
    for (const result of failed) {
      console.error(`- ${result.route}: ${result.issues.join("; ")}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\nroute-browser-smoke: OK (${results.length} routes)`);
}

run().catch((error) => {
  console.error(`route-browser-smoke: FAIL\n${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
});