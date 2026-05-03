const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const BASE_URL = process.env.PORTAL_BASE_URL || "http://localhost:3000";
const LOGIN_EMAIL = process.env.PORTAL_LOGIN_EMAIL || "admin@purelyautomation.dev";
const LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || "admin1234";
const OUTPUT_PATH = process.env.FUNNEL_SCORECARD_OUT
  ? path.resolve(process.cwd(), process.env.FUNNEL_SCORECARD_OUT)
  : null;
const REQUEST_TIMEOUT_MS = Number(process.env.FUNNEL_SCORECARD_TIMEOUT_MS || 210000);

const SCORE_DIMENSIONS = [
  "intentInterpretation",
  "localEditPrecision",
  "structuralConversionQuality",
  "proofCredibility",
  "leadDataCaptureReadiness",
  "bookingOrCheckoutReadiness",
  "publishOperationalReadiness",
  "visualAutonomy",
  "artDirectionStrength",
  "spatialDiscipline",
];

const FREEFORM_BOOKING_PROMPT = "Need this to feel premium and grounded, earn trust quickly, and get serious operators onto a call without making them dig.";
const DISCUSS_TRUTHFULNESS_PROMPT = "Tell me exactly what you would change on this page and do not mention changes that are already true on the current page.";
const NARROW_EDIT_PROMPT = "Change only the primary CTA copy to Book your strategy call and keep everything else structurally the same.";

function request(method, pathname, body, cookies = "") {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...(cookies ? { Cookie: cookies } : {}),
          Referer: `${BASE_URL}/portal/app/services/funnel-builder`,
        },
      },
      (res) => {
        const rawCookies = res.headers["set-cookie"] || [];
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: data,
            cookies: rawCookies,
          });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${pathname}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function logStep(label) {
  console.error(`[scorecard] ${label}`);
}

function parseJson(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function hasAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(String(value || "")));
}

function clampScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(3, Math.round(score)));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cookieHeaderFromResponse(response) {
  return (response.cookies || []).map((item) => String(item).split(";")[0]).join("; ");
}

function createSlug(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function login() {
  const response = await request("POST", "/portal/api/login", {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD,
  });
  const json = parseJson(response.body);
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    cookie: cookieHeaderFromResponse(response),
    body: json,
  };
}

async function createFunnel(cookie, input) {
  const response = await request("POST", "/api/portal/funnel-builder/funnels", input, cookie);
  const json = parseJson(response.body);
  return { status: response.status, json };
}

async function getFunnels(cookie) {
  const response = await request("GET", "/api/portal/funnel-builder/funnels", null, cookie);
  return { status: response.status, json: parseJson(response.body) };
}

async function getPages(cookie, funnelId) {
  const response = await request("GET", `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, null, cookie);
  return { status: response.status, json: parseJson(response.body) };
}

async function generateHtml(cookie, funnelId, pageId, body) {
  const response = await request(
    "POST",
    `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(pageId)}/generate-html`,
    body,
    cookie,
  );
  return { status: response.status, json: parseJson(response.body) };
}

async function discussPage(cookie, funnelId, pageId, prompt) {
  const response = await request(
    "POST",
    `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(pageId)}/chat`,
    { prompt },
    cookie,
  );
  return { status: response.status, json: parseJson(response.body) };
}

async function visualReview(cookie, body) {
  const response = await request("POST", "/api/portal/funnel-builder/visual-review", body, cookie);
  return { status: response.status, json: parseJson(response.body) };
}

async function screenshotHtml(html) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
    await page.setContent(String(html || ""), { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch {}
      }
    });
    const imageBuffer = await page.screenshot({ type: "png", fullPage: true });
    return `data:image/png;base64,${imageBuffer.toString("base64")}`;
  } finally {
    await browser.close();
  }
}

function diffSpanRatio(before, after) {
  const left = String(before || "");
  const right = String(after || "");
  if (!left && !right) return 0;
  if (left === right) return 0;

  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) {
    start += 1;
  }

  let leftEnd = left.length - 1;
  let rightEnd = right.length - 1;
  while (leftEnd >= start && rightEnd >= start && left[leftEnd] === right[rightEnd]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }

  const changedLeft = Math.max(0, leftEnd - start + 1);
  const changedRight = Math.max(0, rightEnd - start + 1);
  return (changedLeft + changedRight) / Math.max(left.length, right.length, 1);
}

function analyzeHtml(html) {
  const source = String(html || "");
  const text = htmlToPlainText(source);
  const sections = countMatches(source, /<section\b/gi);
  const headings = countMatches(source, /<h[1-6]\b/gi);
  const buttons = countMatches(source, /<(a|button)\b/gi);
  const forms = countMatches(source, /<(form|input|textarea|select)\b/gi);
  const media = countMatches(source, /<(img|picture|video|svg)\b/gi);
  const bookingSignals = countMatches(text, /\b(book|booking|schedule|call|consultation|calendar)\b/gi);
  const proofSignals = countMatches(text, /\b(testimonial|review|reviews|results|outcomes|proof|trusted|case study|client|founder|operators|saved|increased|reduced)\b/gi);
  const confirmationSignals = countMatches(text, /\b(confirm|confirmation|next step|what happens next|after you book|follow-up)\b/gi);
  const captureSignals = countMatches(text, /\b(email|phone|name|company|form|application|details)\b/gi);
  const layeredSurfaceSignals = countMatches(source, /(linear-gradient\(|radial-gradient\(|box-shadow\s*:|backdrop-filter\s*:|border-radius\s*:\s*(?:2\d|3\d|4\d)px)/gi);
  const clampSignals = countMatches(source, /(clamp\(|max-width\s*:\s*(?:min\(|(?:3[2-9]|[4-8]\d)rem|100%))/gi);
  const overflowProtectionSignals = countMatches(source, /(overflow-wrap\s*:\s*anywhere|word-break\s*:\s*break-word|max-width\s*:\s*100%|overflow-x\s*:\s*hidden|box-sizing\s*:\s*border-box)/gi);
  const riskyLayoutSignals = countMatches(source, /(white-space\s*:\s*nowrap|margin-(?:left|right)\s*:\s*-\d|(?:left|right)\s*:\s*-\d+px|translate(?:x|3d)?\(\s*-?(?:[4-9]\d|1\d{2,})px|position\s*:\s*(?:absolute|fixed))/gi);
  const artDirectionSignals = countMatches(source, /(font-family\s*:\s*['"]?(?!inter|arial|roboto|helvetica|system-ui)[a-z][^;"'}]+|letter-spacing\s*:|text-transform\s*:\s*uppercase|mix-blend-mode\s*:|backdrop-filter\s*:)/gi);
  const distinctSurfaceModules = countMatches(source, /<(section|div|aside|article)\b[^>]*(class|id)=['"][^'"]*(hero|proof|testimonial|results?|benefits?|faq|cta|panel|card|band|booking|details|fit-grid|comparison|process|steps?)[^'"]*['"][^>]*>/gi);
  const hasDistinctVisualDirection = layeredSurfaceSignals >= 4 && artDirectionSignals >= 3 && distinctSurfaceModules >= 3;
  const hasAwardLevelArtDirection = hasDistinctVisualDirection && layeredSurfaceSignals >= 6 && (media >= 1 || proofSignals >= 3);
  const hasSpatialDiscipline = clampSignals >= 4 && overflowProtectionSignals >= 4 && riskyLayoutSignals <= 6;

  return {
    htmlLength: source.length,
    textLength: text.length,
    sections,
    headings,
    buttons,
    forms,
    media,
    bookingSignals,
    proofSignals,
    confirmationSignals,
    captureSignals,
    layeredSurfaceSignals,
    clampSignals,
    overflowProtectionSignals,
    riskyLayoutSignals,
    artDirectionSignals,
    distinctSurfaceModules,
    hasSinglePrimaryCtaLanguage:
      countMatches(text, /\b(book your strategy call|book a call|schedule a call|book now|schedule now)\b/gi) >= 1,
    hasStrongOpening:
      sections >= 2 && headings >= 1 && text.length > 320 && hasAny(text, [/\b(operator|founder|team|business|automation)\b/i]),
    hasTrustNearAsk: proofSignals >= 2,
    hasNextStepClarity: confirmationSignals >= 1,
    hasDistinctVisualDirection,
    hasAwardLevelArtDirection,
    hasSpatialDiscipline,
    plainText: text,
  };
}

function extractPrimaryCtaText(html) {
  const tagPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagPattern.exec(String(html || "")))) {
    const attrs = String(match[2] || "").toLowerCase();
    const text = htmlToPlainText(match[3]).trim();
    if (!text) continue;
    if (/primary|cta|button|book|schedule|consult|call-to-action/.test(attrs) || /\b(book|schedule|call|consult|apply|get started)\b/i.test(text)) {
      return text;
    }
  }
  return "";
}

function normalizeComparableHtml(html) {
  return String(html || "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDimensionScores(values) {
  const scores = {};
  for (const key of SCORE_DIMENSIONS) {
    scores[key] = clampScore(values[key] || 0);
  }
  return scores;
}

function dimensionAverage(scores) {
  return Number(average(SCORE_DIMENSIONS.map((key) => scores[key] || 0)).toFixed(2));
}

function zeroDimensions(scores) {
  return SCORE_DIMENSIONS.filter((key) => (scores[key] || 0) === 0);
}

function summarizeScenario(name, scores, evidence, failures) {
  return {
    name,
    average: dimensionAverage(scores),
    zeroDimensions: zeroDimensions(scores),
    scores,
    evidence,
    failures,
  };
}

function buildFailureScenario(name, message, evidence = {}) {
  return summarizeScenario(name, makeDimensionScores({}), evidence, [message]);
}

async function safely(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: error && error.stack ? error.stack : String(error),
    };
  }
}

function gradeBlankCreate(result) {
  const created = result.createStatus >= 200 && result.createStatus < 300;
  const hasFunnel = Boolean(result.funnelId);
  const hasPage = Boolean(result.pageId);
  const pageCount = result.pageCount || 0;
  const initSummary = String(result.initializationSummary || "");

  const scores = makeDimensionScores({
    intentInterpretation: created && initSummary ? 1 : created ? 1 : 0,
    localEditPrecision: 1,
    structuralConversionQuality: hasPage && pageCount >= 1 ? 2 : 0,
    proofCredibility: 1,
    leadDataCaptureReadiness: 1,
    bookingOrCheckoutReadiness: 1,
    publishOperationalReadiness: created && hasFunnel && hasPage ? 2 : 0,
    visualAutonomy: hasPage ? 1 : 0,
    artDirectionStrength: hasPage ? 1 : 0,
    spatialDiscipline: hasPage ? 1 : 0,
  });

  const failures = [];
  if (!created) failures.push("Funnel create route did not return success.");
  if (!hasPage) failures.push("New funnel did not materialize an editable first page.");
  if (!initSummary) failures.push("Create response did not provide an initialization summary worth grading.");

  return summarizeScenario(
    "blank-funnel-create",
    scores,
    {
      createStatus: result.createStatus,
      funnelId: result.funnelId,
      pageId: result.pageId,
      pageCount,
      initializationSummary: truncate(initSummary),
    },
    failures,
  );
}

function gradeDiscuss(result) {
  const assistantText = String(result.assistantText || "");
  const summary = String(result.summary || "");
  const moves = Array.isArray(result.moves) ? result.moves : [];
  const pageText = String(result.pageText || "");
  const assistantBlob = `${assistantText} ${summary} ${moves.map((move) => move.change || "").join(" ")}`;
  const genericClaims = [
    /add a booking CTA/i,
    /add testimonials/i,
    /add social proof/i,
    /add a clear call to action/i,
  ].filter((pattern) => pattern.test(assistantBlob) && pattern.test(pageText)).length;
  const truthfulMoves = moves.filter((move) => {
    const change = String(move.change || "");
    if (!change) return false;
    if (/add .*testimonial/i.test(change) && /testimonial|review/i.test(pageText)) return false;
    if (/add .*book/i.test(change) && /book|schedule|call/i.test(pageText)) return false;
    return true;
  }).length;
  const designSignals = countMatches(assistantBlob, /\b(layout|hierarchy|hero|surface|contrast|typography|visual|proof module|section rhythm|art direction)\b/gi);
  const spatialSignals = countMatches(assistantBlob, /\b(padding|clamp|overflow|overlap|bleed|container|readable width|max-width|wrapp?ing)\b/gi);

  const scores = makeDimensionScores({
    intentInterpretation: assistantText ? 2 : 0,
    localEditPrecision: moves.length && truthfulMoves === moves.length ? 2 : moves.length ? 1 : 0,
    structuralConversionQuality: moves.length >= 2 ? 2 : moves.length ? 1 : 0,
    proofCredibility: /proof|testimonial|review|results|credibility/i.test(assistantBlob) ? 2 : 1,
    leadDataCaptureReadiness: /booking|calendar|form|qualification|handoff/i.test(assistantBlob) ? 2 : 1,
    bookingOrCheckoutReadiness: /book|booking|calendar|call|schedule/i.test(assistantBlob) ? 2 : 1,
    publishOperationalReadiness: result.status >= 200 && result.status < 300 ? 2 : 0,
    visualAutonomy: designSignals >= 4 ? 2 : designSignals >= 2 ? 1 : 0,
    artDirectionStrength: /art direction|typography|contrast|surface|mood|composition/i.test(assistantBlob) ? 2 : designSignals >= 1 ? 1 : 0,
    spatialDiscipline: spatialSignals >= 2 ? 2 : spatialSignals >= 1 ? 1 : 0,
  });

  if (genericClaims > 0) {
    scores.intentInterpretation = Math.max(0, scores.intentInterpretation - 1);
    scores.localEditPrecision = Math.max(0, scores.localEditPrecision - 1);
  }

  const failures = [];
  if (!assistantText) failures.push("Discuss route did not return assistant text.");
  if (!moves.length) failures.push("Discuss route did not return actionable sourceActionPlan moves.");
  if (genericClaims > 0) failures.push("Discuss repeated already-true recommendations instead of grounding advice in live page state.");
  if (truthfulMoves < moves.length) failures.push("At least one Discuss move appears to claim a gap that the current page already satisfies.");

  return summarizeScenario(
    "discuss-truthfulness-new-booking-funnel",
    scores,
    {
      status: result.status,
      assistantPreview: truncate(assistantText, 320),
      planSummary: truncate(summary),
      moveCount: moves.length,
      firstMoves: moves.slice(0, 3).map((move) => truncate(move.change || "", 120)),
      genericClaims,
    },
    failures,
  );
}

function gradeCtaPrecision(result) {
  const beforeHtml = String(result.beforeHtml || "");
  const afterHtml = String(result.afterHtml || "");
  const ratio = diffSpanRatio(beforeHtml, afterHtml);
  const changed = beforeHtml !== afterHtml;
  const hasNewCta = /Book your strategy call/i.test(afterHtml);
  const originalPrimaryCta = extractPrimaryCtaText(beforeHtml);
  const beforeAnalysis = analyzeHtml(beforeHtml);
  const afterAnalysis = analyzeHtml(afterHtml);
  const structureStable =
    Math.abs(beforeAnalysis.sections - afterAnalysis.sections) <= 1
    && Math.abs(beforeAnalysis.forms - afterAnalysis.forms) <= 1
    && Math.abs(beforeAnalysis.media - afterAnalysis.media) <= 1;
  const rollbackComparable = hasNewCta && originalPrimaryCta
    ? normalizeComparableHtml(afterHtml).replace(new RegExp(escapeRegExp("Book your strategy call"), "g"), originalPrimaryCta)
    : "";
  const equivalentExceptCta = Boolean(originalPrimaryCta) && rollbackComparable === normalizeComparableHtml(beforeHtml);

  const scores = makeDimensionScores({
    intentInterpretation: changed && hasNewCta ? 3 : changed ? 1 : 0,
    localEditPrecision:
      changed && hasNewCta && structureStable && (ratio <= 0.12 || equivalentExceptCta)
        ? 3
        : changed && hasNewCta && structureStable
          ? 2
          : 0,
    structuralConversionQuality: structureStable ? 2 : 0,
    proofCredibility: Math.max(beforeAnalysis.proofSignals ? 2 : 1, afterAnalysis.proofSignals ? 2 : 1),
    leadDataCaptureReadiness: afterAnalysis.forms > 0 || afterAnalysis.bookingSignals > 0 ? 2 : 1,
    bookingOrCheckoutReadiness: afterAnalysis.bookingSignals > 0 ? 2 : 1,
    publishOperationalReadiness:
      result.status >= 200 && result.status < 300 && changed
        ? result.generateMs > 45000 ? 1 : 2
        : 0,
    visualAutonomy: afterAnalysis.hasDistinctVisualDirection ? 2 : beforeAnalysis.hasDistinctVisualDirection ? 2 : 1,
    artDirectionStrength: afterAnalysis.hasAwardLevelArtDirection ? 2 : afterAnalysis.hasDistinctVisualDirection ? 1 : beforeAnalysis.hasDistinctVisualDirection ? 1 : 0,
    spatialDiscipline: afterAnalysis.hasSpatialDiscipline ? 2 : beforeAnalysis.hasSpatialDiscipline ? 2 : 1,
  });

  const failures = [];
  if (!changed) failures.push("CTA-only prompt returned no material change.");
  if (changed && !hasNewCta) failures.push("CTA-only prompt did not produce the requested CTA copy.");
  if (ratio > 0.12 && !equivalentExceptCta) failures.push(`CTA-only prompt rewrote too much HTML (changed-span ratio ${ratio.toFixed(3)}).`);
  if (!structureStable) failures.push("CTA-only prompt changed structural counts instead of staying local.");
  if (result.generateMs > 45000) failures.push(`CTA-only prompt took ${result.generateMs}ms, which is too slow for a narrow edit.`);

  return summarizeScenario(
    "targeted-cta-only-update",
    scores,
    {
      status: result.status,
      changed,
      changedSpanRatio: Number(ratio.toFixed(3)),
      equivalentExceptCta,
      hasNewCta,
      beforeSections: beforeAnalysis.sections,
      afterSections: afterAnalysis.sections,
      generateMs: result.generateMs,
      aiSummary: truncate(result.aiSummary),
    },
    failures,
  );
}

function gradeBookingGeneration(result) {
  const html = String(result.html || "");
  const review = result.review || {};
  const analysis = analyzeHtml(html);
  const warningCount = Array.isArray(review.warnings) ? review.warnings.length : 0;
  const strengths = Array.isArray(review.strengths) ? review.strengths.length : 0;

  const scores = makeDimensionScores({
    intentInterpretation:
      result.generateStatus >= 200 && result.generateStatus < 300 && analysis.bookingSignals >= 3 && analysis.proofSignals >= 2 ? 2 : result.generateStatus >= 200 ? 1 : 0,
    localEditPrecision: html ? 2 : 0,
    structuralConversionQuality:
      analysis.hasStrongOpening && analysis.sections >= 3 && analysis.buttons >= 2 ? 2 : html ? 1 : 0,
    proofCredibility:
      analysis.hasTrustNearAsk && analysis.proofSignals >= 3 ? 2 : analysis.proofSignals >= 1 ? 1 : 0,
    leadDataCaptureReadiness:
      analysis.forms > 0 || analysis.captureSignals >= 3 ? 2 : analysis.bookingSignals >= 2 ? 1 : 0,
    bookingOrCheckoutReadiness:
      analysis.bookingSignals >= 4 && analysis.hasSinglePrimaryCtaLanguage ? 2 : analysis.bookingSignals >= 2 ? 1 : 0,
    publishOperationalReadiness:
      result.generateStatus >= 200 && result.reviewStatus >= 200 && strengths >= 0 ? 2 : 0,
    visualAutonomy:
      analysis.hasDistinctVisualDirection && warningCount === 0 ? 3 : analysis.hasDistinctVisualDirection ? 2 : html ? 1 : 0,
    artDirectionStrength:
      analysis.hasAwardLevelArtDirection && warningCount <= 1 && strengths >= 3
        ? 3
        : analysis.hasDistinctVisualDirection
          ? 2
          : analysis.layeredSurfaceSignals >= 2
            ? 1
            : 0,
    spatialDiscipline:
      analysis.hasSpatialDiscipline && warningCount <= 1
        ? 3
        : analysis.clampSignals >= 3 && analysis.riskyLayoutSignals <= 6
          ? 2
          : html
            ? 1
            : 0,
  });

  if (warningCount >= 3) {
    scores.structuralConversionQuality = Math.max(0, scores.structuralConversionQuality - 1);
    scores.proofCredibility = Math.max(0, scores.proofCredibility - 1);
  }
  if (!analysis.hasNextStepClarity) {
    scores.publishOperationalReadiness = Math.max(0, scores.publishOperationalReadiness - 1);
  }
  if (warningCount >= 2) {
    scores.visualAutonomy = Math.max(0, scores.visualAutonomy - 1);
    scores.artDirectionStrength = Math.max(0, scores.artDirectionStrength - 1);
    scores.spatialDiscipline = Math.max(0, scores.spatialDiscipline - 1);
  }
  if (!analysis.hasSpatialDiscipline) {
    scores.spatialDiscipline = Math.max(0, scores.spatialDiscipline - 1);
  }
  if (!result.visualReviewed) {
    scores.publishOperationalReadiness = Math.max(0, scores.publishOperationalReadiness - 1);
  }
  if (result.generateMs > 120000) {
    scores.publishOperationalReadiness = Math.max(0, scores.publishOperationalReadiness - 1);
  }

  const failures = [];
  if (!(result.generateStatus >= 200 && result.generateStatus < 300)) failures.push("Booking generation route failed.");
  if (!html) failures.push("Booking generation returned no page HTML.");
  if (analysis.proofSignals === 0) failures.push("Generated booking page did not stage concrete proof signals.");
  if (analysis.bookingSignals < 2) failures.push("Generated booking page did not create a clear booking handoff.");
  if (!analysis.hasNextStepClarity) failures.push("Generated booking page lacks confirmation or next-step language.");
  if (warningCount >= 3) failures.push("Visual review still reports multiple unresolved structural watchouts.");
  if (result.generateMs > 120000) failures.push(`Booking generation took ${result.generateMs}ms, which is too slow for a business-ready fallback path.`);

  return summarizeScenario(
    "booking-generation-plus-visual-review",
    scores,
    {
      generateStatus: result.generateStatus,
      reviewStatus: result.reviewStatus,
      htmlLength: analysis.htmlLength,
      generateMs: result.generateMs,
      sections: analysis.sections,
      proofSignals: analysis.proofSignals,
      bookingSignals: analysis.bookingSignals,
      nextStepSignals: analysis.confirmationSignals,
      layeredSurfaceSignals: analysis.layeredSurfaceSignals,
      clampSignals: analysis.clampSignals,
      riskyLayoutSignals: analysis.riskyLayoutSignals,
      visualAutonomy: analysis.hasDistinctVisualDirection,
      awardLevelArtDirection: analysis.hasAwardLevelArtDirection,
      spatialDiscipline: analysis.hasSpatialDiscipline,
      visualReviewed: result.visualReviewed,
      warningCount,
      reviewSummary: truncate(review.summary),
      firstWarning: truncate((review.warnings || [])[0]),
    },
    failures,
  );
}

function gradeBuilderUiAudit(result) {
  const scores = makeDimensionScores({
    intentInterpretation: 1,
    localEditPrecision: 1,
    structuralConversionQuality: result.headings.length >= 1 && result.buttons.length >= 3 ? 2 : 1,
    proofCredibility: 1,
    leadDataCaptureReadiness: result.buttons.some((label) => /save|publish|preview/i.test(label)) ? 2 : 1,
    bookingOrCheckoutReadiness: 1,
    publishOperationalReadiness: !result.consoleErrors.length && !result.pageErrors.length && !result.failedRequests.length ? 2 : 0,
    visualAutonomy: 1,
    artDirectionStrength: 1,
    spatialDiscipline: 1,
  });

  const failures = [];
  if (!result.url || !/\/funnels\/.+\/edit/.test(result.url)) failures.push("Builder UI audit did not reach the funnel editor.");
  if (result.consoleErrors.length) failures.push("Builder UI emitted console errors.");
  if (result.pageErrors.length) failures.push("Builder UI emitted page errors.");
  if (result.failedRequests.length) failures.push("Builder UI produced failed network requests.");

  return summarizeScenario(
    "builder-ui-audit",
    scores,
    {
      url: result.url,
      headings: result.headings.slice(0, 8),
      buttons: result.buttons.slice(0, 12),
      tabs: result.tabs.slice(0, 8),
      iframeCount: result.iframeCount,
      consoleErrors: result.consoleErrors.slice(0, 5),
      pageErrors: result.pageErrors.slice(0, 5),
      failedRequests: result.failedRequests.slice(0, 5),
    },
    failures,
  );
}

async function runBuilderUiAudit(cookie, funnelId) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1600, height: 1200 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error && error.message ? error.message : error));
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure() ? request.failure().errorText : "failed"}`);
    });

    const cookiePairs = String(cookie || "")
      .split(/;\s*/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const eq = entry.indexOf("=");
        return eq === -1 ? null : { name: entry.slice(0, eq), value: entry.slice(eq + 1) };
      })
      .filter(Boolean);

    if (cookiePairs.length) {
      await context.addCookies(
        cookiePairs.map((entry) => ({
          name: entry.name,
          value: entry.value,
          domain: new URL(BASE_URL).hostname,
          path: "/",
          httpOnly: false,
          secure: BASE_URL.startsWith("https://"),
        })),
      );
    }

    await page.goto(`${BASE_URL}/portal/app/services/funnel-builder/funnels/${funnelId}/edit`, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(2000);

    const snapshot = await page.evaluate(() => {
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      };
      const textOf = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
      return {
        url: window.location.href,
        headings: Array.from(document.querySelectorAll("h1, h2, h3")).map(textOf).filter(Boolean),
        buttons: Array.from(document.querySelectorAll("button")).filter(isVisible).map(textOf).filter(Boolean),
        tabs: Array.from(document.querySelectorAll("[role='tab'], [aria-selected]")).filter(isVisible).map(textOf).filter(Boolean),
        iframeCount: document.querySelectorAll("iframe").length,
      };
    });

    await context.close();
    return {
      ...snapshot,
      consoleErrors: Array.from(new Set(consoleErrors)),
      pageErrors: Array.from(new Set(pageErrors)),
      failedRequests: Array.from(new Set(failedRequests)),
    };
  } finally {
    await browser.close();
  }
}

async function createBookingScenario(cookie, prefix) {
  const create = await createFunnel(cookie, {
    slug: createSlug(prefix),
    name: `Audit ${prefix}`,
    pageType: "booking",
    funnelGoal: "Turn qualified operators into booked strategy calls",
    offer: "a strategic automation consultation",
    audience: "operators evaluating automation help",
    primaryCta: "Book a call",
  });
  const funnelId = create.json && create.json.funnel ? create.json.funnel.id : null;
  const pages = funnelId ? await getPages(cookie, funnelId) : { status: 0, json: null };
  const page = pages.json && Array.isArray(pages.json.pages) ? pages.json.pages[0] : null;
  return {
    createStatus: create.status,
    funnelId,
    initializationSummary: create.json && create.json.initialization ? create.json.initialization.summary : "",
    pageId: page ? page.id : null,
    page,
    pageCount: pages.json && Array.isArray(pages.json.pages) ? pages.json.pages.length : 0,
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  logStep("login");
  const auth = await login();
  if (!auth.ok) {
    throw new Error(`Login failed with status ${auth.status}`);
  }

  logStep("blank funnel create");
  const blankCreateOutcome = await safely(async () => {
    const created = await createFunnel(auth.cookie, {
      slug: createSlug("blank-audit"),
      name: "Blank Audit",
    });
    const funnelId = created.json && created.json.funnel ? created.json.funnel.id : null;
    const pages = funnelId ? await getPages(auth.cookie, funnelId) : { status: 0, json: null };
    const page = pages.json && Array.isArray(pages.json.pages) ? pages.json.pages[0] : null;
    return { created, funnelId, pages, page };
  });

  logStep("discuss truthfulness scenario");
  const discussOutcome = await safely(async () => {
    const seed = await createBookingScenario(auth.cookie, "discuss-audit");
    const result = seed.funnelId && seed.pageId
      ? await discussPage(auth.cookie, seed.funnelId, seed.pageId, DISCUSS_TRUTHFULNESS_PROMPT)
      : { status: 0, json: null };
    return { seed, result };
  });

  logStep("cta-only scenario");
  const ctaOutcome = await safely(async () => {
    const seed = await createBookingScenario(auth.cookie, "cta-audit");
    const beforeHtml = String((seed.page && (seed.page.draftHtml || seed.page.customHtml)) || "");
    const generateStartedAt = Date.now();
    const result = seed.funnelId && seed.pageId
      ? await generateHtml(auth.cookie, seed.funnelId, seed.pageId, {
          prompt: NARROW_EDIT_PROMPT,
          currentHtml: beforeHtml,
        })
      : { status: 0, json: null };
    const afterHtml = String(
      (result.json && result.json.page && (result.json.page.draftHtml || result.json.page.customHtml)) || "",
    );
    return { seed, beforeHtml, result, afterHtml, generateMs: Date.now() - generateStartedAt };
  });

  logStep("booking generation plus visual review");
  const bookingOutcome = await safely(async () => {
    const seed = await createBookingScenario(auth.cookie, "booking-audit");
    const generateStartedAt = Date.now();
    const generateResult = seed.funnelId && seed.pageId
      ? await generateHtml(auth.cookie, seed.funnelId, seed.pageId, {
          prompt: FREEFORM_BOOKING_PROMPT,
          currentHtml: "",
          contextKeys: ["hero", "proof", "cta"],
          intentProfile: {
            pageType: "booking",
            audience: "operators evaluating automation help",
            offer: "a strategic automation consultation",
            primaryCta: "Book a call",
          },
        })
      : { status: 0, json: null };
    const generateMs = Date.now() - generateStartedAt;
    const html = String(
      (generateResult.json && generateResult.json.page && (generateResult.json.page.draftHtml || generateResult.json.page.customHtml)) || "",
    );
    const reviewImage = html ? await screenshotHtml(html) : "";
    const reviewResult = seed.funnelId && seed.pageId && reviewImage
      ? await visualReview(auth.cookie, {
          funnelId: seed.funnelId,
          pageId: seed.pageId,
          surface: "source",
          prompt: FREEFORM_BOOKING_PROMPT,
          html,
          css: "",
          previewImageDataUrl: reviewImage,
          intentProfile: {
            pageType: "booking",
            audience: "operators evaluating automation help",
            offer: "a strategic automation consultation",
            primaryCta: "Book a call",
          },
        })
      : { status: 0, json: null };
    return { seed, generateResult, html, reviewResult, generateMs };
  });

  logStep("builder ui audit");
  const uiOutcome = await safely(async () => {
    const seed = await createBookingScenario(auth.cookie, "ui-audit");
    const audit = seed.funnelId ? await runBuilderUiAudit(auth.cookie, seed.funnelId) : {
      url: "",
      headings: [],
      buttons: [],
      tabs: [],
      iframeCount: 0,
      consoleErrors: ["Builder UI audit could not start because no funnel was created."],
      pageErrors: [],
      failedRequests: [],
    };
    return { seed, audit };
  });

  const scenarios = [
    blankCreateOutcome.ok
      ? gradeBlankCreate({
          createStatus: blankCreateOutcome.value.created.status,
          funnelId: blankCreateOutcome.value.funnelId,
          pageId: blankCreateOutcome.value.page ? blankCreateOutcome.value.page.id : null,
          pageCount: blankCreateOutcome.value.pages.json && Array.isArray(blankCreateOutcome.value.pages.json.pages) ? blankCreateOutcome.value.pages.json.pages.length : 0,
          initializationSummary:
            blankCreateOutcome.value.created.json && blankCreateOutcome.value.created.json.initialization
              ? blankCreateOutcome.value.created.json.initialization.summary
              : "",
        })
      : buildFailureScenario("blank-funnel-create", blankCreateOutcome.error),
    discussOutcome.ok
      ? gradeDiscuss({
          status: discussOutcome.value.result.status,
          assistantText: discussOutcome.value.result.json ? discussOutcome.value.result.json.assistantText : "",
          summary:
            discussOutcome.value.result.json && discussOutcome.value.result.json.sourceActionPlan
              ? discussOutcome.value.result.json.sourceActionPlan.summary
              : "",
          moves:
            discussOutcome.value.result.json && discussOutcome.value.result.json.sourceActionPlan
              ? discussOutcome.value.result.json.sourceActionPlan.moves
              : [],
          pageText: htmlToPlainText((discussOutcome.value.seed.page && (discussOutcome.value.seed.page.draftHtml || discussOutcome.value.seed.page.customHtml)) || ""),
        })
      : buildFailureScenario("discuss-truthfulness-new-booking-funnel", discussOutcome.error),
    ctaOutcome.ok
      ? gradeCtaPrecision({
          status: ctaOutcome.value.result.status,
          beforeHtml: ctaOutcome.value.beforeHtml,
          afterHtml: ctaOutcome.value.afterHtml,
          generateMs: ctaOutcome.value.generateMs,
          aiSummary: ctaOutcome.value.result.json && ctaOutcome.value.result.json.aiResult ? ctaOutcome.value.result.json.aiResult.summary : "",
        })
      : buildFailureScenario("targeted-cta-only-update", ctaOutcome.error),
    bookingOutcome.ok
      ? gradeBookingGeneration({
          generateStatus: bookingOutcome.value.generateResult.status,
          reviewStatus: bookingOutcome.value.reviewResult.status,
          generateMs: bookingOutcome.value.generateMs,
          html: bookingOutcome.value.html,
          visualReviewed: Boolean(bookingOutcome.value.reviewResult.json && bookingOutcome.value.reviewResult.json.visualReviewed),
          review: bookingOutcome.value.reviewResult.json || {},
        })
      : buildFailureScenario("booking-generation-plus-visual-review", bookingOutcome.error),
    uiOutcome.ok
      ? gradeBuilderUiAudit(uiOutcome.value.audit)
      : buildFailureScenario("builder-ui-audit", uiOutcome.error),
  ];

  const categorySummary = SCORE_DIMENSIONS.reduce((acc, key) => {
    const values = scenarios.map((scenario) => scenario.scores[key] || 0);
    acc[key] = {
      average: Number(average(values).toFixed(2)),
      min: Math.min(...values),
      failures: scenarios.filter((scenario) => (scenario.scores[key] || 0) === 0).map((scenario) => scenario.name),
    };
    return acc;
  }, {});

  const targetScenario = scenarios.find((scenario) => scenario.name === "booking-generation-plus-visual-review");
  const output = {
    generatedAt: startedAt,
    baseUrl: BASE_URL,
    requiredScenariosRun: scenarios.map((scenario) => scenario.name),
    categorySummary,
    targetScenario: targetScenario
      ? {
          name: targetScenario.name,
          average: targetScenario.average,
          noZeroDimensions: targetScenario.zeroDimensions.length === 0,
          readyToWiden: targetScenario.average >= 2.3 && targetScenario.zeroDimensions.length === 0,
          visualAutonomyReady:
            (targetScenario.scores.visualAutonomy || 0) >= 2
            && (targetScenario.scores.artDirectionStrength || 0) >= 2
            && (targetScenario.scores.spatialDiscipline || 0) >= 2,
          zeroDimensions: targetScenario.zeroDimensions,
        }
      : null,
    scenarios,
  };

  if (OUTPUT_PATH) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  }

  logStep("complete");
  console.log(JSON.stringify(output, null, 2));
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});