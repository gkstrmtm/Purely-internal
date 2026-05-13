const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = process.env.PORTAL_BASE_URL || "http://localhost:3000";
const PORTAL_LOGIN_EMAIL = process.env.PORTAL_LOGIN_EMAIL || "admin@purelyautomation.dev";
const PORTAL_LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || "admin1234";
const CREDIT_LOGIN_EMAIL = process.env.CREDIT_LOGIN_EMAIL || "credit-client@purelyautomation.dev";
const CREDIT_LOGIN_PASSWORD = process.env.CREDIT_LOGIN_PASSWORD || "credit1234";
const REQUEST_TIMEOUT_MS = Number(process.env.JOURNEY_SMOKE_TIMEOUT_MS || 30000);
const LOGIN_TIMEOUT_MS = Number(process.env.JOURNEY_SMOKE_LOGIN_TIMEOUT_MS || 60000);
const OUTPUT_PATH = process.env.JOURNEY_SMOKE_OUT ? path.resolve(process.cwd(), process.env.JOURNEY_SMOKE_OUT) : null;

function logStep(message) {
  console.error(`[journey-smoke] ${message}`);
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
    Accept: options.accept || "text/html,application/json;q=0.9,*/*;q=0.8",
    ...(options.jsonBody ? { "Content-Type": "application/json" } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: options.jsonBody ? JSON.stringify(options.jsonBody) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(Number(options.timeoutMs || REQUEST_TIMEOUT_MS)),
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
    timeoutMs: LOGIN_TIMEOUT_MS,
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
    timeoutMs: LOGIN_TIMEOUT_MS,
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

async function fetchSingleRoute(route, cookie) {
  const response = await request("GET", route, { cookie });
  return {
    status: response.status,
    location: response.headers.get("location") || null,
    body: response.body,
    title: extractTitle(response.body),
    h1: extractH1(response.body),
    text: cleanText(response.body),
  };
}

function normalizeJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function getJson(route, cookie) {
  const response = await request("GET", route, {
    cookie,
    accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  });
  return {
    status: response.status,
    json: normalizeJson(response.body),
    body: response.body,
  };
}

function formatRedirects(redirects) {
  if (!redirects.length) return "none";
  return redirects.map((entry) => `${entry.status}:${entry.location}`).join(" -> ");
}

function hasAllIndicators(content, indicators = []) {
  return indicators.every((indicator) => content.includes(indicator));
}

function findAnyIndicator(content, indicators = []) {
  return indicators.find((indicator) => content.includes(indicator)) || "";
}

function pad(value, width) {
  const text = String(value || "");
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

function summarizeActualBehavior(routeResult, matchedAny) {
  const parts = [`${routeResult.finalStatus} -> ${routeResult.finalPath}`];
  if (matchedAny) parts.push(`matched: ${matchedAny}`);
  if (routeResult.redirects.length) parts.push(`redirects: ${formatRedirects(routeResult.redirects)}`);
  return parts.join(" | ");
}

async function runRouteJourney(definition, cookies) {
  const cookie = cookies[definition.session];
  const routeResult = await fetchRouteWithRedirects(definition.route, cookie);
  const searchableContent = [routeResult.text, routeResult.h1, routeResult.title].filter(Boolean).join("\n");
  const issues = [];

  if (definition.expectedFinalPath && routeResult.finalPath !== definition.expectedFinalPath) {
    issues.push(`expected final path ${definition.expectedFinalPath} but got ${routeResult.finalPath}`);
  }
  if (typeof definition.expectedStatus === "number" && routeResult.finalStatus !== definition.expectedStatus) {
    issues.push(`expected status ${definition.expectedStatus} but got ${routeResult.finalStatus}`);
  }
  if (definition.expectRedirect && !routeResult.redirects.length) {
    issues.push("expected redirect but none occurred");
  }

  const matchedAny = findAnyIndicator(searchableContent, definition.anyIndicators || []);
  if ((definition.allIndicators || []).length && !hasAllIndicators(searchableContent, definition.allIndicators)) {
    issues.push(`missing required indicators: ${(definition.allIndicators || []).join(", ")}`);
  }
  if ((definition.anyIndicators || []).length && !matchedAny) {
    issues.push(`none of the acceptable indicators were found: ${(definition.anyIndicators || []).join(", ")}`);
  }

  return {
    journeyName: definition.name,
    routes: [definition.route],
    expectedBehavior: definition.expectedBehavior,
    actualBehavior: summarizeActualBehavior(routeResult, matchedAny),
    status: issues.length ? "fail" : "pass",
    issues,
    proof: {
      finalPath: routeResult.finalPath,
      finalStatus: routeResult.finalStatus,
      redirectBehavior: formatRedirects(routeResult.redirects),
      h1: routeResult.h1,
      title: routeResult.title,
      matchedIndicator: matchedAny,
    },
  };
}

async function runCreditDetailJourney(definition, cookies) {
  const cookie = cookies.credit;
  const discovery = await getJson(definition.discoveryApi, cookie);
  const records = Array.isArray(discovery.json?.[definition.discoveryKey]) ? discovery.json[definition.discoveryKey] : [];
  const firstRecord = records[0] || null;

  if (!firstRecord?.id) {
    return {
      journeyName: definition.name,
      routes: [definition.listRoute],
      expectedBehavior: definition.expectedBehavior,
      actualBehavior: `Blocked: no seeded records returned by ${definition.discoveryApi}.`,
      status: "blocked",
      issues: [],
      proof: {
        discoveryApi: definition.discoveryApi,
        discoveryStatus: discovery.status,
        discoveredCount: records.length,
      },
    };
  }

  const route = `${definition.routePrefix}/${encodeURIComponent(firstRecord.id)}`;
  const routeResult = await fetchRouteWithRedirects(route, cookie);
  const searchableContent = [routeResult.text, routeResult.h1, routeResult.title].filter(Boolean).join("\n");
  const matchedAny = findAnyIndicator(searchableContent, definition.anyIndicators || []);
  const issues = [];

  if (routeResult.finalPath !== route) {
    issues.push(`expected final path ${route} but got ${routeResult.finalPath}`);
  }
  if (routeResult.finalStatus !== 200) {
    issues.push(`expected status 200 but got ${routeResult.finalStatus}`);
  }
  if ((definition.allIndicators || []).length && !hasAllIndicators(searchableContent, definition.allIndicators)) {
    issues.push(`missing required indicators: ${(definition.allIndicators || []).join(", ")}`);
  }
  if ((definition.anyIndicators || []).length && !matchedAny) {
    issues.push(`none of the acceptable indicators were found: ${(definition.anyIndicators || []).join(", ")}`);
  }

  return {
    journeyName: definition.name,
    routes: [definition.listRoute, route],
    expectedBehavior: definition.expectedBehavior,
    actualBehavior: summarizeActualBehavior(routeResult, matchedAny),
    status: issues.length ? "fail" : "pass",
    issues,
    proof: {
      discoveryApi: definition.discoveryApi,
      discoveryStatus: discovery.status,
      discoveredCount: records.length,
      discoveredId: firstRecord.id,
      finalPath: routeResult.finalPath,
      finalStatus: routeResult.finalStatus,
      h1: routeResult.h1,
      title: routeResult.title,
      matchedIndicator: matchedAny,
    },
  };
}

async function runRedirectJourney(definition, cookies) {
  const cookie = cookies[definition.session];
  const response = await fetchSingleRoute(definition.route, cookie);
  const nextPath = response.location ? new URL(response.location, BASE_URL).pathname + new URL(response.location, BASE_URL).search : null;
  const searchableContent = [response.text, response.h1, response.title].filter(Boolean).join("\n");
  const matchedAny = findAnyIndicator(searchableContent, definition.anyIndicators || []);
  const issues = [];

  if (!response.location) {
    issues.push("expected redirect location but none occurred");
  }
  if (typeof definition.expectedStatus === "number" && response.status !== definition.expectedStatus) {
    issues.push(`expected status ${definition.expectedStatus} but got ${response.status}`);
  }
  if (definition.expectedFinalPath && nextPath !== definition.expectedFinalPath) {
    issues.push(`expected redirect target ${definition.expectedFinalPath} but got ${nextPath || "<none>"}`);
  }
  if ((definition.anyIndicators || []).length && !matchedAny && response.status < 300) {
    issues.push(`none of the acceptable indicators were found: ${(definition.anyIndicators || []).join(", ")}`);
  }

  return {
    journeyName: definition.name,
    routes: [definition.route],
    expectedBehavior: definition.expectedBehavior,
    actualBehavior: response.location
      ? `${response.status} redirect -> ${nextPath}`
      : `${response.status} with no redirect${matchedAny ? ` | matched: ${matchedAny}` : ""}`,
    status: issues.length ? "fail" : "pass",
    issues,
    proof: {
      finalStatus: response.status,
      redirectLocation: nextPath,
      h1: response.h1,
      title: response.title,
      matchedIndicator: matchedAny,
    },
  };
}

const JOURNEYS = [
  {
    type: "route",
    name: "Portal dashboard",
    session: "portal",
    route: "/portal/app",
    expectedFinalPath: "/portal/app",
    expectedStatus: 200,
    anyIndicators: ["Your services, billing, and automation stats.", "Dashboard"],
    expectedBehavior: "Dashboard loads for the main portal and exposes the top-level operator surface.",
  },
  {
    type: "route",
    name: "Portal services",
    session: "portal",
    route: "/portal/app/services",
    expectedFinalPath: "/portal/app/services",
    expectedStatus: 200,
    allIndicators: ["Everything available in your portal.", "Services"],
    anyIndicators: ["Ready", "Locked", "Open service", "Unlock in Billing", "Checking readiness"],
    expectedBehavior: "Services page loads and shows access or readiness state labels for the main portal.",
  },
  {
    type: "route",
    name: "Portal people contacts",
    session: "portal",
    route: "/portal/app/people/contacts",
    expectedFinalPath: "/portal/app/people/contacts",
    expectedStatus: 200,
    anyIndicators: ["People", "Search contacts"],
    expectedBehavior: "People or contacts surface loads for the main portal.",
  },
  {
    type: "route",
    name: "Portal inbox",
    session: "portal",
    route: "/portal/app/services/inbox",
    expectedFinalPath: "/portal/app/services/inbox/email",
    expectedStatus: 200,
    expectRedirect: true,
    anyIndicators: ["Inbox / Outbox", "Email", "SMS", "No conversations", "No messages", "Connect"],
    expectedBehavior: "Inbox route loads or shows an honest empty or setup state without implying active communications.",
  },
  {
    type: "route",
    name: "Portal funnel builder",
    session: "portal",
    route: "/portal/app/services/funnel-builder",
    expectedFinalPath: "/portal/app/services/funnel-builder",
    expectedStatus: 200,
    anyIndicators: ["Funnel Builder", "Funnels", "Create funnel"],
    expectedBehavior: "Funnel Builder route loads for the main portal.",
  },
  {
    type: "route",
    name: "Portal booking",
    session: "portal",
    route: "/portal/app/services/booking",
    expectedFinalPath: "/portal/app/services/booking",
    expectedStatus: 200,
    anyIndicators: ["Unlock Booking Automation", "Turn this service on in Billing", "Availability", "Reminders", "Follow-up", "Booking"],
    expectedBehavior: "Booking route loads and shows either the booking surface or an honest lock or setup direction toward availability or reminders configuration.",
  },
  {
    type: "route",
    name: "Portal reporting",
    session: "portal",
    route: "/portal/app/services/reporting",
    expectedFinalPath: "/portal/app/services/reporting",
    expectedStatus: 200,
    allIndicators: ["Currently included", "Not included yet"],
    anyIndicators: ["This page shows the service activity Purely currently records across the main portal.", "Reporting"],
    expectedBehavior: "Reporting loads with main-portal coverage boundaries and included or not-included sections.",
  },
  {
    type: "route",
    name: "Credit dashboard",
    session: "credit",
    route: "/credit/app",
    expectedFinalPath: "/credit/app",
    expectedStatus: 200,
    anyIndicators: ["Your credit services, billing, and workflow stats.", "Dashboard"],
    expectedBehavior: "Dashboard loads for the credit workspace with credit-specific context.",
  },
  {
    type: "route",
    name: "Credit services",
    session: "credit",
    route: "/credit/app/services",
    expectedFinalPath: "/credit/app/services",
    expectedStatus: 200,
    allIndicators: ["Everything available in your credit workspace.", "Services"],
    anyIndicators: ["Track client messages, document requests, and dispute follow-up in one inbox.", "Import report JSON, review items, and track dispute work.", "Checking readiness", "Open service"],
    expectedBehavior: "Services page loads for the credit workspace with credit-aware service copy and readiness state messaging.",
  },
  {
    type: "route",
    name: "Credit reports list",
    session: "credit",
    route: "/credit/app/services/credit-reports",
    expectedFinalPath: "/credit/app/services/credit-reports",
    expectedStatus: 200,
    allIndicators: ["Credit reports", "Import report"],
    anyIndicators: ["configured provider API key and connection", "Import report JSON", "Manual import"],
    expectedBehavior: "Credit Reports loads and shows the manual JSON import boundary plus the live-provider-unavailable boundary.",
  },
  {
    type: "credit-detail",
    name: "Credit reports detail",
    listRoute: "/credit/app/services/credit-reports",
    discoveryApi: "/api/portal/credit/reports",
    discoveryKey: "reports",
    routePrefix: "/credit/app/services/credit-reports",
    allIndicators: ["Credit reports"],
    anyIndicators: ["Report items", "Imported JSON", "Manual import", "Workflow", "Review"],
    expectedBehavior: "A seeded credit report detail route loads when report demo data exists; otherwise the journey is explicitly blocked.",
  },
  {
    type: "route",
    name: "Dispute letters list",
    session: "credit",
    route: "/credit/app/services/dispute-letters",
    expectedFinalPath: "/credit/app/services/dispute-letters",
    expectedStatus: 200,
    allIndicators: ["Dispute letters", "Workflow boundary"],
    anyIndicators: ["Generating a letter creates a draft for human review.", "No dispute letter drafts yet.", "Marked mailed", "PDF ready"],
    expectedBehavior: "Dispute Letters loads and shows the draft, PDF, and manual-mail boundary instead of implying automatic submission.",
  },
  {
    type: "credit-detail",
    name: "Dispute letters detail",
    listRoute: "/credit/app/services/dispute-letters",
    discoveryApi: "/api/portal/credit/disputes",
    discoveryKey: "letters",
    routePrefix: "/credit/app/services/dispute-letters",
    allIndicators: ["Workflow boundary"],
    anyIndicators: ["Generate PDF", "Regenerate PDF", "Mark as mailed manually", "Review before sending", "Draft letter"],
    expectedBehavior: "A seeded dispute-letter detail route loads when draft demo data exists; otherwise the journey is explicitly blocked.",
  },
  {
    type: "route",
    name: "Credit reporting",
    session: "credit",
    route: "/credit/app/services/reporting",
    expectedFinalPath: "/credit/app/services/reporting",
    expectedStatus: 200,
    allIndicators: ["Currently included", "Not included yet"],
    anyIndicators: ["This page shows the activity Purely currently records inside the credit workspace.", "Reporting"],
    expectedBehavior: "Reporting loads for the credit workspace with credit-aware included or not-included boundaries.",
  },
  {
    type: "redirect",
    name: "Portal follow-up redirect",
    session: "portal",
    route: "/portal/app/services/follow-up",
    expectedFinalPath: "/portal/app/services/booking?tab=follow-up",
    expectedStatus: 307,
    expectedBehavior: "The hidden follow-up route redirects into the Booking parent surface for the main portal.",
  },
  {
    type: "redirect",
    name: "Credit follow-up redirect",
    session: "credit",
    route: "/credit/app/services/follow-up",
    expectedFinalPath: "/credit/app/services/booking?tab=follow-up",
    expectedStatus: 307,
    expectedBehavior: "The hidden follow-up route redirects into the Booking parent surface for the credit workspace.",
  },
  {
    type: "redirect",
    name: "Portal missed-call-textback redirect",
    session: "portal",
    route: "/portal/app/services/missed-call-textback",
    expectedFinalPath: "/portal/app/services/ai-receptionist?tab=missed-call-textback",
    expectedStatus: 307,
    expectedBehavior: "The hidden missed-call-textback route redirects into the AI Receptionist parent surface for the main portal.",
  },
  {
    type: "redirect",
    name: "Credit missed-call-textback redirect",
    session: "credit",
    route: "/credit/app/services/missed-call-textback",
    expectedFinalPath: "/credit/app/services/ai-receptionist?tab=missed-call-textback",
    expectedStatus: 307,
    expectedBehavior: "The hidden missed-call-textback route redirects into the AI Receptionist parent surface for the credit workspace.",
  },
];

async function run() {
  logStep(`Base URL: ${BASE_URL}`);

  const [portalAuth, creditAuth] = await Promise.all([loginPortal(), loginCredit()]);
  if (!portalAuth.ok) {
    throw new Error(`Portal login failed with status ${portalAuth.status}: ${portalAuth.body}`);
  }
  if (!creditAuth.ok) {
    throw new Error(`Credit login failed with status ${creditAuth.status}: ${creditAuth.body}`);
  }

  const cookies = {
    portal: portalAuth.cookie,
    credit: creditAuth.cookie,
  };

  const results = [];
  for (const journey of JOURNEYS) {
    logStep(`Checking ${journey.name}`);
    let result;
    try {
      if (journey.type === "credit-detail") {
        result = await runCreditDetailJourney(journey, cookies);
      } else if (journey.type === "redirect") {
        result = await runRedirectJourney(journey, cookies);
      } else {
        result = await runRouteJourney(journey, cookies);
      }
    } catch (error) {
      result = {
        journeyName: journey.name,
        routes: journey.type === "credit-detail" ? [journey.listRoute] : [journey.route],
        expectedBehavior: journey.expectedBehavior,
        actualBehavior: `Error: ${error && error.message ? error.message : String(error)}`,
        status: "fail",
        issues: [error && error.message ? error.message : String(error)],
        proof: {},
      };
    }
    results.push(result);
  }

  const header = `${pad("status", 8)} ${pad("journey", 36)} ${pad("routes", 62)} actual`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const result of results) {
    console.log(`${pad(result.status, 8)} ${pad(result.journeyName, 36)} ${pad(result.routes.join(" | "), 62)} ${result.actualBehavior}`);
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
    console.error("\njourney-browser-smoke: FAIL");
    for (const result of failed) {
      console.error(`- ${result.journeyName}: ${result.issues.join("; ")}`);
    }
    if (blocked.length) {
      console.error(`Blocked journeys: ${blocked.map((result) => result.journeyName).join(", ")}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\njourney-browser-smoke: OK (${results.length} journeys, ${blocked.length} blocked)`);
}

run().catch((error) => {
  console.error(`journey-browser-smoke: FAIL\n${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
});