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

function assertJsonEqual(label, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} expected=${expectedJson} actual=${actualJson}`);
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
  {
    label: "casual newsletter hosted rewrite",
    service: "NEWSLETTER",
    prompt: "Hey bro, make my newsletter page feel more editorial for HVAC owners and keep it in draft.",
    expectPageKey: "newsletter_editorial",
  },
  {
    label: "casual booking hosted rewrite",
    service: "BOOKING",
    prompt: "Hey, clean up my booking page and make it minimal but still professional. Keep it draft.",
    expectPageKey: "booking_minimal_clinic",
  },
  {
    label: "booking concierge slang",
    service: "BOOKING",
    prompt: "Yo can you make my booking page feel more high-end and concierge but keep it draft?",
    expectPageKey: "booking_concierge",
  },
  {
    label: "reviews luxe slang",
    service: "REVIEWS",
    prompt: "Can you make my reviews page feel more luxe and white-glove? Leave it in draft.",
    expectPageKey: "reviews_concierge",
  },
  {
    label: "blogs magazine casual",
    service: "BLOGS",
    prompt: "Make my blog feel more like a magazine and keep it in draft.",
    expectPageKey: "blogs_magazine",
  },
  {
    label: "newsletter community casual",
    service: "NEWSLETTER",
    prompt: "Make my newsletter page feel more community-driven and warm, but keep it draft.",
    expectPageKey: "newsletter_community",
  },
];

const directActionCases = [
  {
    label: "casual task create",
    prompt: "Hey, make me a task to call Sam tomorrow at 9am and title it Call Sam.",
    expectAction: "tasks.create",
    expectTitle: "Call Sam",
  },
  {
    label: "casual newsletter create",
    prompt: "Let's create a newsletter draft called HVAC Spring Push.",
    expectAction: "newsletter.newsletters.create",
    expectTitle: "HVAC Spring Push",
  },
  {
    label: "casual newsletter create with audience",
    prompt: "Create a newsletter called Pura Quality Smoke Weekly for an online guru audience.",
    expectAction: "newsletter.newsletters.create",
    expectTitle: "Pura Quality Smoke Weekly",
  },
  {
    label: "casual blog create",
    prompt: "Bro, create a blog draft called How HVAC Shops Can Book More Calls.",
    expectAction: "blogs.posts.create",
    expectTitle: "How HVAC Shops Can Book More Calls",
  },
  {
    label: "casual booking settings update",
    prompt: "I am already on my booking settings page. Can you rename this to Free Webinar Strategy Call, work webinar funnels and faster follow-up automation into the description, set it to 45 minutes, keep the timezone the same, and then leave me on booking settings with the live booking link handy? Don’t go listing appointments or anything else.",
    expectAction: "booking.settings.update",
    expectArgs: {
      title: "Free Webinar Strategy Call",
      description: "webinar funnels and faster follow-up automation",
      durationMinutes: 45,
    },
    expectSteps: ["booking.settings.update", "booking.settings.get", "booking.site.get"],
  },
  {
    label: "casual booking reminders mixed channels",
    prompt: "Turn on booking reminders so people get an email reminder 24 hours before and a text 2 hours before the appointment.",
    expectAction: "booking.reminders.settings.update",
  },
  {
    label: "casual ai receptionist says phrasing",
    prompt: "Update the AI receptionist so it says Hello, you've reached Purely Automation. We can help schedule appointments and answer service questions.",
    expectAction: "ai_receptionist.settings.update",
    expectArgs: { settings: { greeting: "Hello, you've reached Purely Automation. We can help schedule appointments and answer service questions." } },
  },
];

const signalCases = [
  {
    label: "casual sms thread lookup signal",
    prompt: "Show me the recent text threads with Jamie.",
    expectSmsThreadWithName: "Jamie",
  },
  {
    label: "casual sms thread lookup slang",
    prompt: "Can you pull up my latest texts with Jamie?",
    expectSmsThreadWithName: "Jamie",
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

for (const test of directActionCases) {
  const signals = detectPuraDirectIntentSignals(test.prompt, {});
  const plan = getPuraDirectActionPlan({ prompt: test.prompt, signals, threadContext: {} });
  assertEqual(`${test.label} action`, plan?.action ?? null, test.expectAction);
  assertEqual(`${test.label} traceTitle`, typeof plan?.traceTitle === 'string' && plan.traceTitle.length > 0, true);
  if (test.expectAction === 'tasks.create') {
    assertEqual(`${test.label} task title`, plan?.args?.title ?? null, test.expectTitle);
  }
  if (test.expectAction === 'newsletter.newsletters.create' || test.expectAction === 'blogs.posts.create') {
    assertEqual(`${test.label} content title`, plan?.args?.title ?? null, test.expectTitle);
  }
  if (test.expectArgs) {
    assertJsonEqual(`${test.label} args`, plan?.args ?? null, test.expectArgs);
  }
  if (test.expectSteps) {
    assertJsonEqual(`${test.label} steps`, (plan?.steps || []).map((step) => step.action), test.expectSteps);
  }
  passed += 1;
}

for (const test of signalCases) {
  const signals = detectPuraDirectIntentSignals(test.prompt, {});
  assertEqual(`${test.label} smsThreadWithName`, signals.smsThreadWithName ?? null, test.expectSmsThreadWithName);
  passed += 1;
}

console.log(`pura-production-smoke: ${passed}/${linkCases.length + routingCases.length + directActionCases.length + signalCases.length} passed`);