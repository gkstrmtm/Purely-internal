/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("path");
const Module = require("module");

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(process.cwd(), "src", request.slice(2));
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

require("ts-node").register({
  transpileOnly: true,
  project: path.join(__dirname, "tsconfig.smoke.json"),
});

const { normalizeAssistantLinkUrl, absolutizeAssistantTextLinks } = require("../src/lib/portalAssistantLinks.ts");
const { resolveHostedTemplatePageKey } = require("../src/lib/hostedPageTemplateIntents.ts");
const { detectPuraDirectIntentSignals } = require("../src/lib/puraDirectIntentSignals.ts");
const { getPuraDirectActionPlan, getPuraDirectPrerequisiteMessage } = require("../src/lib/puraDirectIntentPlans.ts");

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

function assertMatch(label, value, pattern) {
  if (!pattern.test(String(value || ""))) {
    throw new Error(`${label} expected to match ${String(pattern)} actual=${JSON.stringify(value)}`);
  }
}

function assertNoMatch(label, value, pattern) {
  if (pattern.test(String(value || ""))) {
    throw new Error(`${label} unexpectedly matched ${String(pattern)} actual=${JSON.stringify(value)}`);
  }
}

const linkCases = [
  {
    label: "relative assistant link",
    actual: normalizeAssistantLinkUrl("/portal/app/ai-chat?thread=abc"),
    expected: "https://purelyautomation.com/portal/app/ai-chat?thread=abc",
  },
  {
    label: "localhost assistant link",
    actual: normalizeAssistantLinkUrl("http://127.0.0.1:3000/portal/app/profile"),
    expected: "https://purelyautomation.com/portal/app/profile",
  },
  {
    label: "text link absolutization",
    actual: absolutizeAssistantTextLinks(
      "Check /portal/app/ai-chat?thread=abc and [Open inbox](/portal/app/services/inbox). Also http://127.0.0.1:3000/portal/app/profile.",
    ),
    expectedContains: [
      "https://purelyautomation.com/portal/app/ai-chat?thread=abc",
      "[Open inbox](https://purelyautomation.com/portal/app/services/inbox)",
      "https://purelyautomation.com/portal/app/profile",
    ],
    expectedNoMatch: [/\[Open inbox\]\(\/portal\//, /(^|\s)\/portal\/app\//, /127\.0\.0\.1:3000/],
  },
];

const routingCases = [
  {
    label: "blog minimal direct",
    service: "BLOGS",
    prompt: "Make a minimal blog page for a serious HVAC brand. Keep it in draft and tell me what you changed.",
    expectPageKey: "blogs_minimal",
  },
  {
    label: "blog journal typo",
    service: "BLOGS",
    prompt: "Mak my blog page more jurnalistic and thoughtful. Keep it draft and show me what changed.",
    expectPageKey: "blogs_journal",
  },
  {
    label: "newsletter editorial",
    service: "NEWSLETTER",
    prompt: "Make my newsletter editorial for HVAC owners and keep it in draft. Use publish-ready copy and tell me what changed.",
    expectPageKey: "newsletter_editorial",
  },
  {
    label: "booking minimal typo",
    service: "BOOKING",
    prompt: "Mak my booking page minimul but still proffesional. Do not publish it. Tell me exactly what changed.",
    expectPageKey: "booking_minimal_clinic",
  },
  {
    label: "reviews concierge",
    service: "REVIEWS",
    prompt: "Make my reviews page feel more concierge and premium. Keep it in draft and summarize the changes.",
    expectPageKey: "reviews_concierge",
  },
  {
    label: "editorial beats default",
    service: "NEWSLETTER",
    prompt: "clean this up and make it feel more editorial for HVAC owners. keep it draft.",
    expectPageKey: "newsletter_editorial",
    expectDirectSignals: false,
  },
];

let passed = 0;

for (const test of linkCases) {
  if (Object.prototype.hasOwnProperty.call(test, "expected")) {
    assertEqual(test.label, test.actual, test.expected);
  }
  for (const value of test.expectedContains || []) {
    assertMatch(`${test.label} contains`, test.actual, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const pattern of test.expectedNoMatch || []) {
    assertNoMatch(`${test.label} no-match`, test.actual, pattern);
  }
  passed += 1;
}

for (const test of routingCases) {
  const resolvedPageKey = resolveHostedTemplatePageKey(test.service, test.prompt);
  assertEqual(`${test.label} pageKey`, resolvedPageKey, test.expectPageKey);

  const signals = detectPuraDirectIntentSignals(test.prompt, {});
  if (test.expectDirectSignals !== false) {
    assertEqual(`${test.label} hosted target pageKey`, signals.hostedPageGenerateTarget?.pageKey ?? null, test.expectPageKey);
    assertEqual(`${test.label} blog publish safeguard`, signals.shouldPublishLatestBlog, false);
    assertEqual(`${test.label} blog create safeguard`, signals.blogCreateTitle || "", "");
    assertEqual(`${test.label} newsletter create safeguard`, signals.newsletterCreateTitle || "", "");

    const plan = getPuraDirectActionPlan({ prompt: test.prompt, signals, threadContext: {} });
    assertEqual(`${test.label} plan action`, plan?.action ?? null, "hosted_pages.documents.generate_html");
    assertEqual(`${test.label} plan pageKey`, plan?.args?.pageKey ?? null, test.expectPageKey);
    assertEqual(`${test.label} prereq`, getPuraDirectPrerequisiteMessage({ signals, threadContext: {} }), null);
  }
  passed += 1;
}

console.log(`pura-production-smoke: ${passed}/${linkCases.length + routingCases.length} passed`);