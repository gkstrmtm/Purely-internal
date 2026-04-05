/* eslint-disable @typescript-eslint/no-require-imports */

require("ts-node").register({
  transpileOnly: true,
  project: require("path").join(__dirname, "tsconfig.smoke.json"),
});

const { getPuraIntentSignals } = require("../src/lib/puraIntent");

const cases = [
  {
    text: "How do I update my booking form?",
    expect: { asksHow: true, looksImperative: false },
  },
  {
    text: "Update my booking form headline to: \"Book now\"",
    expect: { looksImperative: true },
  },
  {
    text: "How about you update the booking form headline to 'Book now'",
    expect: { looksImperative: true, asksHow: false },
  },
  {
    text: "Please adjust the funnel step order so Pricing comes after Benefits.",
    expect: { looksImperative: true },
  },
  {
    text: "Can you create a new funnel called Spring Promo?",
    expect: { explicitDoIt: true, looksImperative: true },
  },
  {
    text: "Walk me through the steps to set up a funnel.",
    expect: { asksHow: true, looksImperative: false },
  },
  {
    text: "Stop the weekday SMS schedule.",
    expect: { looksImperative: true },
  },
  {
    text: "What do I click to change the booking calendar name?",
    expect: { asksHow: true, looksImperative: false },
  },
];

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} expected=${String(expected)} actual=${String(actual)}`);
  }
}

let passed = 0;
for (const c of cases) {
  const s = getPuraIntentSignals(c.text);
  const exp = c.expect || {};

  if (typeof exp.explicitDoIt === "boolean") {
    assertEqual(`explicitDoIt for: ${c.text}`, s.explicitDoIt, exp.explicitDoIt);
  }
  if (typeof exp.asksHow === "boolean") {
    assertEqual(`asksHow for: ${c.text}`, s.asksHow, exp.asksHow);
  }
  if (typeof exp.looksImperative === "boolean") {
    assertEqual(`looksImperative for: ${c.text}`, s.looksImperative, exp.looksImperative);
  }

  passed += 1;
}

console.log(`pura-intent-smoke: ${passed}/${cases.length} passed`);
