const http = require("node:http");
const BASE = "http://localhost:3000";
function request(method, path, body, cookies = "") {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        Referer: `${BASE}/portal/app/services/funnel-builder`,
      },
    }, (res) => {
      const rawCookies = res.headers["set-cookie"] || [];
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => resolve({ status: res.statusCode, body: data, cookies: rawCookies }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function tryJson(raw) { try { return JSON.parse(raw); } catch { return null; } }
(async () => {
  const slug = `calendar-auto-${Date.now().toString(36)}`;
  const loginRes = await request("POST", "/portal/api/login", { email: "admin@purelyautomation.dev", password: "admin1234" });
  const cookie = loginRes.cookies.map((c) => c.split(";")[0]).join("; ");

  const createFunnelRes = await request("POST", "/api/portal/funnel-builder/funnels", { slug, name: `Calendar Auto ${slug}` }, cookie);
  const createFunnelJson = tryJson(createFunnelRes.body);
  const funnelId = createFunnelJson?.funnel?.id || null;

  const pagesRes = funnelId
    ? await request("GET", `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, null, cookie)
    : { status: null, body: null };
  const pagesJson = tryJson(pagesRes.body);
  const page = pagesJson?.pages?.[0] || null;

  const createCalendarRes = funnelId
    ? await request("POST", "/api/portal/booking/calendars", {
        funnelId,
        funnelName: createFunnelJson?.funnel?.name || undefined,
        pageTitle: page?.title || undefined,
      }, cookie)
    : { status: null, body: null };
  const createCalendarJson = tryJson(createCalendarRes.body);

  const funnelRes = funnelId
    ? await request("GET", `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, null, cookie)
    : { status: null, body: null };
  const funnelJson = tryJson(funnelRes.body);

  const customCodeRes = funnelId && page?.id
    ? await request("POST", "/api/portal/funnel-builder/custom-code-block/generate", {
        funnelId,
        pageId: page.id,
        prompt: "Add a booking calendar step for this funnel and keep it ready to configure later.",
        currentHtml: "",
        currentCss: "",
        intentProfile: {
          pageType: "booking",
          audience: "operators evaluating automation help",
          offer: "a consultation",
          primaryCta: "Book a call"
        }
      }, cookie)
    : { status: null, body: null };
  const customCodeJson = tryJson(customCodeRes.body);

  const generatePageRes = funnelId && page?.id
    ? await request("POST", `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(page.id)}/generate-html`, {
        prompt: "Build a high-trust booking page for a consultation funnel.",
        currentHtml: "",
        contextKeys: ["hero", "proof", "cta"],
        intentProfile: {
          pageType: "booking",
          audience: "operators evaluating automation help",
          offer: "a consultation",
          primaryCta: "Book a call"
        }
      }, cookie)
    : { status: null, body: null };
  const generatePageJson = tryJson(generatePageRes.body);

  console.log(JSON.stringify({
    funnel: {
      createStatus: createFunnelRes.status,
      funnelId,
      pageId: page?.id || null,
      pageCount: Array.isArray(pagesJson?.pages) ? pagesJson.pages.length : null,
    },
    calendar: {
      status: createCalendarRes.status,
      ok: createCalendarJson?.ok ?? null,
      created: createCalendarJson?.created ?? null,
      routingUpdated: createCalendarJson?.routingUpdated ?? null,
      bookingCalendarId: createCalendarJson?.bookingCalendarId ?? createCalendarJson?.calendar?.id ?? null,
      funnelBookingCalendarId: funnelJson?.funnel?.bookingCalendarId ?? null,
      title: createCalendarJson?.calendar?.title ?? null,
    },
    customCode: {
      status: customCodeRes.status,
      ok: customCodeJson?.ok ?? null,
      question: customCodeJson?.question ?? null,
      hasActions: Array.isArray(customCodeJson?.actions) && customCodeJson.actions.length > 0,
      firstActionType: Array.isArray(customCodeJson?.actions) ? (customCodeJson.actions[0]?.type || customCodeJson.actions[0]?.block?.type || null) : null,
      summary: customCodeJson?.summary ?? null,
    },
    wholePage: {
      status: generatePageRes.status,
      ok: generatePageJson?.ok ?? null,
      question: generatePageJson?.question ?? null,
      hasPage: Boolean(generatePageJson?.page),
      editorMode: generatePageJson?.page?.editorMode ?? null,
      htmlLen: (generatePageJson?.page?.draftHtml || generatePageJson?.page?.customHtml || "").length,
      summary: generatePageJson?.aiResult?.summary ?? null,
    }
  }, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
