import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const API_ROOT = path.join(REPO_ROOT, "src", "app", "api");
const PORTAL_ROOT = path.join(API_ROOT, "portal");

const OUT_JSON = path.join(REPO_ROOT, "docs", "portal-api-inventory.json");
const OUT_MD = path.join(REPO_ROOT, "docs", "portal-agent-coverage.md");

/**
 * Minimal, explicit mapping of agent actions -> portal endpoints.
 * This is intentionally conservative: only mark coverage when we know an action
 * performs the same server-side effect as the UI/route.
 */
const ACTION_COVERAGE = [
  { action: "contacts.list", method: "GET", endpoint: "/api/portal/people/contacts" },
  { action: "contacts.create", method: "POST", endpoint: "/api/portal/people/contacts" },

  { action: "people.users.list", method: "GET", endpoint: "/api/portal/people/users" },
  { action: "people.users.invite", method: "POST", endpoint: "/api/portal/people/users" },
  { action: "people.users.update", method: "PATCH", endpoint: "/api/portal/people/users/[userId]" },
  { action: "people.users.delete", method: "DELETE", endpoint: "/api/portal/people/users/[userId]" },
  { action: "people.leads.update", method: "PATCH", endpoint: "/api/portal/people/leads/[leadId]" },
  { action: "people.contacts.custom_variable_keys.get", method: "GET", endpoint: "/api/portal/people/contacts/custom-variable-keys" },
  { action: "people.contacts.duplicates.get", method: "GET", endpoint: "/api/portal/people/contacts/duplicates" },
  { action: "people.contacts.merge", method: "POST", endpoint: "/api/portal/people/contacts/merge" },
  { action: "people.contacts.custom_variables.patch", method: "PATCH", endpoint: "/api/portal/people/contacts/[contactId]/custom-variables" },

  { action: "reviews.send_request_for_booking", method: "POST", endpoint: "/api/portal/reviews/send" },
  { action: "reviews.send_request_for_contact", method: "POST", endpoint: "/api/portal/reviews/send-contact" },
  { action: "reviews.reply", method: "PUT", endpoint: "/api/portal/reviews/reply" },

  { action: "reviews.settings.get", method: "GET", endpoint: "/api/portal/reviews/settings" },
  { action: "reviews.settings.update", method: "PUT", endpoint: "/api/portal/reviews/settings" },
  { action: "reviews.site.get", method: "GET", endpoint: "/api/portal/reviews/site" },
  { action: "reviews.site.update", method: "POST", endpoint: "/api/portal/reviews/site" },
  { action: "reviews.inbox.list", method: "GET", endpoint: "/api/portal/reviews/inbox" },
  { action: "reviews.archive", method: "POST", endpoint: "/api/portal/reviews/archive" },
  { action: "reviews.bookings.list", method: "GET", endpoint: "/api/portal/reviews/bookings" },
  { action: "reviews.contacts.search", method: "GET", endpoint: "/api/portal/reviews/contacts" },
  { action: "reviews.events.list", method: "GET", endpoint: "/api/portal/reviews/events" },
  { action: "reviews.handle.get", method: "GET", endpoint: "/api/portal/reviews/handle" },
  { action: "reviews.questions.list", method: "GET", endpoint: "/api/portal/reviews/questions" },
  { action: "reviews.questions.answer", method: "PUT", endpoint: "/api/portal/reviews/questions/answer" },

  { action: "media.folder.ensure", method: "POST", endpoint: "/api/portal/media/folders" },
  { action: "media.items.move", method: "POST", endpoint: "/api/portal/media/items" },
  { action: "media.import_remote_image", method: "POST", endpoint: "/api/portal/media/import-remote" },

  { action: "dashboard.reset", method: "POST", endpoint: "/api/portal/dashboard/reset" },
  { action: "dashboard.add_widget", method: "POST", endpoint: "/api/portal/dashboard/widgets" },
  { action: "dashboard.remove_widget", method: "DELETE", endpoint: "/api/portal/dashboard/widgets" },
  { action: "dashboard.optimize", method: "POST", endpoint: "/api/portal/dashboard/optimize" },

  { action: "booking.bookings.list", method: "GET", endpoint: "/api/portal/booking/bookings" },
  { action: "booking.cancel", method: "POST", endpoint: "/api/portal/booking/bookings/[bookingId]/cancel" },
  { action: "booking.reschedule", method: "POST", endpoint: "/api/portal/booking/bookings/[bookingId]/reschedule" },
  { action: "booking.contact", method: "POST", endpoint: "/api/portal/booking/bookings/[bookingId]/contact" },

  { action: "booking.calendars.get", method: "GET", endpoint: "/api/portal/booking/calendars" },
  { action: "booking.calendars.update", method: "PUT", endpoint: "/api/portal/booking/calendars" },
  { action: "booking.form.get", method: "GET", endpoint: "/api/portal/booking/form" },
  { action: "booking.form.update", method: "PUT", endpoint: "/api/portal/booking/form" },
  { action: "booking.settings.get", method: "GET", endpoint: "/api/portal/booking/settings" },
  { action: "booking.settings.update", method: "PUT", endpoint: "/api/portal/booking/settings" },
  { action: "booking.site.get", method: "GET", endpoint: "/api/portal/booking/site" },
  { action: "booking.site.update", method: "POST", endpoint: "/api/portal/booking/site" },
  { action: "booking.suggestions.slots", method: "GET", endpoint: "/api/portal/booking/suggestions" },
  { action: "booking.reminders.settings.get", method: "GET", endpoint: "/api/portal/booking/reminders/settings" },
  { action: "booking.reminders.settings.update", method: "PUT", endpoint: "/api/portal/booking/reminders/settings" },
  { action: "booking.reminders.ai.generate_step", method: "POST", endpoint: "/api/portal/booking/reminders/ai/generate-step" },

  { action: "nurture.campaigns.list", method: "GET", endpoint: "/api/portal/nurture/campaigns" },
  { action: "nurture.campaigns.create", method: "POST", endpoint: "/api/portal/nurture/campaigns" },
  { action: "nurture.campaigns.get", method: "GET", endpoint: "/api/portal/nurture/campaigns/[campaignId]" },
  { action: "nurture.campaigns.update", method: "PATCH", endpoint: "/api/portal/nurture/campaigns/[campaignId]" },
  { action: "nurture.campaigns.delete", method: "DELETE", endpoint: "/api/portal/nurture/campaigns/[campaignId]" },
  { action: "nurture.campaigns.steps.add", method: "POST", endpoint: "/api/portal/nurture/campaigns/[campaignId]/steps" },
  { action: "nurture.steps.update", method: "PATCH", endpoint: "/api/portal/nurture/steps/[stepId]" },
  { action: "nurture.steps.delete", method: "DELETE", endpoint: "/api/portal/nurture/steps/[stepId]" },
  { action: "nurture.campaigns.enroll", method: "POST", endpoint: "/api/portal/nurture/campaigns/[campaignId]/enroll" },
  { action: "nurture.billing.confirm_checkout", method: "POST", endpoint: "/api/portal/nurture/campaigns/[campaignId]/confirm-checkout" },
  { action: "nurture.ai.generate_step", method: "POST", endpoint: "/api/portal/nurture/ai/generate-step" },

  // Funnel Builder (non-AI CRUD parity)
  { action: "funnel_builder.settings.get", method: "GET", endpoint: "/api/portal/funnel-builder/settings" },
  { action: "funnel_builder.settings.update", method: "POST", endpoint: "/api/portal/funnel-builder/settings" },

  { action: "funnel_builder.domains.list", method: "GET", endpoint: "/api/portal/funnel-builder/domains" },
  { action: "funnel_builder.domains.create", method: "POST", endpoint: "/api/portal/funnel-builder/domains" },
  { action: "funnel_builder.domains.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/domains" },

  { action: "funnel_builder.forms.list", method: "GET", endpoint: "/api/portal/funnel-builder/forms" },
  { action: "funnel_builder.forms.create", method: "POST", endpoint: "/api/portal/funnel-builder/forms" },
  { action: "funnel_builder.forms.get", method: "GET", endpoint: "/api/portal/funnel-builder/forms/[formId]" },
  { action: "funnel_builder.forms.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/forms/[formId]" },
  { action: "funnel_builder.forms.delete", method: "DELETE", endpoint: "/api/portal/funnel-builder/forms/[formId]" },
  { action: "funnel_builder.forms.submissions.list", method: "GET", endpoint: "/api/portal/funnel-builder/forms/[formId]/submissions" },
  { action: "funnel_builder.form_field_keys.get", method: "GET", endpoint: "/api/portal/funnel-builder/form-field-keys" },

  { action: "funnel_builder.funnels.list", method: "GET", endpoint: "/api/portal/funnel-builder/funnels" },
  { action: "funnel_builder.funnels.get", method: "GET", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]" },
  { action: "funnel_builder.funnels.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]" },
  { action: "funnel_builder.funnels.delete", method: "DELETE", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]" },

  { action: "funnel_builder.pages.list", method: "GET", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages" },
  { action: "funnel_builder.pages.create", method: "POST", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages" },
  { action: "funnel_builder.pages.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]" },
  { action: "funnel_builder.pages.delete", method: "DELETE", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]" },
  {
    action: "funnel_builder.pages.export_custom_html",
    method: "POST",
    endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/export-custom-html",
  },
  { action: "funnel_builder.pages.global_header", method: "POST", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/global-header" },

  { action: "funnel_builder.sales.products.list", method: "GET", endpoint: "/api/portal/funnel-builder/sales/products" },
  { action: "funnel_builder.sales.products.create", method: "POST", endpoint: "/api/portal/funnel-builder/sales/products" },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listRouteFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listRouteFiles(abs)));
      continue;
    }
    if (ent.isFile() && ent.name === "route.ts") out.push(abs);
  }
  return out;
}

function toEndpointFromRouteFile(filePath) {
  const rel = path.relative(API_ROOT, filePath);
  const dir = path.dirname(rel); // e.g. portal/reviews/send
  const normalized = dir.split(path.sep).join("/");
  return `/api/${normalized}`;
}

function parseMethods(fileText) {
  const found = new Set();
  for (const method of HTTP_METHODS) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    if (re.test(fileText)) found.add(method);
  }
  return Array.from(found);
}

function coveredBy(endpoint, method) {
  return ACTION_COVERAGE.filter((m) => m.endpoint === endpoint && m.method === method).map((m) => m.action);
}

function mdEscape(s) {
  return String(s).replaceAll("|", "\\|");
}

async function main() {
  if (!(await exists(PORTAL_ROOT))) {
    throw new Error(`Portal API root not found: ${PORTAL_ROOT}`);
  }

  const routeFiles = await listRouteFiles(PORTAL_ROOT);
  const routes = [];

  for (const f of routeFiles) {
    const endpoint = toEndpointFromRouteFile(f);
    const text = await fs.readFile(f, "utf8");
    const methods = parseMethods(text);

    routes.push({
      endpoint,
      methods: methods.length ? methods.sort() : [],
      file: path.relative(REPO_ROOT, f).split(path.sep).join("/"),
    });
  }

  routes.sort((a, b) => a.endpoint.localeCompare(b.endpoint));

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify({ generatedAtIso: new Date().toISOString(), routes }, null, 2) + "\n", "utf8");

  const rows = [];
  let coveredOps = 0;
  let totalOps = 0;

  for (const r of routes) {
    const methods = r.methods.length ? r.methods : ["(unknown)"];
    for (const m of methods) {
      if (m === "(unknown)") {
        rows.push({ endpoint: r.endpoint, method: m, covered: [], file: r.file });
        continue;
      }
      totalOps += 1;
      const covered = coveredBy(r.endpoint, m);
      if (covered.length) coveredOps += 1;
      rows.push({ endpoint: r.endpoint, method: m, covered, file: r.file });
    }
  }

  const md = [];
  md.push("# Portal API Inventory + Agent Coverage");
  md.push("");
  md.push("This file is auto-generated by `node scripts/generate-portal-api-inventory.mjs`. Do not hand-edit.");
  md.push("");
  md.push(`- Generated: ${new Date().toISOString()}`);
  md.push(`- Portal route files: ${routeFiles.length}`);
  md.push(`- Operations (route+method): ${totalOps}`);
  md.push(`- Operations mapped to agent actions: ${coveredOps}`);
  md.push("");

  md.push("## Coverage Table");
  md.push("");
  md.push("| Endpoint | Method | Agent Actions | Route File |");
  md.push("|---|---:|---|---|");

  for (const r of rows) {
    const actions = r.covered.length ? r.covered.join(", ") : "";
    md.push(`| ${mdEscape(r.endpoint)} | ${mdEscape(r.method)} | ${mdEscape(actions)} | ${mdEscape(r.file)} |`);
  }

  md.push("");
  md.push("## Notes");
  md.push("");
  md.push("- Coverage is conservative: endpoints are only marked covered when an explicit action mapping exists in the generator script.");
  md.push("- Next step: expand `ACTION_COVERAGE` entries as new agent actions ship (and as we verify parity).");

  await fs.writeFile(OUT_MD, md.join("\n") + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_JSON)} and ${path.relative(REPO_ROOT, OUT_MD)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
