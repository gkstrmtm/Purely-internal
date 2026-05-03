const http = require("node:http");
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";
const FREEFORM_BOOKING_PROMPT = "Need this to feel premium and grounded, earn trust quickly, and get serious operators onto a call without making them dig.";
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
(async () => {
  const loginRes = await request("POST", "/portal/api/login", { email: "admin@purelyautomation.dev", password: "admin1234" });
  const cookie = loginRes.cookies.map((c) => c.split(";")[0]).join("; ");
  const slug = `implement-booking-${Date.now()}`;
  const createRes = await request("POST", "/api/portal/funnel-builder/funnels", {
    slug,
    name: `Implement Booking ${slug}`,
    pageType: "booking",
    funnelGoal: "Turn qualified operators into booked strategy calls",
    offer: "a strategic automation consultation",
    audience: "operators evaluating automation help",
    primaryCta: "Book a call"
  }, cookie);
  const createJson = JSON.parse(createRes.body);
  const funnelId = createJson.funnel.id;
  const pagesRes = await request("GET", `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, null, cookie);
  const pageId = JSON.parse(pagesRes.body).pages[0].id;
  const genStartedAt = Date.now();
  const genRes = await request("POST", `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(pageId)}/generate-html`, {
    prompt: FREEFORM_BOOKING_PROMPT,
    currentHtml: "",
    contextKeys: ["hero", "proof", "cta"],
    intentProfile: {
      pageType: "booking",
      audience: "operators evaluating automation help",
      offer: "a strategic automation consultation",
      primaryCta: "Book a call"
    }
  }, cookie);
  const genJson = JSON.parse(genRes.body);
  const reviewedHtml = String(genJson.page?.draftHtml || genJson.page?.customHtml || "");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
    await page.setContent(reviewedHtml, { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch {}
      }
    });
    const imageBuffer = await page.screenshot({ type: "png", fullPage: true });
    const previewImageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
    const reviewRes = await request("POST", "/api/portal/funnel-builder/visual-review", {
      funnelId,
      pageId,
      surface: "source",
      prompt: FREEFORM_BOOKING_PROMPT,
      html: reviewedHtml,
      css: "",
      previewImageDataUrl,
      intentProfile: {
        pageType: "booking",
        audience: "operators evaluating automation help",
        offer: "a strategic automation consultation",
        primaryCta: "Book a call"
      }
    }, cookie);
    const reviewJson = JSON.parse(reviewRes.body);
    console.log(JSON.stringify({
      createStatus: createRes.status,
      generateStatus: genRes.status,
      reviewStatus: reviewRes.status,
      genMs: Date.now() - genStartedAt,
      htmlLen: reviewedHtml.length,
      aiSummary: genJson.aiResult?.summary || null,
      routeError: genJson.error || null,
      visualReviewed: reviewJson.visualReviewed,
      warningCount: Array.isArray(reviewJson.warnings) ? reviewJson.warnings.length : null,
      firstWarning: Array.isArray(reviewJson.warnings) ? reviewJson.warnings[0] || null : null,
      warnings: Array.isArray(reviewJson.warnings) ? reviewJson.warnings : null,
      strengths: Array.isArray(reviewJson.strengths) ? reviewJson.strengths : null,
      htmlPreview: reviewedHtml.slice(0, 500)
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
