// Recursively resolve all *id fields in args (plain or $ref)
export async function resolveAllPortalAgentIds(args: Record<string, any>) {
  const resolved: Record<string, any> = { ...args };
  for (const key of Object.keys(args)) {
    if (key.endsWith("Id") || key.endsWith("id")) {
      resolved[key] = await resolvePortalAgentId(args, key);
    }
    // Optionally, recurse into nested objects/arrays if needed
  }
  return resolved;
}
// --- Universal ID/entity mapping and resolver ---
// Maps argument keys to entity types and resolution strategies
export const PortalAgentIdEntityMap: Record<string, string> = {
  threadId: "ai_chat_thread",
  messageId: "ai_chat_message",
  voiceId: "voice_agent_voice",
  domainId: "funnel_domain",
  formId: "funnel_form",
  funnelId: "funnel",
  pageId: "funnel_page",
  postId: "blog_post",
  newsletterId: "newsletter",
  subscriptionId: "billing_subscription",
  campaignId: "campaign",
  contactId: "contact",
  leadId: "lead",
  userId: "user",
  bookingId: "booking",
  tagId: "contact_tag",
  mediaItemId: "media_item",
  widgetId: "dashboard_widget",
  calendarId: "booking_calendar",
};

// Universal ID resolver: resolves plain IDs or $ref objects to entity objects
// Usage: await resolvePortalAgentId({ threadId: ..., ... }, "threadId")
export async function resolvePortalAgentId(args: Record<string, any>, key: string) {
  const val = args[key];
  if (!val) return null;
  // $ref support: { $ref: "some-contextual-key" }
  if (typeof val === "object" && val.$ref) {
    // TODO: Implement $ref resolution from context/session
    // For now, just return the $ref string for debugging
    return { $ref: val.$ref };
  }
  // Otherwise, treat as plain ID
  const entityType = PortalAgentIdEntityMap[key] || "unknown";
  // TODO: Implement actual entity lookup by type and ID
  // For now, just return a stub object
  return { id: val, entityType };
}
import { z } from "zod";
import { PORTAL_API_KEY_PERMISSION_VALUES } from "@/lib/portalApiKeys.shared";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeBookingQuestionKind(raw: unknown): "short" | "long" | "single_choice" | "multiple_choice" | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (s === "short" || s === "short answer" || s === "text" || s === "input" || s === "single line" || s === "single_line") return "short";
  if (s === "long" || s === "long answer" || s === "textarea" || s === "multi line" || s === "multi_line") return "long";
  if (s === "single_choice" || s === "single choice" || s === "radio" || s === "dropdown" || s === "select") return "single_choice";
  if (s === "multiple_choice" || s === "multiple choice" || s === "checkbox" || s === "multi select" || s === "multi_select") return "multiple_choice";
  return null;
}

function looksLikeHtml(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const s = raw.trim();
  if (!s) return false;
  return /<\s*\w+[\s>]/.test(s);
}

export const PortalAgentActionKeySchema = z.enum([
  "tasks.create",
  "tasks.create_for_all",
  "tasks.update",
  "tasks.list",
  "tasks.assignees.list",
  "funnel.create",

  "funnel_builder.settings.get",
  "funnel_builder.settings.update",
  "funnel_builder.domains.list",
  "funnel_builder.domains.create",
  "funnel_builder.domains.update",
  "funnel_builder.domains.verify",
  "funnel_builder.forms.list",
  "funnel_builder.forms.create",
  "funnel_builder.forms.get",
  "funnel_builder.forms.update",
  "funnel_builder.forms.delete",
  "funnel_builder.forms.submissions.list",
  "funnel_builder.forms.submissions.get",
  "funnel_builder.form_field_keys.get",
  "funnel_builder.funnels.list",
  "funnel_builder.funnels.get",
  "funnel_builder.funnels.update",
  "funnel_builder.funnels.delete",
  "funnel_builder.pages.list",
  "funnel_builder.pages.create",
  "funnel_builder.pages.update",
  "funnel_builder.pages.delete",
  "funnel_builder.pages.generate_html",
  "funnel_builder.pages.export_custom_html",
  "funnel_builder.pages.global_header",
  "funnel_builder.custom_code_block.generate",
  "funnel_builder.sales.products.list",
  "funnel_builder.sales.products.create",

  "blogs.appearance.get",
  "blogs.appearance.update",
  "blogs.site.get",
  "blogs.site.create",
  "blogs.site.update",
  "blogs.usage.get",
  "blogs.posts.list",
  "blogs.posts.create",
  "blogs.posts.get",
  "blogs.posts.update",
  "blogs.posts.delete",
  "blogs.posts.archive",
  "blogs.posts.export_markdown",
  "blogs.automation.settings.get",
  "blogs.automation.settings.update",
  "blogs.automation.cron.run",
  "blogs.generate_now",
  "blogs.posts.generate_draft",
  "blogs.posts.publish",
  "blogs.site.verify",
  "newsletter.site.get",
  "newsletter.site.update",
  "newsletter.usage.get",
  "newsletter.royalty_free_images.search",
  "newsletter.royalty_free_images.suggest",
  "newsletter.newsletters.list",
  "newsletter.newsletters.create",
  "newsletter.newsletters.get",
  "newsletter.newsletters.update",
  "newsletter.newsletters.send",
  "newsletter.audience.contacts.search",
  "newsletter.automation.settings.get",
  "newsletter.automation.settings.update",
  "newsletter.automation.cron.run",
  "newsletter.generate_now",

  "billing.summary.get",
  "billing.subscriptions.list",
  "billing.info.get",
  "billing.info.update",
  "billing.subscriptions.cancel",
  "billing.subscriptions.cancel_by_id",
  "billing.checkout_module",
  "billing.portal_session.create",
  "billing.credits_only.cancel",
  "billing.monthly_credits.cron.run",
  "billing.onboarding.checkout",
  "billing.onboarding.confirm",
  "billing.setup_intent.create",
  "billing.setup_intent.finalize",
  "billing.upgrade.checkout",
  "pricing.get",

  "seed_demo.run",

  // Canvas UI bridge actions (executed client-side inside the Work canvas iframe)
  "ui.canvas.click",
  "ui.canvas.type",
  "ui.canvas.select",
  "ui.canvas.set_checked",
  "ui.canvas.scroll",
  "ui.canvas.wait",

  "ads.next",
  "ads.click",
  "ads.claim",
  "ads.reward",

  "credits.get",
  "credits.auto_topup.set",
  "credits.topup.start",
  "credits.topup.confirm_checkout",
  "credit.contacts.list",
  "credit.pulls.list",
  "credit.pulls.create",
  "credit.disputes.letters.list",
  "credit.disputes.letter.get",
  "credit.disputes.letter.create",
  "credit.disputes.letter.update",
  "credit.disputes.letter.pdf.generate",
  "credit.disputes.letter.send",
  "credit.reports.list",
  "credit.reports.get",
  "credit.reports.import",
  "credit.reports.pull",
  "credit.reports.items.update",
  "automations.run",
  "automations.create",
  "automations.settings.get",
  "automations.settings.update",
  "automations.test_sms",
  "automations.cron.run",
  "contacts.list",
  "contacts.create",
  "contacts.get",
  "contacts.update",
  "contacts.delete",
  "contacts.tags.list",
  "contacts.tags.add",
  "contacts.tags.remove",
  "onboarding.status.get",
  "suggested_setup.preview.get",
  "suggested_setup.apply",

  "ai_agents.list",

  "ai_chat.threads.list",
  "ai_chat.threads.create",
  "ai_chat.threads.flush",
  "ai_chat.threads.update",
  "ai_chat.threads.delete",
  "ai_chat.threads.duplicate",
  "ai_chat.threads.share.get",
  "ai_chat.threads.share.set",
  "ai_chat.threads.choice.set",
  "ai_chat.threads.actions.run",
  "ai_chat.threads.runs.list",
  "ai_chat.threads.status.get",
  "ai_chat.threads.status.list",
  "ai_chat.messages.list",
  "ai_chat.messages.send",
  "ai_chat.scheduled.create",
  "ai_chat.scheduled.list",
  "ai_chat.scheduled.reschedule",
  "ai_chat.scheduled.update",
  "ai_chat.scheduled.delete",
  "ai_chat.attachments.upload",
  "ai_chat.actions.execute",
  "ai_chat.cron.run",

  "me.get",

  "auth.resend_verification",
  "auth.verify_email",
  "auth.verification_email.cron.run",
  "auth.webview_session.get",
  "engagement.ping",
  "engagement.active_time",

  "push.register",

  "referrals.link.get",
  "referrals.link.rotate",

  "profile.get",
  "profile.update",
  "profile.password.update",

  "integrations.twilio.get",
  "integrations.twilio.update",

  "integrations.stripe.get",
  "integrations.stripe.delete",
  "integrations.stripe.update",
  "integrations.sales_reporting.get",
  "integrations.sales_reporting.disconnect",
  "integrations.sales_reporting.update",
  "integrations.api_keys.list",
  "integrations.api_keys.create",
  "integrations.api_keys.update",
  "integrations.api_keys.delete",
  "integrations.api_keys.reveal",

  "follow_up.settings.get",
  "follow_up.settings.update",
  "follow_up.custom_variables.get",
  "follow_up.custom_variables.update",
  "follow_up.ai.generate_step",
  "follow_up.test_send",
  "follow_up.cron.run",

  "lead_scraping.settings.get",
  "lead_scraping.settings.update",
  "lead_scraping.run",
  "lead_scraping.leads.list",
  "lead_scraping.leads.update",
  "lead_scraping.leads.delete",
  "lead_scraping.contact.send",
  "lead_scraping.outbound.approve",
  "lead_scraping.outbound.send",
  "lead_scraping.outbound.ai.draft_template",
  "lead_scraping.cron.run",

  "notifications.recipients.list",

  "voice_agent.tools.get",
  "voice_agent.voices.list",
  "voice_agent.voices.preview",

  "webhooks.get",
  "bug_report.submit",
  "support_chat.send",

  "services.catalog.get",
  "services.status.get",
  "services.lifecycle.update",

  "mailbox.get",
  "mailbox.update",

  "missed_call_textback.settings.get",
  "missed_call_textback.settings.update",

  "contact_tags.list",
  "contact_tags.create",
  "contact_tags.update",
  "contact_tags.delete",

  "people.users.list",
  "people.users.invite",
  "people.users.update",
  "people.users.delete",
  "people.leads.update",
  "people.contacts.custom_variable_keys.get",
  "people.contacts.duplicates.get",
  "people.contacts.merge",
  "people.contacts.custom_variables.patch",
  "people.contacts.import",
  "inbox.threads.list",
  "inbox.thread.messages.list",
  "inbox.thread.contact.set",
  "inbox.scheduled.update",
  "inbox.scheduled.cron.run",
  "inbox.attachments.upload",
  "inbox.attachments.create_from_media",
  "inbox.attachments.delete",
  "inbox.settings.get",
  "inbox.settings.update",
  "inbox.send",
  "inbox.send_sms",
  "inbox.send_email",
  "reviews.send_request_for_booking",
  "reviews.send_request_for_contact",
  "reviews.reply",

  "reviews.settings.get",
  "reviews.settings.update",
  "reviews.site.get",
  "reviews.site.update",
  "reviews.inbox.list",
  "reviews.archive",
  "reviews.bookings.list",
  "reviews.contacts.search",
  "reviews.events.list",
  "reviews.handle.get",
  "reviews.questions.list",
  "reviews.questions.answer",
  "reviews.cron.run",
  "media.folders.list",
  "media.folders.update",
  "media.folder.ensure",
  "media.items.list",
  "media.items.move",
  "media.items.update",
  "media.items.delete",
  "media.items.create_from_blob",
  "media.import_remote_image",
  "media.list.get",
  "media.stats.get",
  "media.blob_upload.create",

  "dashboard.get",
  "dashboard.save",
  "dashboard.reset",
  "dashboard.add_widget",
  "dashboard.remove_widget",
  "dashboard.optimize",
  "dashboard.analysis.get",
  "dashboard.analysis.generate",
  "dashboard.quick_access.get",
  "dashboard.quick_access.update",
  "booking.calendar.create",
  "booking.availability.set_daily",
  "booking.calendars.get",
  "booking.calendars.update",
  "booking.bookings.list",
  "booking.cancel",
  "booking.reschedule",
  "booking.contact",

  "booking.settings.get",
  "booking.settings.update",
  "booking.form.get",
  "booking.form.update",
  "booking.site.get",
  "booking.site.update",
  "booking.suggestions.slots",

  "booking.reminders.settings.get",
  "booking.reminders.settings.update",
  "booking.reminders.ai.generate_step",
  "booking.reminders.cron.run",

  "nurture.campaigns.list",
  "nurture.campaigns.create",
  "nurture.campaigns.get",
  "nurture.campaigns.update",
  "nurture.campaigns.delete",
  "nurture.campaigns.steps.add",
  "nurture.steps.update",
  "nurture.steps.delete",
  "nurture.campaigns.enroll",
  "nurture.billing.confirm_checkout",
  "nurture.ai.generate_step",
  "nurture.cron.run",

  "ai_outbound_calls.campaigns.list",
  "ai_outbound_calls.campaigns.create",
  "ai_outbound_calls.campaigns.update",
  "ai_outbound_calls.campaigns.activity.get",
  "ai_outbound_calls.campaigns.messages_activity.get",
  "ai_outbound_calls.contacts.search",
  "ai_outbound_calls.manual_calls.list",
  "ai_outbound_calls.manual_calls.get",

  "ai_outbound_calls.campaigns.enroll_message",
  "ai_outbound_calls.campaigns.generate_agent_config",
  "ai_outbound_calls.campaigns.knowledge_base.sync",
  "ai_outbound_calls.campaigns.knowledge_base.upload",
  "ai_outbound_calls.campaigns.manual_call",
  "ai_outbound_calls.campaigns.messages_knowledge_base.sync",
  "ai_outbound_calls.campaigns.messages_knowledge_base.upload",
  "ai_outbound_calls.campaigns.preview_message_reply",
  "ai_outbound_calls.campaigns.sync_agent",
  "ai_outbound_calls.campaigns.sync_chat_agent",
  "ai_outbound_calls.cron.run",
  "ai_outbound_calls.manual_calls.refresh",
  "ai_outbound_calls.recordings.get",

  "ai_receptionist.settings.get",
  "ai_receptionist.highlights.get",
  "ai_receptionist.recordings.get",
  "ai_receptionist.recordings.demo.get",
  "ai_receptionist.demo_audio.get",

  "ai_receptionist.settings.update",
  "ai_receptionist.events.refresh",
  "ai_receptionist.events.delete",

  "ai_receptionist.settings.generate",
  "ai_receptionist.sms_system_prompt.generate",
  "ai_receptionist.text.polish",
  "ai_receptionist.sms_reply.preview",

  "ai_receptionist.sms_knowledge_base.sync",
  "ai_receptionist.voice_knowledge_base.sync",

  "ai_receptionist.sms_knowledge_base.upload",
  "ai_receptionist.voice_knowledge_base.upload",

  "business_profile.get",
  "business_profile.update",

  "elevenlabs.convai.token.get",
  "elevenlabs.convai.signed_url.get",

  "reporting.summary.get",
  "reporting.sales.get",
  "reporting.stripe.get",
]);

export type PortalAgentActionKey = z.infer<typeof PortalAgentActionKeySchema>;

export const PortalAgentActionArgsSchemaByKey = {
  "tasks.create": z
    .object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(5000).optional(),
      assignedToUserId: z.string().trim().min(1).optional().nullable(),
      assigneeUserId: z.string().trim().min(1).optional().nullable(),
      assignee: z.string().trim().min(1).max(160).optional().nullable(),
      assignedTo: z.string().trim().min(1).max(160).optional().nullable(),
      dueAtIso: z.string().trim().optional().nullable(),
      dueAt: z.string().trim().optional().nullable(),
      dueDate: z.string().trim().optional().nullable(),
    })
    .passthrough(),

  "tasks.create_for_all": z
    .object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(5000).optional(),
      dueAtIso: z.string().trim().optional().nullable(),
    })
    .strict(),

  "tasks.update": z
    .object({
      taskId: z.string().trim().min(1).max(120),
      status: z.union([z.enum(["OPEN", "DONE", "CANCELED"]), z.string().trim().min(1).max(40)]).optional(),
      title: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().max(5000).optional().nullable(),
      assignedToUserId: z.string().trim().min(1).optional().nullable(),
      assigneeUserId: z.string().trim().min(1).optional().nullable(),
      assignee: z.string().trim().min(1).max(160).optional().nullable(),
      assignedTo: z.string().trim().min(1).max(160).optional().nullable(),
      dueAtIso: z.string().trim().optional().nullable(),
      dueAt: z.string().trim().optional().nullable(),
      dueDate: z.string().trim().optional().nullable(),
    })
    .passthrough(),

  "tasks.list": z
    .object({
      status: z.union([z.enum(["OPEN", "DONE", "CANCELED", "ALL"]), z.string().trim().min(1).max(40)]).optional().nullable(),
      assigned: z.union([z.enum(["all", "me"]), z.string().trim().min(1).max(40)]).optional().nullable(),
      assignee: z.string().trim().min(1).max(80).optional().nullable(),
      q: z.string().trim().min(1).max(200).optional().nullable(),
      limit: z.number().int().min(1).max(500).optional().nullable(),
    })
    .passthrough(),

  "tasks.assignees.list": z.object({}).strict(),

  "notifications.recipients.list": z.object({}).strict(),

  "ai_chat.threads.list": z.object({}).strict(),
  "ai_chat.threads.create": z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  "ai_chat.threads.flush": z
    .object({
      threadId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "ai_chat.threads.update": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(120).optional(),
      pinned: z.boolean().optional(),
    })
    .strict()
    .refine((d) => typeof d.title === "string" || typeof d.pinned === "boolean", { message: "No changes" }),

  "ai_chat.threads.delete": z
    .object({
      threadId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "ai_chat.threads.duplicate": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),

  "ai_chat.threads.share.get": z
    .object({
      threadId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "ai_chat.threads.share.set": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      userIds: z.array(z.string().trim().min(1).max(120)).max(100),
    })
    .strict(),

  "ai_chat.threads.choice.set": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      kind: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(200),
    })
    .strict(),

  "ai_chat.threads.actions.run": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      action: z.enum(["pin", "unpin", "delete", "duplicate"]),
      // Optional override for duplicate title
      title: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),

  "ai_chat.threads.runs.list": z
    .object({
      threadId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "ai_chat.threads.status.get": z
    .object({
      threadId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "ai_chat.threads.status.list": z.object({}).strict(),

  "ai_chat.messages.list": z
    .object({
      threadId: z.string().trim().min(1).max(120),
    })
    .strict(),
  "ai_chat.messages.send": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      text: z.string().trim().max(4000).optional(),
      url: z.string().trim().optional(),
      attachments: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(200).optional(),
              fileName: z.string().trim().min(1).max(200),
              mimeType: z.string().trim().min(1).max(120).optional(),
              fileSize: z.number().int().nonnegative().optional(),
              url: z.string().trim().min(1).max(500),
            })
            .strict(),
        )
        .max(10)
        .optional(),
    })
    .strict()
    .refine(
      (d) => Boolean((d.text || "").trim()) || (Array.isArray(d.attachments) && d.attachments.length > 0),
      { message: "Text or attachments required" },
    ),

  "ai_chat.scheduled.create": z
    .object({
      // When invoked from the AI chat thread, the API layer will inject the current threadId.
      threadId: z.string().trim().min(1).max(120).optional(),
      text: z.string().trim().min(1).max(4000),
      // Optional browser/user timezone hint (IANA name) used when computing sendAtLocal.
      // If omitted, the executor will fall back to the member or owner timezone.
      clientTimeZone: z.string().trim().min(1).max(80).optional(),
      // Prefer sendAtLocal for “every weekday at 9am”-style schedules (timezone-safe).
      // sendAtIso remains supported for absolute timestamps.
      sendAtIso: z.string().trim().min(1).max(64).optional(),
      sendAtLocal: z
        .object({
          // 1=Mon ... 7=Sun (ISO weekday)
          isoWeekday: z.number().int().min(1).max(7),
          // "HH:mm" (24h)
          timeLocal: z.string().trim().regex(/^\d{2}:\d{2}$/),
          // Optional; if omitted, executor defaults to owner timezone (or UTC).
          timeZone: z.string().trim().min(1).max(80).optional(),
        })
        .strict()
        .optional(),
      repeatEveryMinutes: z.number().int().min(0).max(60 * 24 * 365).optional(),
    })
    .strict(),

  // The planner often includes a `channel` hint (e.g. "sms").
  // Listing scheduled AI-chat tasks is safe to run even if extra keys appear,
  // so tolerate them to avoid hard-failing the entire plan execution.
  "ai_chat.scheduled.list": z
    .object({
      channel: z.string().trim().min(1).max(40).optional(),
    })
    .catchall(z.unknown()),
  "ai_chat.scheduled.update": z
    .object({
      messageId: z.string().trim().min(1).max(120).optional(),
      text: z.string().trim().min(1).max(4000).optional(),
      clientTimeZone: z.string().trim().min(1).max(80).optional(),
      sendAtIso: z.string().trim().min(1).max(64).nullable().optional(),
      sendAtLocal: z
        .object({
          isoWeekday: z.number().int().min(1).max(7),
          timeLocal: z.string().trim().regex(/^\d{2}:\d{2}$/),
          timeZone: z.string().trim().min(1).max(80).optional(),
        })
        .strict()
        .optional(),
      repeatEveryMinutes: z.number().int().min(0).max(60 * 24 * 365).nullable().optional(),
    })
    .strict(),

  // Bulk update scheduled AI-chat items by time-of-day.
  // This is designed for “change all scheduled SMS tasks to 9am”-style commands.
  "ai_chat.scheduled.reschedule": z
    .object({
      // Optional filter. If provided, only scheduled messages whose envelope contains a matching inbox send step will be updated.
      channel: z.enum(["sms", "email"]).optional(),
      // Optional: constrain to a thread.
      threadId: z.string().trim().min(1).max(120).optional(),
      // Optional explicit list of message IDs to reschedule.
      messageIds: z.array(z.string().trim().min(1).max(120)).min(1).max(200).optional(),
      // Required local time-of-day in 24h format.
      timeLocal: z.string().trim().regex(/^\d{2}:\d{2}$/),
      // Optional device/user timezone hint (preferred over member/owner tz when timeZone is omitted).
      clientTimeZone: z.string().trim().min(1).max(80).optional(),
      // Optional; if omitted, preserves existing recurrence timezone (or falls back to member/owner tz).
      timeZone: z.string().trim().min(1).max(80).optional(),
      // Include one-time scheduled messages (repeatEveryMinutes is null/0). Default true.
      includeOneTime: z.boolean().optional(),
      // Safety cap.
      limit: z.number().int().min(1).max(200).optional(),
    })
    .strict(),
  "ai_chat.scheduled.delete": z
    .object({
      messageId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),

  "ai_chat.attachments.upload": z
    .object({
      files: z
        .array(
          z
            .object({
              fileName: z.string().trim().min(1).max(200),
              mimeType: z.string().trim().min(1).max(120).optional(),
              contentBase64: z.string().trim().min(1).max(30_000_000),
            })
            .strict(),
        )
        .min(1)
        .max(10),
    })
    .strict(),

  "ai_chat.actions.execute": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      action: PortalAgentActionKeySchema,
      args: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),

  "ai_chat.cron.run": z
    .object({
      limit: z.number().int().min(1).max(200).optional(),
    })
    .strict(),

  "voice_agent.tools.get": z.object({}).strict(),
  "voice_agent.voices.list": z.object({}).strict(),
  "voice_agent.voices.preview": z
    .object({
      voiceId: z.string().trim().min(1).max(200),
      text: z.string().trim().min(1).max(500),
    })
    .strict(),

  "funnel.create": z
    .object({
      name: z.string().trim().min(1).max(120),
      slug: z.string().trim().min(2).max(60).optional().nullable(),
    })
    .strict(),

  "funnel_builder.settings.get": z.object({}).strict(),

  "funnel_builder.settings.update": z
    .object({
      notifyEmails: z.array(z.string().trim().max(200)).max(10).optional(),
      webhookUrl: z.string().trim().max(800).optional().nullable(),
      regenerateSecret: z.boolean().optional().nullable(),
    })
    .strict(),

  "funnel_builder.domains.list": z.object({}).strict(),

  "funnel_builder.domains.create": z
    .object({
      domain: z.string().trim().min(1).max(253),
    })
    .strict(),

  "funnel_builder.domains.update": z
    .object({
      domain: z.string().trim().min(1).max(253),
      rootMode: z.enum(["DISABLED", "DIRECTORY", "REDIRECT"]).optional().nullable(),
      rootFunnelSlug: z.string().trim().max(80).optional().nullable(),
    })
    .strict(),

  "funnel_builder.domains.verify": z
    .object({
      domainId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.forms.list": z.object({}).strict(),

  "funnel_builder.forms.create": z
    .object({
      slug: z.string().trim().min(2).max(60),
      name: z.string().trim().max(120).optional().nullable(),
    })
    .strict(),

  "funnel_builder.forms.get": z
    .object({
      formId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.forms.update": z
    .object({
      formId: z.string().trim().min(1).max(120),
      name: z.string().trim().max(120).optional(),
      status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
      slug: z.string().trim().max(60).optional(),
      schemaJson: z.unknown().optional(),
    })
    .strict(),

  "funnel_builder.forms.delete": z
    .object({
      formId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.forms.submissions.list": z
    .object({
      formId: z.string().trim().min(1).max(120),
      limit: z.number().int().min(1).max(100).optional().nullable(),
      cursor: z.string().trim().max(120).optional().nullable(),
    })
    .strict(),

  "funnel_builder.forms.submissions.get": z
    .object({
      formId: z.string().trim().min(1).max(120),
      submissionId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.form_field_keys.get": z.object({}).strict(),

  "funnel_builder.funnels.list": z.object({}).strict(),

  "funnel_builder.funnels.get": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.funnels.update": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      name: z.string().trim().max(120).optional(),
      status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
      slug: z.string().trim().max(60).optional(),
      domain: z.union([z.string().trim().max(253), z.null()]).optional(),
      seo: z.unknown().optional().nullable(),
    })
    .strict(),

  "funnel_builder.funnels.delete": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.pages.list": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.pages.create": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      slug: z.string().trim().min(1).max(64),
      title: z.string().trim().max(200).optional().nullable(),
      contentMarkdown: z.string().optional().nullable(),
      sortOrder: z.number().finite().optional().nullable(),
    })
    .strict(),

  "funnel_builder.pages.update": z
    .preprocess((raw) => {
      if (!isPlainObject(raw)) return raw;
      const r = raw as Record<string, any>;
      const out: Record<string, unknown> = {};

      const normalizeEditorMode = (v: unknown): string | undefined => {
        if (typeof v !== "string") return undefined;
        const s = v.trim();
        if (!s) return undefined;
        const u = s.toUpperCase().replace(/[^A-Z]/g, "_");
        if (u === "HTML" || u === "CUSTOMHTML" || u === "CUSTOM_HTML" || u === "CUSTOM" || u === "TEMPLATE" || u === "RAW") return "CUSTOM_HTML";
        if (u === "MD" || u === "MARKDOWN" || u === "MARK_DOWN") return "MARKDOWN";
        if (u === "BLOCK" || u === "BLOCKS" || u === "BUILDER") return "BLOCKS";
        return s;
      };

      if (typeof r.funnelId === "string") out.funnelId = r.funnelId;
      if (typeof r.pageId === "string") out.pageId = r.pageId;
      if (r.title !== undefined) out.title = r.title;
      if (r.sortOrder !== undefined) out.sortOrder = r.sortOrder;
      else if (r.order !== undefined) out.sortOrder = r.order;
      if (r.editorMode !== undefined) out.editorMode = normalizeEditorMode(r.editorMode) ?? r.editorMode;
      if (r.slug !== undefined) out.slug = r.slug;
      else if (r.pageSlug !== undefined) out.slug = r.pageSlug;
      if (r.seo !== undefined) out.seo = r.seo;
      if (r.blocksJson !== undefined) out.blocksJson = r.blocksJson;
      else if (r.blocks !== undefined) out.blocksJson = r.blocks;
      if (r.customChatJson !== undefined) out.customChatJson = r.customChatJson;

      const customHtml = r.customHtml ?? r.html ?? r.contentHtml ?? r.bodyHtml;
      if (customHtml !== undefined) out.customHtml = customHtml;

      const contentMarkdown = r.contentMarkdown ?? r.markdown ?? r.bodyMarkdown;
      if (contentMarkdown !== undefined) out.contentMarkdown = contentMarkdown;

      // Common alias: people/models use `content`.
      if (r.content !== undefined && out.contentMarkdown === undefined && out.customHtml === undefined) {
        if (looksLikeHtml(r.content)) {
          out.customHtml = r.content;
          out.editorMode = (out.editorMode as any) ?? "CUSTOM_HTML";
        } else {
          out.contentMarkdown = r.content;
          out.editorMode = (out.editorMode as any) ?? "MARKDOWN";
        }
      }

      // If HTML is set but editorMode omitted, default to CUSTOM_HTML.
      if (out.customHtml !== undefined && out.editorMode === undefined) out.editorMode = "CUSTOM_HTML";

      return out;
    },
    z
      .object({
        funnelId: z.string().trim().min(1).max(120),
        pageId: z.string().trim().min(1).max(120),
        title: z.string().trim().max(200).optional().nullable(),
        contentMarkdown: z.string().optional().nullable(),
        sortOrder: z.number().finite().optional().nullable(),
        editorMode: z.enum(["MARKDOWN", "BLOCKS", "CUSTOM_HTML"]).optional().nullable(),
        customHtml: z.string().optional().nullable(),
        blocksJson: z.unknown().optional().nullable(),
        customChatJson: z.unknown().optional().nullable(),
        slug: z.string().trim().max(64).optional().nullable(),
        seo: z.unknown().optional().nullable(),
      })
      .strict()),

  "funnel_builder.pages.delete": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      pageId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "funnel_builder.pages.generate_html": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      pageId: z.string().trim().min(1).max(120),
      prompt: z.string().trim().min(1).max(4000),
      calendarId: z.string().trim().min(1).max(120).optional(),
      currentHtml: z.string().optional().nullable(),
      attachments: z
        .array(
          z
            .object({
              url: z.string().trim().min(1).max(800),
              fileName: z.string().trim().max(200).optional(),
              mimeType: z.string().trim().max(120).optional(),
            })
            .strip(),
        )
        .max(12)
        .optional()
        .nullable(),
      contextKeys: z.array(z.string().trim().min(1).max(80)).max(30).optional().nullable(),
      contextMedia: z
        .array(
          z
            .object({
              url: z.string().trim().min(1).max(800),
              fileName: z.string().trim().max(200).optional(),
              mimeType: z.string().trim().max(120).optional(),
            })
            .strip(),
        )
        .max(24)
        .optional()
        .nullable(),
    })
    .strict(),

  "funnel_builder.pages.export_custom_html": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      pageId: z.string().trim().min(1).max(120),
      blocksJson: z.unknown().optional(),
      title: z.string().trim().max(200).optional(),
      setEditorMode: z.enum(["BLOCKS", "CUSTOM_HTML"]).optional(),
    })
    .strict(),

  "funnel_builder.custom_code_block.generate": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      pageId: z.string().trim().min(1).max(120),
      prompt: z.string().trim().min(1).max(4000),
      currentHtml: z.string().optional().nullable(),
      currentCss: z.string().optional().nullable(),
      contextKeys: z.array(z.string().trim().min(1).max(80)).max(30).optional().nullable(),
      contextMedia: z
        .array(
          z
            .object({
              url: z.string().trim().min(1).max(800),
              fileName: z.string().trim().max(200).optional(),
              mimeType: z.string().trim().max(120).optional(),
            })
            .strip(),
        )
        .max(24)
        .optional()
        .nullable(),
    })
    .strict(),

  "funnel_builder.pages.global_header": z
    .discriminatedUnion("mode", [
      z
        .object({
          mode: z.literal("apply"),
          funnelId: z.string().trim().min(1).max(120),
          headerBlock: z.unknown(),
        })
        .strict(),
      z
        .object({
          mode: z.literal("unset"),
          funnelId: z.string().trim().min(1).max(120),
          keepOnPageId: z.string().trim().min(1).max(120),
          localHeaderBlock: z.unknown(),
        })
        .strict(),
    ]),

  "funnel_builder.sales.products.list": z.object({}).strict(),

  "funnel_builder.sales.products.create": z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional().nullable(),
      imageUrls: z.array(z.string().trim().url().max(500)).max(8).optional().nullable(),
      priceCents: z.number().int().min(50).max(100_000_00),
      currency: z.string().trim().min(3).max(10).optional().nullable(),
    })
    .strict(),

  "blogs.appearance.get": z.object({}).passthrough(),

  "blogs.appearance.update": z
    .object({
      useBrandFont: z.boolean().optional(),
      titleFontKey: z.string().trim().max(40).optional(),
      bodyFontKey: z.string().trim().max(40).optional(),
    })
    .strict(),

  "blogs.site.get": z.object({}).passthrough(),

  "blogs.site.create": z
    .object({
      name: z.string().trim().min(2).max(120),
      primaryDomain: z.string().trim().max(253).optional().or(z.literal("")),
      slug: z.string().trim().min(3).max(80).optional().or(z.literal("")),
    })
    .strict(),

  "blogs.site.update": z
    .object({
      name: z.string().trim().min(2).max(120),
      primaryDomain: z.string().trim().max(253).optional().or(z.literal("")),
      slug: z.string().trim().min(3).max(80).optional().or(z.literal("")),
    })
    .strict(),

  "blogs.usage.get": z
    .object({
      range: z.enum(["7d", "30d", "90d", "all"]).optional(),
    })
    .passthrough(),

  "blogs.posts.list": z
    .object({
      take: z.number().int().min(1).max(200).optional(),
      includeArchived: z.boolean().optional(),
    })
    .passthrough(),

  "blogs.posts.create": z
    .object({
      title: z.string().trim().max(180).optional(),
    })
    .passthrough(),

  "blogs.posts.get": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "blogs.posts.update": z
    .object({
      postId: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(180),
      slug: z.string().trim().min(1).max(120),
      excerpt: z.string().max(6000),
      content: z.string().max(200000),
      seoKeywords: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
      publishedAt: z
        .string()
        .datetime({ offset: true })
        .nullable()
        .optional(),
      archived: z.boolean().optional(),
    })
    .passthrough(),

  "blogs.posts.delete": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "blogs.posts.archive": z
    .object({
      postId: z.string().trim().min(1).max(120),
      archived: z.boolean(),
    })
    .passthrough(),

  "blogs.posts.export_markdown": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "blogs.automation.settings.get": z.object({}).passthrough(),

  "blogs.automation.settings.update": z
    .object({
      enabled: z.boolean(),
      frequencyDays: z.number().int().min(1).max(30),
      topics: z.array(z.string().trim().min(1).max(200)).max(50),
      autoPublish: z.boolean().optional(),
    })
    .passthrough(),

  "blogs.automation.cron.run": z.object({}).passthrough(),

  "blogs.generate_now": z.object({}).passthrough(),

  "blogs.posts.generate_draft": z
    .object({
      postId: z.string().trim().min(1).max(120),
      prompt: z.string().trim().min(1).max(2000).optional().nullable(),
      topic: z.string().trim().min(1).max(200).optional().nullable(),
    })
    .passthrough(),

  "blogs.posts.publish": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "blogs.site.verify": z
    .object({
      domain: z.string().trim().min(1).max(260),
    })
    .strict(),

  "newsletter.site.get": z.object({}).passthrough(),

  "newsletter.site.update": z
    .object({
      name: z.string().trim().min(2).max(120),
      primaryDomain: z.string().trim().max(253).optional().nullable(),
      slug: z.string().trim().max(80).optional().nullable(),
    })
    .strict(),

  "newsletter.usage.get": z
    .object({
      range: z.enum(["7d", "30d", "90d", "all"]).optional(),
    })
    .passthrough(),

  "newsletter.royalty_free_images.search": z
    .object({
      q: z.string().trim().min(2).max(120),
      take: z.number().int().min(1).max(20).optional(),
    })
    .strict(),

  "newsletter.royalty_free_images.suggest": z
    .object({
      prompt: z.string().trim().min(2).max(200),
      take: z.number().int().min(1).max(20).optional(),
    })
    .strict(),

  "newsletter.newsletters.list": z
    .object({
      kind: z.enum(["external", "internal"]).optional(),
      take: z.number().int().min(1).max(200).optional(),
    })
    .passthrough(),

  "newsletter.newsletters.create": z
    .object({
      kind: z.enum(["external", "internal"]).optional().nullable(),
      status: z.enum(["DRAFT", "READY"]).optional(),
      title: z.string().trim().min(1).max(180),
      excerpt: z.string().trim().max(6000).optional().nullable(),
      content: z.string().trim().max(200000).optional().nullable(),
      smsText: z
        .string()
        .trim()
        .max(240)
        .optional()
        .nullable()
        .transform((v) => {
          if (v === undefined) return null;
          if (v === null) return null;
          const t = String(v).trim();
          return t ? t : null;
        }),
    })
    .passthrough(),

  "newsletter.newsletters.get": z
    .object({
      newsletterId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "newsletter.newsletters.update": z
    .object({
      newsletterId: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(180).optional(),
      excerpt: z.string().trim().max(6000).optional(),
      content: z.string().trim().max(200000).optional(),
      smsText: z
        .string()
        .trim()
        .max(240)
        .optional()
        .nullable()
        .transform((v) => {
          if (v === undefined) return null;
          if (v === null) return null;
          const t = String(v).trim();
          return t ? t : null;
        }),
      hostedOnly: z.boolean().optional(),
    })
    .passthrough(),

  "newsletter.newsletters.send": z
    .object({
      newsletterId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "newsletter.audience.contacts.search": z
    .object({
      q: z.string().trim().max(120).optional(),
      ids: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
      take: z.number().int().min(1).max(200).optional(),
    })
    .passthrough(),

  "newsletter.automation.settings.get": z
    .object({
      kind: z.enum(["external", "internal"]).optional(),
    })
    .passthrough(),

  "newsletter.automation.settings.update": z
    .object({
      kind: z.enum(["external", "internal"]),
      enabled: z.boolean(),
      frequencyDays: z.number().int().min(1).max(365),
      requireApproval: z.boolean().optional(),
      channels: z.object({ email: z.boolean().optional(), sms: z.boolean().optional() }).optional(),
      topics: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
      promptAnswers: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(2000)).optional(),
      deliveryEmailHint: z.string().trim().max(1500).optional(),
      deliverySmsHint: z.string().trim().max(800).optional(),
      includeImages: z.boolean().optional(),
      royaltyFreeImages: z.boolean().optional(),
      includeImagesWhereNeeded: z.boolean().optional(),
      fontKey: z.string().trim().min(1).max(40).optional(),
      audience: z
        .object({
          tagIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
          contactIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
          emails: z.array(z.string().trim().min(1).max(254)).max(200).optional(),
          userIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
          sendAllUsers: z.boolean().optional(),
        })
        .optional(),
    })
    .passthrough(),

  "newsletter.generate_now": z
    .object({
      kind: z.enum(["external", "internal"]),
    })
    .passthrough(),

  "newsletter.automation.cron.run": z.object({}).passthrough(),

  "billing.summary.get": z.object({}).passthrough(),

  "billing.subscriptions.list": z.object({}).passthrough(),

  "billing.info.get": z.object({}).passthrough(),

  "billing.info.update": z
    .object({
      billingEmail: z.string().email().optional(),
      billingName: z.string().trim().min(1).max(120).optional(),
      billingPhone: z.string().trim().min(1).max(40).optional(),
      billingAddress: z.string().trim().min(1).max(220).optional(),
      billingCity: z.string().trim().max(120).optional(),
      billingState: z.string().trim().max(120).optional(),
      billingPostalCode: z.string().trim().max(40).optional(),
    })
    .passthrough(),

  "billing.subscriptions.cancel": z
    .object({
      immediate: z.boolean().optional(),
    })
    .passthrough(),

  "billing.subscriptions.cancel_by_id": z
    .object({
      subscriptionId: z.string().trim().min(1).max(120),
      immediate: z.boolean().optional(),
    })
    .passthrough(),

  "billing.checkout_module": z
    .object({
      module: z.enum([
        "blog",
        "booking",
        "automations",
        "reviews",
        "newsletter",
        "nurture",
        "aiReceptionist",
        "leadScraping",
        "crm",
        "leadOutbound",
      ]),
      successPath: z.string().trim().min(1).max(2000).optional(),
      cancelPath: z.string().trim().min(1).max(2000).optional(),
      promoCode: z.string().trim().min(1).max(64).optional(),
      campaignId: z.string().trim().min(1).max(64).optional(),
      serviceSlug: z.string().trim().min(1).max(64).optional(),
    })
    .passthrough(),

  "billing.portal_session.create": z
    .object({
      returnPath: z.string().trim().min(1).max(2000).optional(),
    })
    .passthrough(),

  "billing.credits_only.cancel": z
    .object({
      action: z.enum(["cancel", "resume"]),
    })
    .passthrough(),

  "billing.monthly_credits.cron.run": z
    .object({
      limit: z.number().int().min(1).max(5000).optional(),
      maxCatchUpGiftsPerOwner: z.number().int().min(0).max(50).optional(),
    })
    .passthrough(),

  "billing.onboarding.checkout": z
    .object({
      planIds: z.array(z.string().trim().min(1).max(80)).max(20),
      planQuantities: z.record(z.string().trim().min(1).max(80), z.number().int().min(0).max(50)).optional(),
      couponCode: z.string().trim().max(80).optional(),
    })
    .passthrough(),

  "billing.onboarding.confirm": z
    .object({
      sessionId: z.string().trim().min(10).max(200).optional(),
      bypass: z.boolean().optional(),
    })
    .passthrough(),

  "billing.setup_intent.create": z.object({}).passthrough(),

  "billing.setup_intent.finalize": z
    .object({
      setupIntentId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "billing.upgrade.checkout": z
    .object({
      bundleId: z.enum(["launch-kit", "sales-loop", "brand-builder"]),
    })
    .passthrough(),

  "pricing.get": z.object({}).strict(),

  "ads.next": z
    .object({
      placement: z.enum([
        "SIDEBAR_BANNER",
        "TOP_BANNER",
        "BILLING_SPONSORED",
        "FULLSCREEN_REWARD",
        "POPUP_CARD",
        "HOSTED_BLOG_PAGE",
        "HOSTED_REVIEWS_PAGE",
      ]),
      path: z.string().trim().max(500).optional().nullable(),
      excludeCampaignIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
    })
    .strict(),

  "ads.click": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      placement: z.enum([
        "SIDEBAR_BANNER",
        "TOP_BANNER",
        "BILLING_SPONSORED",
        "FULLSCREEN_REWARD",
        "POPUP_CARD",
        "HOSTED_BLOG_PAGE",
        "HOSTED_REVIEWS_PAGE",
      ]),
      path: z.string().trim().max(500).optional().nullable(),
      to: z.string().trim().max(2000).optional().nullable(),
    })
    .strict(),

  "ads.claim": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      watchedSeconds: z.number().int().min(0).max(60 * 60).optional(),
      path: z.string().trim().max(500).optional().nullable(),
    })
    .strict(),

  "ads.reward": z.object({}).strict(),

  "credits.get": z.object({}).strict(),

  "credits.auto_topup.set": z
    .object({
      autoTopUp: z.boolean(),
    })
    .strict(),

  "credits.topup.start": z
    .object({
      credits: z.number().int().min(1).max(500_000).optional(),
      // Backwards compatibility (legacy UI).
      packages: z.number().int().min(1).max(200).optional(),
    })
    .strict()
    .refine((v) => typeof v.credits === "number" || typeof v.packages === "number", {
      message: "credits is required",
    }),

  "credits.topup.confirm_checkout": z
    .object({
      sessionId: z.string().trim().min(1).max(200),
    })
    .strict(),

  "credit.contacts.list": z
    .object({
      q: z.string().trim().max(120).optional().nullable(),
    })
    .strict(),

  "credit.pulls.list": z
    .object({
      contactId: z.string().trim().min(1).max(120).optional().nullable(),
    })
    .strict(),

  "credit.pulls.create": z
    .object({
      contactId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "credit.disputes.letters.list": z
    .object({
      contactId: z.string().trim().min(1).max(120).optional().nullable(),
    })
    .strict(),

  "credit.disputes.letter.get": z
    .object({
      letterId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "credit.disputes.letter.create": z
    .object({
      contactId: z.string().trim().min(1).max(120),
      recipientName: z.string().trim().max(120).optional().nullable(),
      recipientAddress: z.string().trim().max(600).optional().nullable(),
      disputesText: z.string().trim().min(3).max(5000),
      creditPullId: z.string().trim().max(120).optional().nullable(),
    })
    .strict(),

  "credit.disputes.letter.update": z
    .object({
      letterId: z.string().trim().min(1).max(120),
      subject: z.string().trim().max(200).optional(),
      bodyText: z.string().trim().max(20000).optional(),
    })
    .strict(),

  "credit.disputes.letter.pdf.generate": z
    .object({
      letterId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "credit.disputes.letter.send": z
    .object({
      letterId: z.string().trim().min(1).max(120),
      to: z.string().trim().email().optional().nullable(),
    })
    .strict(),

  "credit.reports.list": z.object({}).strict(),

  "credit.reports.get": z
    .object({
      reportId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "credit.reports.import": z
    .object({
      contactId: z.string().trim().min(1).max(120).optional().nullable(),
      provider: z.string().trim().max(40).optional().nullable(),
      rawJson: z.unknown(),
    })
    .strict(),

  "credit.reports.pull": z
    .object({
      contactId: z.string().trim().min(1).max(120),
      provider: z.string().trim().max(40).optional().nullable(),
    })
    .strict(),

  "credit.reports.items.update": z
    .object({
      reportId: z.string().trim().min(1).max(120),
      itemId: z.string().trim().min(1).max(120),
      auditTag: z.enum(["PENDING", "NEGATIVE", "POSITIVE"]).optional(),
      disputeStatus: z.string().trim().max(60).optional().nullable(),
    })
    .strict(),

  "automations.run": z
    .object({
      automationId: z.string().trim().min(1).max(80),
      contact: z
        .object({
          id: z.string().max(80).optional(),
          name: z.string().max(200).optional(),
          email: z.string().max(200).optional(),
          phone: z.string().max(32).optional(),
        })
        .optional(),
    })
      .passthrough(),

  "automations.create": z
    .object({
      name: z.string().trim().min(1).max(80),
      template: z.enum(["blank", "post_appointment_nurture_enrollment"]).optional(),
      nurtureCampaignId: z.string().trim().min(1).max(80).optional().nullable(),
      // Optional natural-language automation spec from the user.
      prompt: z.string().trim().max(2000).optional(),
      // Optional contact used to target scheduled automations (e.g., scheduled SMS to a specific person).
      targetContactId: z.string().trim().min(1).max(120).optional(),
    })
    .passthrough(),

  "automations.settings.get": z.object({}).passthrough(),

  "automations.settings.update": z
    .object({
      automations: z.array(z.unknown()).max(50),
    })
    .passthrough(),

  "automations.test_sms": z
    .object({
      automationId: z.string().trim().min(1).max(200),
      from: z.string().trim().min(3).max(32),
      body: z.string().trim().min(0).max(2000).default(""),
    })
    .passthrough(),

  "automations.cron.run": z.object({}).passthrough(),

  "contacts.list": z
    .object({
      q: z.string().trim().min(1).max(200).optional().nullable(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .passthrough(),

  "contacts.create": z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().max(120).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      tags: z.union([z.array(z.string().trim().min(1).max(60)).max(10), z.string().trim().max(600)]).optional().nullable(),
      customVariables: z.record(z.string().trim().max(60), z.string().trim().max(120)).optional().nullable(),
    })
    .passthrough(),

  "contacts.get": z
    .object({
      contactId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "contacts.update": z
    .object({
      contactId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(120).optional(),
      email: z.string().trim().max(200).optional().nullable(),
      phone: z.string().trim().max(60).optional().nullable(),
      customVariables: z.record(z.string().trim().max(60), z.string()).optional().nullable(),
    })
    .passthrough()
    .refine((value) => value.name !== undefined || value.email !== undefined || value.phone !== undefined || value.customVariables !== undefined, {
      message: "No contact changes provided",
    }),

  "contacts.delete": z
    .object({
      contactId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "contacts.tags.list": z
    .object({
      contactId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "contacts.tags.add": z
    .object({
      contactId: z.string().trim().min(1).max(120),
      tagId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "contacts.tags.remove": z
    .object({
      contactId: z.string().trim().min(1).max(120),
      tagId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "onboarding.status.get": z.object({}).strict(),

  "suggested_setup.preview.get": z.object({}).strict(),
  "suggested_setup.apply": z
    .object({
      actionIds: z.array(z.string().trim().min(1)).min(1).max(50),
    })
    .strict(),

  "ai_agents.list": z.object({}).strict(),

  "contact_tags.list": z.object({}).strict(),

  "contact_tags.create": z
    .object({
      name: z.string().trim().min(1).max(60),
      color: z
        .string()
        .trim()
        .max(16)
        .optional()
        .nullable()
        .transform((v) => {
          if (v === null) return null;
          if (v === undefined) return null;
          return v === "" ? null : v;
        }),
    })
    .strict(),

  "contact_tags.update": z
    .object({
      tagId: z.string().trim().min(1).max(120),
      name: z.string().trim().max(60).optional(),
      color: z
        .string()
        .trim()
        .max(16)
        .optional()
        .transform((v) => (v === "" ? null : v)),
    })
    .strict()
    .refine((v) => v.name !== undefined || v.color !== undefined, { message: "No changes" }),

  "contact_tags.delete": z
    .object({
      tagId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "me.get": z.object({}).strict(),

  "auth.resend_verification": z.object({}).strict(),

  "auth.verify_email": z
    .object({
      token: z.string().trim().min(1).max(500),
    })
    .strict(),

  "auth.verification_email.cron.run": z.object({}).strict(),

  "auth.webview_session.get": z
    .object({
      bearerToken: z.string().trim().min(1).max(4000),
      nextPath: z.string().trim().max(500).optional().nullable(),
    })
    .strict(),

  "engagement.ping": z
    .object({
      path: z.string().trim().max(512).optional().nullable(),
      source: z.string().trim().max(64).optional().nullable(),
    })
    .strict(),

  "engagement.active_time": z
    .object({
      dtSec: z.number().int().min(1).max(60),
      path: z.string().trim().max(512).optional().nullable(),
    })
    .strict(),

  "push.register": z
    .object({
      expoPushToken: z.string().trim().min(1).max(400),
      platform: z.string().trim().max(64).optional().nullable(),
      deviceName: z.string().trim().max(128).optional().nullable(),
    })
    .strict(),

  "referrals.link.get": z.object({}).strict(),

  "referrals.link.rotate": z.object({}).strict(),

  "profile.get": z.object({}).passthrough(),

  "profile.update": z
    .object({
      // Name/email updates require currentPassword (mirrors portal UI).
      currentPassword: z.string().min(1).max(200).optional(),

      firstName: z.string().trim().max(80).optional(),
      lastName: z.string().trim().max(80).optional(),
      email: z.string().trim().email().max(200).optional(),

      phone: z.string().trim().max(40).optional().nullable(),
      city: z.string().trim().max(120).optional().nullable(),
      state: z.string().trim().max(80).optional().nullable(),

      voiceAgentId: z.string().trim().max(120).optional().nullable(),
      voiceAgentApiKey: z.string().trim().max(200).optional().nullable(),

      enableDefaultSmsNotifications: z.boolean().optional().nullable(),
    })
    .passthrough()
    .refine(
      (v) =>
        v.firstName !== undefined ||
        v.lastName !== undefined ||
        v.email !== undefined ||
        v.phone !== undefined ||
        v.city !== undefined ||
        v.state !== undefined ||
        v.voiceAgentId !== undefined ||
        v.voiceAgentApiKey !== undefined ||
        v.enableDefaultSmsNotifications !== undefined,
      { message: "No changes" },
    )
    .refine((v) => {
      const requiresPassword = v.firstName !== undefined || v.lastName !== undefined || v.email !== undefined;
      if (!requiresPassword) return true;
      return typeof v.currentPassword === "string" && v.currentPassword.trim().length > 0;
    }, { message: "currentPassword is required for name/email changes" }),

  "profile.password.update": z
    .object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(8).max(200),
    })
    .passthrough(),

  "integrations.twilio.get": z
    .object({
      includeDiagnostics: z.boolean().optional().nullable(),
    })
    .strict(),

  "integrations.twilio.update": z
    .object({
      clear: z.boolean().optional().nullable(),
      accountSid: z.string().trim().min(1).max(80).optional().nullable(),
      authToken: z.string().trim().min(1).max(120).optional().nullable(),
      messagingServiceSid: z.string().trim().min(1).max(80).optional().nullable(),
      phoneNumberE164: z.string().trim().min(1).max(40).optional().nullable(),
    })
    .strict()
    .refine(
      (v) =>
        v.clear === true ||
        (typeof v.accountSid === "string" && v.accountSid.trim()) ||
        (typeof v.authToken === "string" && v.authToken.trim()),
      { message: "Provide clear=true or Twilio credentials" },
    ),

  "integrations.stripe.get": z.object({}).strict(),

  "integrations.stripe.delete": z.object({}).strict(),

  "integrations.stripe.update": z
    .object({
      secretKey: z.string().trim().min(8).max(200),
    })
    .strict(),

  "integrations.sales_reporting.get": z.object({}).strict(),

  "integrations.sales_reporting.disconnect": z
    .object({
      provider: z.enum([
        "stripe",
        "authorizenet",
        "braintree",
        "razorpay",
        "paystack",
        "flutterwave",
        "mollie",
        "mercadopago",
      ]),
    })
    .strict(),

  "integrations.sales_reporting.update": z
    .object({
      provider: z.enum([
        "stripe",
        "authorizenet",
        "braintree",
        "razorpay",
        "paystack",
        "flutterwave",
        "mollie",
        "mercadopago",
      ]),
      credentials: z.record(z.string().trim().min(1).max(80), z.string().trim().max(2000)).optional().nullable(),
      setActive: z.boolean().optional().nullable(),
    })
    .strict(),

  "integrations.api_keys.list": z.object({}).strict(),

  "integrations.api_keys.create": z
    .object({
      name: z.string().trim().min(2).max(80),
      permissions: z.array(z.enum(PORTAL_API_KEY_PERMISSION_VALUES as [string, ...string[]])).min(1),
      creditLimit: z.number().int().min(0).nullable().optional(),
    })
    .strict(),

  "integrations.api_keys.update": z
    .object({
      keyId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(2).max(80).optional(),
      permissions: z.array(z.enum(PORTAL_API_KEY_PERMISSION_VALUES as [string, ...string[]])).min(1).optional(),
      creditLimit: z.number().int().min(0).nullable().optional(),
    })
    .strict()
    .refine((value) => value.name !== undefined || value.permissions !== undefined || value.creditLimit !== undefined, {
      message: "No changes",
    }),

  "integrations.api_keys.delete": z
    .object({
      keyId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "integrations.api_keys.reveal": z
    .object({
      keyId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "follow_up.settings.get": z.object({}).strict(),

  "follow_up.settings.update": z
    .object({
      settings: z.unknown(),
    })
    .strict(),

  "follow_up.custom_variables.get": z.object({}).strict(),

  "follow_up.custom_variables.update": z
    .object({
      key: z.string().trim().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
      value: z.string().max(800).default(""),
    })
    .strict(),

  "follow_up.ai.generate_step": z
    .object({
      kind: z.enum(["SMS", "EMAIL"]),
      stepName: z.string().trim().max(80).optional(),
      prompt: z.string().trim().max(2000).optional(),
      existingSubject: z.string().trim().max(200).optional(),
      existingBody: z.string().trim().max(8000).optional(),
    })
    .strict(),

  "follow_up.test_send": z
    .object({
      channel: z.enum(["EMAIL", "SMS"]),
      to: z.string().trim().min(3).max(200),
      subject: z.string().trim().max(120).optional(),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),

  "follow_up.cron.run": z
    .object({
      limit: z.number().int().min(1).max(500).optional(),
    })
    .strict(),

  "lead_scraping.settings.get": z.object({}).passthrough(),

  "lead_scraping.settings.update": z
    .object({
      settings: z.unknown(),
    })
    .passthrough(),

  "lead_scraping.run": z
    .object({
      kind: z.enum(["B2B", "B2C"]).optional(),
      count: z.number().int().min(1).max(500).optional(),
      niche: z.string().trim().max(200).optional(),
      location: z.string().trim().max(200).optional(),
      requireEmail: z.boolean().optional(),
      requirePhone: z.boolean().optional(),
      requireWebsite: z.boolean().optional(),
      aiOutbound: z
        .object({
          calls: z
            .object({
              enabled: z.boolean().optional(),
              campaignId: z.string().trim().max(120).optional(),
            })
            .strict()
            .optional(),
          messages: z
            .object({
              enabled: z.boolean().optional(),
              campaignId: z.string().trim().max(120).optional(),
              channelPolicy: z.enum(["SMS", "EMAIL", "BOTH"]).optional(),
            })
            .strict()
            .optional(),
        })
        .strict()
        .optional(),
    })
    .passthrough(),

  "lead_scraping.leads.list": z
    .object({
      take: z.number().int().min(1).max(500).optional(),
      q: z.string().trim().max(200).optional(),
      kind: z.enum(["B2B", "B2C"]).optional(),
    })
    .passthrough(),

  "lead_scraping.leads.update": z
    .object({
      leadId: z.string().trim().min(1).max(64),
      starred: z.boolean().optional(),
      email: z
        .string()
        .trim()
        .max(200)
        .optional()
        .transform((v) => (v === "" ? null : v)),
      tag: z
        .string()
        .trim()
        .max(60)
        .optional()
        .transform((v) => (v === "" ? null : v)),
      tagColor: z
        .string()
        .trim()
        .max(16)
        .optional()
        .transform((v) => (v === "" ? null : v)),
    })
    .passthrough()
    .refine((v) => v.starred !== undefined || v.email !== undefined || v.tag !== undefined || v.tagColor !== undefined, {
      message: "No changes provided",
    })
    .refine(
      (v) => {
        if (v.email === undefined || v.email === null) return true;
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email);
      },
      { message: "Invalid email" },
    )
    .refine(
      (v) => {
        if (v.tagColor === undefined || v.tagColor === null) return true;
        return /^#[0-9a-fA-F]{6}$/.test(v.tagColor);
      },
      { message: "Invalid tag color" },
    ),

  "lead_scraping.leads.delete": z
    .object({
      leadId: z.string().trim().min(1).max(64),
    })
    .passthrough(),

  "lead_scraping.outbound.ai.draft_template": z
    .object({
      kind: z.enum(["SMS", "EMAIL"]),
      prompt: z.string().trim().max(2000).optional(),
      existingSubject: z.string().trim().max(200).optional(),
      existingBody: z.string().trim().max(8000).optional(),
    })
    .passthrough(),

  "lead_scraping.contact.send": z
    .object({
      leadId: z.string().trim().min(1).max(64),
      subject: z.string().trim().max(120).optional(),
      message: z.string().trim().min(1).max(2000),
      sendEmail: z.boolean().optional(),
      sendSms: z.boolean().optional(),
    })
    .passthrough()
    .refine((v) => Boolean(v.sendEmail) || Boolean(v.sendSms), { message: "Choose Email and/or Text" }),

  "lead_scraping.outbound.approve": z
    .object({
      leadId: z.string().trim().min(1).max(64),
      approved: z.boolean(),
    })
    .passthrough(),

  "lead_scraping.outbound.send": z
    .object({
      leadId: z.string().trim().min(1).max(64),
    })
    .passthrough(),

  "lead_scraping.cron.run": z.object({}).passthrough(),

  "webhooks.get": z.object({}).passthrough(),

  "bug_report.submit": z
    .object({
      message: z.string().trim().min(1).max(4000),
      url: z.string().trim().max(2000).optional(),
      area: z.string().trim().max(200).optional(),
      meta: z.unknown().optional(),
    })
    .strict(),

  "support_chat.send": z
    .object({
      message: z.string().trim().min(1).max(4000),
      url: z.string().trim().max(800).optional().nullable(),
      meta: z
        .object({
          buildSha: z.string().nullable().optional(),
          commitRef: z.string().nullable().optional(),
          deploymentId: z.string().nullable().optional(),
          nodeEnv: z.string().nullable().optional(),
          clientTime: z.string().optional(),
        })
        .optional()
        .nullable(),
      context: z
        .object({
          recentMessages: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                text: z.string().trim().min(1).max(2000),
              }),
            )
            .max(20)
            .optional()
            .nullable(),
        })
        .optional()
        .nullable(),
    })
    .strict(),

  "services.catalog.get": z.object({}).passthrough(),

  "services.status.get": z.object({}).passthrough(),

  "services.lifecycle.update": z
    .object({
      serviceSlug: z.string().trim().min(1).max(80),
      action: z.enum(["pause", "cancel", "resume"]),
    })
    .passthrough(),

  "mailbox.get": z.object({}).passthrough(),

  "mailbox.update": z
    .object({
      localPart: z.string().trim().min(2).max(48),
    })
    .passthrough(),

  "missed_call_textback.settings.get": z.object({}).strict(),

  "missed_call_textback.settings.update": z
    .object({
      settings: z.unknown().optional(),
      regenerateToken: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.regenerateToken === true || v.settings !== undefined, { message: "Missing settings" }),

  "people.users.list": z.object({}).passthrough(),

  "people.users.invite": z
    .object({
      email: z.string().trim().email().max(200),
      role: z.enum(["ADMIN", "MEMBER"]).optional().nullable(),
      permissions: z.unknown().optional(),
    })
    .passthrough(),

  "people.users.update": z
    .object({
      userId: z.string().trim().min(1).max(120),
      role: z.enum(["ADMIN", "MEMBER"]).optional().nullable(),
      permissions: z.unknown().optional(),
    })
    .passthrough(),

  "people.users.delete": z
    .object({
      userId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "people.leads.update": z
    .object({
      leadId: z.string().trim().min(1).max(64),
      businessName: z.string().trim().min(1).max(200).optional(),
      email: z.string().trim().max(200).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      website: z.string().trim().max(500).optional().nullable(),
      contactId: z.string().trim().max(120).optional().nullable(),
    })
    .strict(),

  "people.contacts.import": z
    .object({
      csvText: z.string().trim().min(1).max(5_000_000),
      allowDuplicates: z.boolean().optional().nullable(),
      tags: z.array(z.string().trim().min(1).max(60)).max(10).optional().nullable(),
      // Optional mapping of standard keys (e.g. email/phone/firstName/lastName) -> CSV header names.
      mapping: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(120)).optional().nullable(),
    })
    .strict(),

  "people.contacts.custom_variable_keys.get": z.object({}).strict(),

  "people.contacts.duplicates.get": z
    .object({
      limitGroups: z.number().int().min(1).max(200).optional().nullable(),
      summaryOnly: z.boolean().optional().nullable(),
    })
    .strict(),

  "people.contacts.merge": z
    .object({
      primaryContactId: z.string().trim().min(1).max(80),
      mergeContactIds: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
      primaryEmail: z.string().trim().max(200).optional().nullable(),
    })
    .strict(),

  "people.contacts.custom_variables.patch": z
    .object({
      contactId: z.string().trim().min(1).max(120),
      key: z.string().trim().min(1).max(120),
      value: z.string().optional().nullable(),
    })
    .strict(),

  "inbox.threads.list": z
    .object({
      channel: z
        .union([z.enum(["EMAIL", "SMS", "ALL"]), z.string().trim().min(1).max(20)])
        .optional()
        .nullable(),
      q: z.string().trim().min(1).max(200).optional().nullable(),
      take: z.number().int().min(1).max(200).optional().nullable(),
      direction: z.string().trim().min(1).max(20).optional().nullable(),
      box: z.string().trim().min(1).max(40).optional().nullable(),
      mailbox: z.string().trim().min(1).max(40).optional().nullable(),
      needsReply: z.boolean().optional().nullable(),
      unansweredOnly: z.boolean().optional().nullable(),
      onlyUnanswered: z.boolean().optional().nullable(),
      allChannels: z.boolean().optional().nullable(),
    })
    .passthrough(),

  "inbox.thread.messages.list": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      take: z.number().int().min(10).max(500).optional().nullable(),
    })
    .passthrough(),

  "inbox.thread.contact.set": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(80),
      email: z
        .string()
        .trim()
        .max(120)
        .optional()
        .nullable()
        .refine((v) => v === null || v === undefined || v === "" || /.+@.+\..+/.test(v), { message: "Invalid email" }),
      phone: z.string().trim().max(40).optional().nullable(),
    })
    .passthrough(),

  "inbox.scheduled.update": z
    .object({
      scheduledId: z.string().trim().min(1).max(120),
      scheduledFor: z.string().datetime(),
    })
    .passthrough(),

  "inbox.scheduled.cron.run": z
    .object({
      limit: z.number().int().min(1).max(500).optional(),
    })
    .passthrough(),

  "inbox.attachments.upload": z
    .object({
      files: z
        .array(
          z
            .object({
              fileName: z.string().trim().min(1).max(200),
              mimeType: z.string().trim().min(1).max(120).optional(),
              contentBase64: z.string().trim().min(1).max(30_000_000),
            })
            .strict(),
        )
        .min(1)
        .max(10),
    })
    .strict(),

  "inbox.attachments.create_from_media": z
    .object({
      mediaItemId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "inbox.attachments.delete": z
    .object({
      id: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "inbox.settings.get": z.object({}).passthrough(),

  "inbox.settings.update": z
    .object({
      regenerateToken: z.boolean().optional(),
    })
    .passthrough(),

  "inbox.send": z
    .object({
      channel: z.enum(["email", "sms"]),
      to: z.string().trim().min(1).max(200),
      subject: z.string().trim().max(140).optional().nullable(),
      body: z.string().trim().max(20000).optional().nullable(),
      attachmentIds: z.array(z.string().trim().min(1).max(120)).max(10).optional().nullable(),
      threadId: z.string().trim().min(1).max(120).optional().nullable(),
      sendAt: z.string().datetime().optional().nullable(),
    })
    .passthrough(),

  "inbox.send_sms": z
    .object({
      // Either provide a phone number in `to`, or a `contactId`.
      to: z.string().trim().min(3).max(64).optional(),
      contactId: z.string().trim().min(1).max(120).optional(),
      body: z.string().trim().min(1).max(900).optional(),
      // If provided, the system will generate a fresh SMS body at send-time.
      bodyPrompt: z.string().trim().min(3).max(1200).optional(),
      threadId: z.string().trim().min(1).max(120).optional(),
    })
    .passthrough()
    .refine((v) => Boolean((v as any).to || (v as any).contactId || (v as any).threadId), { message: "Missing to/contactId/threadId" })
    .refine((v) => Boolean((v as any).body || (v as any).bodyPrompt), { message: "Missing body/bodyPrompt" }),

  "inbox.send_email": z
    .object({
      to: z.string().trim().min(3).max(200),
      subject: z.string().trim().min(1).max(140),
      body: z.string().trim().min(1).max(20000),
      threadId: z.string().trim().min(1).max(120).optional(),
    })
    .passthrough(),

  "reviews.send_request_for_booking": z
    .object({
      bookingId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "reviews.send_request_for_contact": z
    .object({
      contactId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "reviews.reply": z
    .object({
      reviewId: z.string().trim().min(1).max(120),
      reply: z.string().max(2000).optional().nullable(),
    })
    .strict(),

  "reviews.settings.get": z.object({}).strict(),

  "reviews.settings.update": z
    .object({
      settings: z.unknown(),
    })
    .strict(),

  "reviews.site.get": z.object({}).strict(),

  "reviews.site.update": z
    .object({
      primaryDomain: z.string().trim().max(253).optional().nullable(),
    })
    .strict(),

  "reviews.inbox.list": z
    .object({
      includeArchived: z.boolean().optional().nullable(),
      hasBusinessReply: z.boolean().optional().nullable(),
    })
    .passthrough(),

  "reviews.archive": z
    .object({
      reviewId: z.string().trim().min(1).max(120),
      archived: z.boolean(),
    })
    .passthrough(),

  "reviews.bookings.list": z.object({}).strict(),

  "reviews.contacts.search": z
    .object({
      q: z.string().trim().max(200).optional().nullable(),
      take: z.number().int().min(1).max(50).optional().nullable(),
    })
    .passthrough(),

  "reviews.events.list": z
    .object({
      limit: z.number().int().min(1).max(200).optional().nullable(),
    })
    .passthrough(),

  "reviews.handle.get": z.object({}).strict(),

  "reviews.questions.list": z.object({}).strict(),

  "reviews.questions.answer": z
    .object({
      id: z.string().trim().min(1).max(120),
      answer: z.string().max(2000).optional().nullable(),
    })
    .passthrough(),

  "reviews.cron.run": z
    .object({
      ownersLimit: z.number().int().min(1).max(10000).optional(),
      perOwnerLimit: z.number().int().min(1).max(500).optional(),
      windowMinutes: z.number().int().min(1).max(60 * 24).optional(),
    })
    .strict(),

  "media.folders.list": z.object({}).passthrough(),

  "media.folders.update": z
    .object({
      id: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(120).optional(),
      parentId: z.string().trim().min(1).optional().nullable(),
      color: z.string().trim().min(1).max(32).optional().nullable(),
    })
    .passthrough(),

  "media.folder.ensure": z
    .object({
      name: z.string().trim().min(1).max(120),
      parentId: z.string().trim().min(1).optional().nullable(),
      color: z.string().trim().min(1).max(32).optional().nullable(),
    })
    .passthrough(),

  "media.items.list": z
    .object({
      q: z.string().trim().max(240).optional().nullable(),
      folderId: z.string().trim().min(1).max(80).optional().nullable(),
      limit: z.number().int().min(1).max(500).optional().nullable(),
    })
    .passthrough(),

  "media.items.move": z
    .object({
      itemIds: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
      folderId: z.string().trim().min(1).optional().nullable(),
      folderName: z.string().trim().min(1).max(120).optional().nullable(),
      parentId: z.string().trim().min(1).optional().nullable(),
    })
    .passthrough(),

  "media.items.update": z
    .object({
      id: z.string().trim().min(1).max(120),
      fileName: z.string().trim().min(1).max(200).optional(),
      folderId: z.string().trim().min(1).optional().nullable(),
    })
    .passthrough()
    .refine((v) => v.fileName !== undefined || v.folderId !== undefined, { message: "No changes" }),

  "media.items.delete": z
    .object({
      id: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "media.items.create_from_blob": z
    .object({
      url: z.string().trim().url().max(500),
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().min(1).max(120),
      fileSize: z.number().int().nonnegative(),
      folderId: z.string().trim().min(1).optional().nullable(),
    })
    .passthrough(),

  "media.import_remote_image": z
    .object({
      url: z.string().trim().url().max(500),
      fileName: z.string().trim().max(240).optional().nullable(),
      folderId: z.string().trim().min(1).optional().nullable(),
      folderName: z.string().trim().min(1).max(120).optional().nullable(),
      parentId: z.string().trim().min(1).optional().nullable(),
    })
    .passthrough(),

  "media.list.get": z
    .object({
      folderId: z.string().trim().min(1).max(80).optional().nullable(),
    })
    .passthrough(),

  "media.stats.get": z.object({}).passthrough(),

  "media.blob_upload.create": z
    .object({
      body: z
        .record(z.string(), z.unknown())
        .refine((b) => typeof (b as any)?.type === "string" && String((b as any).type).trim().length > 0, {
          message: "body.type is required",
        }),
    })
    .passthrough(),

  "seed_demo.run": z
    .object({
      forceInboxSeed: z.boolean().optional(),
    })
    .strict(),

  "ui.canvas.click": z
    .object({
      query: z.string().trim().min(1).max(200),
      role: z.enum(["any", "button", "link", "tab", "checkbox", "radio", "select", "textbox", "menuitem"]).optional(),
      nth: z.number().int().min(0).max(50).optional(),
    })
    .strict(),

  "ui.canvas.type": z
    .object({
      query: z.string().trim().min(1).max(200),
      value: z.string().max(10_000),
      clear: z.boolean().optional(),
      role: z.enum(["any", "button", "link", "tab", "checkbox", "radio", "select", "textbox", "menuitem"]).optional(),
      nth: z.number().int().min(0).max(50).optional(),
    })
    .strict(),

  "ui.canvas.select": z
    .object({
      query: z.string().trim().min(1).max(200),
      option: z.string().trim().min(1).max(200),
      role: z.enum(["any", "button", "link", "tab", "checkbox", "radio", "select", "textbox", "menuitem"]).optional(),
      nth: z.number().int().min(0).max(50).optional(),
    })
    .strict(),

  "ui.canvas.set_checked": z
    .object({
      query: z.string().trim().min(1).max(200),
      checked: z.boolean(),
      role: z.enum(["any", "button", "link", "tab", "checkbox", "radio", "select", "textbox", "menuitem"]).optional(),
      nth: z.number().int().min(0).max(50).optional(),
    })
    .strict(),

  "ui.canvas.scroll": z
    .object({
      to: z.enum(["top", "bottom"]),
    })
    .strict(),

  "ui.canvas.wait": z
    .object({
      ms: z.number().int().min(0).max(5000),
    })
    .strict(),

  "dashboard.get": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
    })
    .passthrough(),

  "dashboard.save": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      data: z.unknown().optional(),
    })
    .passthrough(),

  "dashboard.reset": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
    })
    .passthrough(),

  "dashboard.add_widget": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      widgetId: z.string().trim().min(1).max(80),
    })
    .passthrough(),

  "dashboard.remove_widget": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      widgetId: z.string().trim().min(1).max(80),
    })
    .passthrough(),

  "dashboard.optimize": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      niche: z.string().trim().min(1).max(120).optional().nullable(),
    })
    .passthrough(),

  "dashboard.analysis.get": z.object({}).strict(),

  "dashboard.analysis.generate": z
    .object({
      trigger: z.string().trim().max(120).optional(),
      force: z.boolean().optional(),
    })
    .passthrough(),

  "dashboard.quick_access.get": z.object({}).strict(),

  "dashboard.quick_access.update": z
    .object({
      slugs: z.array(z.string().trim().min(1).max(80)).max(12),
    })
    .passthrough(),

  "booking.calendar.create": z.preprocess(
    (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
      const rec = raw as Record<string, unknown>;
      const pickText = (...keys: string[]): string | undefined => {
        for (const key of keys) {
          const value = rec[key];
          if (typeof value !== "string") continue;
          const trimmed = value.trim();
          if (trimmed) return trimmed;
        }
        return undefined;
      };

      const title = pickText("title", "name", "calendarName", "label") || "Appointment Booking Calendar";
      return {
        title,
        ...(typeof rec.id === "string" ? { id: rec.id } : {}),
        ...(typeof rec.reuseExistingIfAny === "boolean" ? { reuseExistingIfAny: rec.reuseExistingIfAny } : {}),
        ...(typeof rec.description === "string" ? { description: rec.description } : {}),
        ...(typeof rec.durationMinutes === "number" ? { durationMinutes: rec.durationMinutes } : {}),
        ...(typeof rec.meetingLocation === "string"
          ? { meetingLocation: rec.meetingLocation }
          : typeof rec.location === "string"
            ? { meetingLocation: rec.location }
            : {}),
        ...(typeof rec.meetingDetails === "string"
          ? { meetingDetails: rec.meetingDetails }
          : typeof rec.instructions === "string"
            ? { meetingDetails: rec.instructions }
            : {}),
        ...(Array.isArray(rec.notificationEmails)
          ? { notificationEmails: rec.notificationEmails }
          : Array.isArray(rec.emails)
            ? { notificationEmails: rec.emails }
            : {}),
      };
    },
    z
      .object({
        title: z.string().trim().min(1).max(80),
        id: z.string().trim().min(2).max(60).optional(),
        reuseExistingIfAny: z.boolean().optional(),
        description: z.string().trim().max(400).optional(),
        durationMinutes: z.number().int().min(10).max(180).optional(),
        meetingLocation: z.string().trim().max(120).optional(),
        meetingDetails: z.string().trim().max(600).optional(),
        notificationEmails: z.array(z.string().trim().min(3).max(200)).max(20).optional(),
      })
      .strict(),
  ),

  "booking.calendars.get": z
    .object({})
    .strict(),

  "booking.availability.set_daily": z
    .object({
      startDateLocal: z.string().trim().min(8).max(10),
      endDateLocal: z.string().trim().min(8).max(10),
      startTimeLocal: z.string().trim().min(4).max(5),
      endTimeLocal: z.string().trim().min(4).max(5),
      timeZone: z.string().trim().min(1).max(80).optional(),
      isoWeekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
      replaceExisting: z.boolean().optional(),
    })
    .strict(),

  "booking.calendars.update": z
    .union([
      z
        .object({
          calendars: z
            .array(
              z
                .object({
                  id: z.string().trim().min(1).max(50),
                  enabled: z.boolean().optional(),
                  title: z.string().trim().min(1).max(80),
                  description: z.string().trim().max(400).optional(),
                  durationMinutes: z.number().int().min(10).max(180).optional(),
                  meetingLocation: z.string().trim().max(120).optional(),
                  meetingDetails: z.string().trim().max(600).optional(),
                  notificationEmails: z.array(z.string().trim().email()).max(20).optional(),
                })
                .passthrough(),
            )
            .max(25),
        })
        .strict(),
      z
        .object({
          calendarId: z.string().trim().min(1).max(50).optional(),
          id: z.string().trim().min(1).max(50).optional(),
          enabled: z.boolean().optional(),
          title: z.string().trim().min(1).max(80).optional(),
          description: z.string().trim().max(400).optional(),
          durationMinutes: z.number().int().min(10).max(180).optional(),
          meetingLocation: z.string().trim().max(120).optional(),
          meetingDetails: z.string().trim().max(600).optional(),
          notificationEmails: z.array(z.string().trim().email()).max(20).optional(),
        })
        .strict()
        .refine(
          (d) => Boolean(String(d.calendarId || d.id || "").trim()),
          { message: "calendarId required" },
        ),
    ]),

  "booking.bookings.list": z
    .object({
      take: z.number().int().min(1).max(50).optional(),
    })
    .strict(),

  "booking.cancel": z
    .object({
      bookingId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "booking.reschedule": z
    .object({
      bookingId: z.string().trim().min(1).max(120),
      startAtIso: z.string().trim().min(1).max(60),
      forceAvailability: z.boolean().optional(),
    })
    .strict(),

  "booking.contact": z
    .object({
      bookingId: z.string().trim().min(1).max(120),
      subject: z.string().trim().max(120).optional().nullable(),
      message: z.string().trim().min(1).max(2000),
      sendEmail: z.boolean().optional(),
      sendSms: z.boolean().optional(),
    })
    .strict(),

  "booking.settings.get": z
    .object({
      slug: z.string().min(3).max(80).optional(),
    })
    .strict(),

  "booking.settings.update": z
    .preprocess((raw) => {
      if (!isPlainObject(raw)) return raw;
      const r = raw as Record<string, any>;
      const out: Record<string, unknown> = {};
      const enabled = r.enabled ?? r.active;
      if (enabled !== undefined) out.enabled = enabled;
      const title = r.title ?? r.name ?? r.bookingTitle;
      if (title !== undefined) out.title = title;
      const description = r.description ?? r.summary ?? r.details;
      if (description !== undefined) out.description = description;
      const durationMinutes = r.durationMinutes ?? r.duration ?? r.minutes ?? r.meetingDuration;
      if (durationMinutes !== undefined) out.durationMinutes = durationMinutes;
      const timeZone = r.timeZone ?? r.timezone ?? r.tz;
      if (timeZone !== undefined) out.timeZone = timeZone;
      const slug = r.slug ?? r.siteSlug ?? r.bookingSlug;
      if (slug !== undefined) out.slug = slug;
      const photoUrl = r.photoUrl ?? r.imageUrl ?? r.avatarUrl;
      if (photoUrl !== undefined) out.photoUrl = photoUrl;
      const meetingLocation = r.meetingLocation ?? r.location;
      if (meetingLocation !== undefined) out.meetingLocation = meetingLocation;
      const meetingDetails = r.meetingDetails ?? r.meetingInstructions ?? r.instructions;
      if (meetingDetails !== undefined) out.meetingDetails = meetingDetails;
      const appointmentPurpose = r.appointmentPurpose ?? r.purpose;
      if (appointmentPurpose !== undefined) out.appointmentPurpose = appointmentPurpose;
      const toneDirection = r.toneDirection ?? r.tone ?? r.voice;
      if (toneDirection !== undefined) out.toneDirection = toneDirection;
      const notificationEmails = r.notificationEmails ?? r.emails ?? r.alertEmails;
      if (notificationEmails !== undefined) out.notificationEmails = notificationEmails;
      const meetingPlatform = r.meetingPlatform ?? r.platform;
      if (meetingPlatform !== undefined) out.meetingPlatform = meetingPlatform;
      return out;
    },
    z
      .object({
        enabled: z.boolean().optional(),
        title: z.string().min(1).max(80).optional(),
        description: z.string().max(400).optional().nullable(),
        durationMinutes: z.number().int().min(10).max(180).optional(),
        timeZone: z.string().min(1).max(80).optional(),
        slug: z.string().min(3).max(80).optional(),

        photoUrl: z.string().trim().max(500).optional().nullable(),
        meetingLocation: z.string().trim().max(120).optional().nullable(),
        meetingDetails: z.string().trim().max(600).optional().nullable(),
        appointmentPurpose: z.string().trim().max(600).optional().nullable(),
        toneDirection: z.string().trim().max(600).optional().nullable(),
        notificationEmails: z.array(z.string().trim().email()).max(20).optional().nullable(),
        meetingPlatform: z.enum(["PURELY_CONNECT", "ZOOM", "GOOGLE_MEET", "OTHER"]).optional(),
      })
      .strict()),

  "booking.form.get": z
    .object({})
    .strict(),

  "booking.form.update": z
    .preprocess((raw) => {
      if (!isPlainObject(raw)) return raw;
      const r = raw as Record<string, any>;

      // Build a strict, schema-shaped object and drop common alias keys.
      const out: Record<string, unknown> = {};
      if (r.version !== undefined) out.version = r.version;

      const thankYouMessage =
        r.thankYouMessage ??
        r.thankyouMessage ??
        r.thankYouText ??
        r.thankYouNote ??
        r.thankYouPageMessage ??
        r.thankYouPageText;
      if (thankYouMessage !== undefined) out.thankYouMessage = thankYouMessage;

      const phone = r.phone ?? r.phoneField ?? r.includePhone;
      if (phone !== undefined) out.phone = phone;

      const notes = r.notes ?? r.notesField ?? r.includeNotes;
      if (notes !== undefined) out.notes = notes;

      // Common mistake: models try to put meeting details into the booking form update.
      // Accept these fields and let the executor route them to booking settings.
      const meetingLocation = r.meetingLocation ?? r.location ?? r.meeting_location;
      if (meetingLocation !== undefined) out.meetingLocation = meetingLocation;

      const meetingDetails = r.meetingDetails ?? r.meetingDetail ?? r.meetingInstructions ?? r.instructions ?? r.meeting_details;
      if (meetingDetails !== undefined) out.meetingDetails = meetingDetails;

      const questionsRaw = r.questions ?? r.customQuestions ?? r.formQuestions;
      if (Array.isArray(questionsRaw)) {
        out.questions = questionsRaw.map((q: unknown) => {
          if (!isPlainObject(q)) return q as any;
          const qq = q as Record<string, any>;

          const label =
            (typeof qq.label === "string" ? qq.label : null) ??
            (typeof qq.text === "string" ? qq.text : null) ??
            (typeof qq.question === "string" ? qq.question : null);

          const kind = (typeof qq.kind === "string" ? (qq.kind as string) : null) ?? (typeof qq.type === "string" ? (qq.type as string) : null);
          const normalizedKind = normalizeBookingQuestionKind(kind);

          const optionsRaw = qq.options ?? qq.choices ?? qq.items;
          let options: unknown = optionsRaw;
          if (typeof optionsRaw === "string") {
            options = optionsRaw
              .split(/\s*,\s*/)
              .map((s: string) => s.trim())
              .filter(Boolean);
          }

          const outQ: Record<string, unknown> = {};
          if (qq.id !== undefined) outQ.id = qq.id;
          if (label != null) outQ.label = label;
          if (qq.required !== undefined) outQ.required = qq.required;
          if (normalizedKind != null) outQ.kind = normalizedKind;
          if (Array.isArray(options)) outQ.options = options;
          return outQ;
        });
      }

      return out;
    },
    z
      .object({
        // The portal UI config includes a version field; tolerate it so the agent can
        // round-trip configs without getting rejected by strict validation.
        version: z.number().int().optional().nullable(),
        thankYouMessage: z.string().max(500).optional().nullable(),
        phone: z
          .union([
            z
              .object({
                enabled: z.boolean().optional().nullable(),
                required: z.boolean().optional().nullable(),
              })
              .strip(),
            z.boolean(),
            z.string().trim().max(40),
          ])
          .optional()
          .nullable(),
        notes: z
          .union([
            z
              .object({
                enabled: z.boolean().optional().nullable(),
                required: z.boolean().optional().nullable(),
              })
              .strip(),
            z.boolean(),
            z.string().trim().max(40),
          ])
          .optional()
          .nullable(),

        // These belong to booking settings, but are accepted here to prevent 400s
        // when the model routes the intent to booking.form.update.
        meetingLocation: z.string().trim().max(120).optional().nullable(),
        meetingDetails: z.string().trim().max(600).optional().nullable(),

        questions: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(50).optional().nullable(),
                label: z.string().trim().min(1).max(120),
                required: z.boolean().optional().nullable(),
                kind: z.enum(["short", "long", "single_choice", "multiple_choice"]).optional().nullable(),
                options: z.array(z.string().trim().min(1).max(60)).max(12).optional().nullable(),
              })
              .strip(),
          )
          .max(20)
          .optional()
          .nullable(),
      })
      .strict()),

  "booking.site.get": z
    .object({})
    .strict(),

  "booking.site.update": z
    .object({
      primaryDomain: z.string().trim().max(253).optional().nullable(),
    })
    .strict(),

  "booking.suggestions.slots": z
    .object({
      startAtIso: z.string().trim().max(60).optional().nullable(),
      days: z.number().int().min(1).max(30).optional(),
      durationMinutes: z.number().int().min(10).max(180).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),

  "booking.reminders.settings.get": z
    .object({
      calendarId: z.string().trim().min(1).max(50).optional().nullable(),
    })
    .strict(),

  "booking.reminders.settings.update": z
    .object({
      calendarId: z.string().trim().min(1).max(50).optional().nullable(),
      settings: z.unknown(),
    })
    .strict(),

  "booking.reminders.ai.generate_step": z
    .object({
      kind: z.enum(["SMS", "EMAIL"]),
      prompt: z.string().trim().max(2000).optional(),
      existingSubject: z.string().trim().max(200).optional(),
      existingBody: z.string().trim().max(8000).optional(),
    })
    .strict(),

  "booking.reminders.cron.run": z.object({}).strict(),

  "nurture.campaigns.list": z
    .object({
      take: z.number().int().min(1).max(200).optional(),
    })
    .strict(),

  "nurture.campaigns.create": z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),

  "nurture.campaigns.get": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "nurture.campaigns.update": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(80).optional(),
      status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
      audienceTagIds: z.array(z.string().min(1)).max(100).optional(),
      smsFooter: z.string().max(300).optional(),
      emailFooter: z.string().max(2000).optional(),
    })
    .strict(),

  "nurture.campaigns.delete": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "nurture.campaigns.steps.add": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      kind: z.enum(["SMS", "EMAIL", "TAG"]).optional(),
      delayMinutes: z.number().int().min(0).max(60 * 24 * 365).optional().nullable(),
      subject: z.string().max(200).optional().nullable(),
      body: z.string().max(8000).optional().nullable(),
      step: z
        .object({
          kind: z.enum(["SMS", "EMAIL", "TAG"]).optional().nullable(),
          delayMinutes: z.number().int().min(0).max(60 * 24 * 365).optional().nullable(),
          subject: z.string().max(200).optional().nullable(),
          body: z.string().max(8000).optional().nullable(),
        })
        .partial()
        .optional()
        .nullable(),
    })
    .passthrough(),

  "nurture.steps.update": z
    .object({
      stepId: z.string().trim().min(1).max(120),
      ord: z.number().int().min(0).max(200).optional(),
      kind: z.enum(["SMS", "EMAIL", "TAG"]).optional(),
      delayMinutes: z.number().int().min(0).max(60 * 24 * 365).optional(),
      subject: z.string().max(200).optional().nullable(),
      body: z.string().min(1).max(8000).optional(),
    })
    .strict(),

  "nurture.steps.delete": z
    .object({
      stepId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "nurture.campaigns.enroll": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      tagIds: z.array(z.string().min(1)).max(100).optional(),
      dryRun: z.boolean().optional(),
    })
    .strict(),

  "nurture.billing.confirm_checkout": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      sessionId: z.string().trim().min(1).max(200),
    })
    .strict(),

  "nurture.ai.generate_step": z
    .object({
      kind: z.enum(["SMS", "EMAIL"]),
      campaignName: z.string().trim().max(80).optional(),
      prompt: z.string().trim().max(2000).optional(),
      existingSubject: z.string().trim().max(200).optional(),
      existingBody: z.string().trim().max(8000).optional(),
    })
    .strict(),

  "nurture.cron.run": z.object({}).strict(),

  "ai_outbound_calls.campaigns.list": z
    .object({
      lite: z.boolean().optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.create": z
    .object({
      name: z.string().trim().min(1).max(80).optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.update": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(80).optional(),
      status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
      audienceTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
      chatAudienceTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
      messageChannelPolicy: z.enum(["SMS", "EMAIL", "BOTH"]).optional(),
      voiceAgentId: z.string().trim().max(120).optional(),
      manualVoiceAgentId: z.string().trim().max(120).optional(),
      voiceAgentConfig: z
        .object({
          firstMessage: z.string().trim().max(360).optional(),
          goal: z.string().trim().max(6000).optional(),
          personality: z.string().trim().max(6000).optional(),
          environment: z.string().trim().max(6000).optional(),
          tone: z.string().trim().max(6000).optional(),
          guardRails: z.string().trim().max(6000).optional(),
          toolKeys: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
          toolIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
        })
        .strict()
        .optional(),
      voiceId: z.string().trim().max(200).optional(),
      knowledgeBase: z
        .object({
          seedUrl: z.string().trim().max(500).optional(),
          crawlDepth: z.number().int().min(0).max(3).optional(),
          maxUrls: z.number().int().min(0).max(100).optional(),
          text: z.string().trim().max(20000).optional(),
          locators: z
            .array(
              z
                .object({
                  id: z.string().trim().min(1).max(200),
                  name: z.string().trim().min(1).max(200),
                  type: z.enum(["file", "url", "text", "folder"]),
                  usage_mode: z.enum(["auto", "prompt"]).optional(),
                })
                .strict(),
            )
            .max(200)
            .optional(),
        })
        .strict()
        .optional(),
      messagesKnowledgeBase: z
        .object({
          seedUrl: z.string().trim().max(500).optional(),
          crawlDepth: z.number().int().min(0).max(3).optional(),
          maxUrls: z.number().int().min(0).max(100).optional(),
          text: z.string().trim().max(20000).optional(),
          locators: z
            .array(
              z
                .object({
                  id: z.string().trim().min(1).max(200),
                  name: z.string().trim().min(1).max(200),
                  type: z.enum(["file", "url", "text", "folder"]),
                  usage_mode: z.enum(["auto", "prompt"]).optional(),
                })
                .strict(),
            )
            .max(200)
            .optional(),
        })
        .strict()
        .optional(),
      chatAgentId: z.string().trim().max(120).optional(),
      manualChatAgentId: z.string().trim().max(120).optional(),
      chatAgentConfig: z
        .object({
          firstMessage: z.string().trim().max(360).optional(),
          goal: z.string().trim().max(6000).optional(),
          personality: z.string().trim().max(6000).optional(),
          environment: z.string().trim().max(6000).optional(),
          tone: z.string().trim().max(6000).optional(),
          guardRails: z.string().trim().max(6000).optional(),
          toolKeys: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
          toolIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
        })
        .strict()
        .optional(),
      callOutcomeTagging: z
        .object({
          enabled: z.boolean().optional(),
          onCompletedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
          onFailedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
          onSkippedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
        })
        .strict()
        .optional(),
      messageOutcomeTagging: z
        .object({
          enabled: z.boolean().optional(),
          onSentTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
          onFailedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
          onSkippedTagIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
        })
        .strict()
        .optional(),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.activity.get": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.messages_activity.get": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      take: z.number().int().min(1).max(60).optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.contacts.search": z
    .object({
      q: z.string().trim().max(80).optional().nullable(),
      take: z.number().int().min(1).max(20).optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.manual_calls.list": z
    .object({
      campaignId: z.string().trim().max(120).optional().nullable(),
      reconcileTwilio: z.boolean().optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.manual_calls.get": z
    .object({
      id: z.string().trim().min(1).max(120),
      reconcileTwilio: z.boolean().optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.enroll_message": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      contactId: z.string().trim().min(1).max(120).optional(),
      target: z.string().trim().min(1).max(200).optional(),
      channelPolicy: z.enum(["SMS", "EMAIL", "BOTH"]).optional(),
    })
    .refine((v) => Boolean(v.contactId || v.target), { message: "contactId or target required" })
    .passthrough(),

  "ai_outbound_calls.campaigns.generate_agent_config": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      kind: z.enum(["calls", "messages"]),
      context: z.string().trim().min(3).max(4000),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.knowledge_base.sync": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.knowledge_base.upload": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().max(120).optional().nullable(),
      contentBase64: z.string().trim().min(1).max(16_000_000),
      name: z.string().trim().max(200).optional().nullable(),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.manual_call": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      toNumber: z.string().trim().min(1).max(40),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.messages_knowledge_base.sync": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.messages_knowledge_base.upload": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().max(120).optional().nullable(),
      contentBase64: z.string().trim().min(1).max(16_000_000),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.preview_message_reply": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      channel: z.enum(["sms", "email"]),
      inbound: z.string().trim().min(1).max(4000),
      history: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().trim().min(1).max(2000),
            })
            .strict(),
        )
        .max(20)
        .optional(),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.sync_agent": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "ai_outbound_calls.campaigns.sync_chat_agent": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "ai_outbound_calls.cron.run": z.object({}).passthrough(),

  "ai_outbound_calls.manual_calls.refresh": z
    .object({
      id: z.string().trim().min(1).max(120),
    })
    .passthrough(),

  "ai_outbound_calls.recordings.get": z
    .object({
      recordingSid: z.string().trim().min(1).max(64),
      asBase64: z.boolean().optional().nullable(),
      maxBytes: z.number().int().min(1).max(12 * 1024 * 1024).optional().nullable(),
    })
    .passthrough(),

  "ai_receptionist.settings.get": z.object({}).passthrough(),

  "ai_receptionist.highlights.get": z
    .object({
      lookbackHours: z.number().int().min(1).max(24 * 30).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .passthrough(),

  "ai_receptionist.settings.update": z
    .object({
      settings: z.unknown().optional(),
      regenerateToken: z.boolean().optional(),
      syncChatAgent: z.boolean().optional().nullable(),
    })
    .passthrough()
    .refine((v) => v.regenerateToken === true || v.settings !== undefined, { message: "Missing settings" }),

  "ai_receptionist.events.refresh": z
    .object({
      callSid: z.string().trim().min(1).max(80),
    })
    .passthrough(),

  "ai_receptionist.events.delete": z
    .object({
      callSid: z.string().trim().min(1).max(80),
    })
    .passthrough(),

  "ai_receptionist.recordings.get": z
    .object({
      recordingSid: z.string().trim().min(1).max(64),
    })
    .passthrough(),

  "ai_receptionist.recordings.demo.get": z
    .object({
      id: z.string().trim().min(1).max(40),
    })
    .passthrough(),

  "ai_receptionist.demo_audio.get": z
    .object({
      id: z.string().trim().min(1).max(40),
    })
    .passthrough(),

  "ai_receptionist.settings.generate": z
    .object({
      context: z.string().trim().max(4000).optional().nullable(),
      mode: z.enum(["AI", "FORWARD"]).optional().nullable(),
      aiCanTransferToHuman: z.boolean().optional().nullable(),
      forwardToPhoneE164: z.string().trim().max(60).nullable().optional(),
    })
    .passthrough(),

  "ai_receptionist.sms_system_prompt.generate": z
    .object({
      context: z.string().trim().max(4000).optional().nullable(),
    })
    .passthrough(),

  "ai_receptionist.text.polish": z
    .object({
      kind: z.enum(["systemPrompt", "greeting"]),
      channel: z.enum(["voice", "sms"]),
      text: z.string().trim().min(1).max(8000),
    })
    .passthrough(),

  "ai_receptionist.sms_reply.preview": z
    .object({
      inbound: z.string().trim().min(1).max(4000),
      history: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().trim().min(1).max(2000),
            })
            .strict(),
        )
        .max(20)
        .optional(),
      contactTagIds: z.array(z.string().trim().min(1).max(80)).max(60).optional(),
    })
    .passthrough(),

  "ai_receptionist.sms_knowledge_base.sync": z
    .object({
      knowledgeBase: z
        .object({
          seedUrl: z.string().trim().max(500).optional().nullable(),
          crawlDepth: z.number().int().min(0).max(5).optional().nullable(),
          maxUrls: z.number().int().min(0).max(1000).optional().nullable(),
          text: z.string().trim().max(20000).optional().nullable(),
        })
        .strict()
        .optional()
        .nullable(),
    })
    .passthrough(),

  "ai_receptionist.voice_knowledge_base.sync": z
    .object({
      knowledgeBase: z
        .object({
          seedUrl: z.string().trim().max(500).optional().nullable(),
          crawlDepth: z.number().int().min(0).max(5).optional().nullable(),
          maxUrls: z.number().int().min(0).max(1000).optional().nullable(),
          text: z.string().trim().max(20000).optional().nullable(),
        })
        .strict()
        .optional()
        .nullable(),
    })
    .passthrough(),

  "ai_receptionist.sms_knowledge_base.upload": z
    .object({
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().max(120).optional().nullable(),
      contentBase64: z.string().trim().min(1).max(12_000_000),
      knowledgeBase: z
        .object({
          seedUrl: z.string().trim().max(500).optional().nullable(),
          crawlDepth: z.number().int().min(0).max(5).optional().nullable(),
          maxUrls: z.number().int().min(0).max(1000).optional().nullable(),
          text: z.string().trim().max(20000).optional().nullable(),
        })
        .strict()
        .optional()
        .nullable(),
    })
    .passthrough(),

  "ai_receptionist.voice_knowledge_base.upload": z
    .object({
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().max(120).optional().nullable(),
      contentBase64: z.string().trim().min(1).max(12_000_000),
      knowledgeBase: z
        .object({
          seedUrl: z.string().trim().max(500).optional().nullable(),
          crawlDepth: z.number().int().min(0).max(5).optional().nullable(),
          maxUrls: z.number().int().min(0).max(1000).optional().nullable(),
          text: z.string().trim().max(20000).optional().nullable(),
        })
        .strict()
        .optional()
        .nullable(),
    })
    .passthrough(),

  "business_profile.get": z.object({}).passthrough(),

  "business_profile.update": z
    .object({
      businessName: z.string().trim().min(2),
      websiteUrl: z.string().trim().max(500).optional().or(z.literal("")),
      industry: z.string().trim().max(120).optional().or(z.literal("")),
      businessModel: z.string().trim().max(200).optional().or(z.literal("")),
      primaryGoals: z.array(z.string().trim().min(1)).max(10).optional(),
      targetCustomer: z.string().trim().max(240).optional().or(z.literal("")),
      brandVoice: z.string().trim().max(240).optional().or(z.literal("")),

      logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
      brandPrimaryHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Primary color must be a hex code like #1d4ed8")
        .optional()
        .or(z.literal("")),
      brandSecondaryHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Secondary color must be a hex code like #22c55e")
        .optional()
        .or(z.literal("")),
      brandAccentHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Accent color must be a hex code like #fb7185")
        .optional()
        .or(z.literal("")),
      brandTextHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Text color must be a hex code like #0f172a")
        .optional()
        .or(z.literal("")),

      brandFontFamily: z.string().trim().max(200).optional().or(z.literal("")),
      brandFontGoogleFamily: z.string().trim().max(80).optional().or(z.literal("")),

      hostedTheme: z
        .object({
          bgHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Background must be a hex code like #ffffff")
            .optional()
            .or(z.literal("")),
          surfaceHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Surface must be a hex code like #ffffff")
            .optional()
            .or(z.literal("")),
          softHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Soft background must be a hex code")
            .optional()
            .or(z.literal("")),
          borderHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Border must be a hex code")
            .optional()
            .or(z.literal("")),
          textHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Text must be a hex code")
            .optional()
            .or(z.literal("")),
          mutedTextHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Muted text must be a hex code")
            .optional()
            .or(z.literal("")),
          primaryHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Primary must be a hex code")
            .optional()
            .or(z.literal("")),
          accentHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Accent must be a hex code")
            .optional()
            .or(z.literal("")),
          linkHex: z
            .string()
            .trim()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Link must be a hex code")
            .optional()
            .or(z.literal("")),
        })
        .optional(),
    })
    .passthrough(),

  "elevenlabs.convai.token.get": z
    .object({
      agentId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "elevenlabs.convai.signed_url.get": z
    .object({
      agentId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "reporting.summary.get": z
    .object({
      range: z.enum(["today", "7d", "30d", "90d", "all"]).optional().nullable(),
    })
    .passthrough(),

  "reporting.sales.get": z
    .object({
      range: z.enum(["7d", "30d"]).optional().nullable(),
    })
    .passthrough(),

  "reporting.stripe.get": z
    .object({
      range: z.enum(["7d", "30d"]).optional().nullable(),
    })
    .passthrough(),
} as const;

export type PortalAgentActionArgs<K extends PortalAgentActionKey> = z.infer<(typeof PortalAgentActionArgsSchemaByKey)[K]>;

export type PortalAgentActionProposal = {
  key: PortalAgentActionKey;
  title: string;
  confirmLabel?: string;
  args: Record<string, unknown>;
};

export function portalAgentActionsIndexText(opts?: { includeAiChat?: boolean }): string {
  const includeAiChat = opts?.includeAiChat ?? true;
  const lines = [
    "Available actions (choose up to 6):",
    "- tasks.create: Create a portal task (fields: title, description?, assignedToUserId?, dueAtIso?)",
    "- tasks.create_for_all: Create the same task for every team member (fields: title, description?, dueAtIso?)",
    "- tasks.update: Update a task (fields: taskId, status?, title?, description?, assignedToUserId?, dueAtIso?)",
    "- tasks.list: List/search tasks (fields: status=OPEN|DONE|CANCELED|ALL?, assigned=all|me?, q?, limit?)",
    "- tasks.assignees.list: List task assignees (team members)",
    "- funnel.create: Create a Funnel Builder funnel (fields: name, slug)",
    "- funnel_builder.settings.get: Get Funnel Builder settings",
    "- funnel_builder.settings.update: Update Funnel Builder settings (fields: notifyEmails?, webhookUrl?, regenerateSecret?)",
    "- funnel_builder.domains.list: List Funnel Builder custom domains",
    "- funnel_builder.domains.create: Add a Funnel Builder custom domain (fields: domain)",
    "- funnel_builder.domains.update: Update domain root behavior (fields: domain, rootMode?, rootFunnelSlug?)",
    "- funnel_builder.domains.verify: Verify a custom domain’s DNS + hosting status (fields: domainId)",
    "- funnel_builder.forms.list: List Funnel Builder forms",
    "- funnel_builder.forms.create: Create a Funnel Builder form (fields: slug, name?)",
    "- funnel_builder.forms.get: Get a Funnel Builder form (fields: formId)",
    "- funnel_builder.forms.update: Update a Funnel Builder form (fields: formId, name?, status?, slug?, schemaJson?)",
    "- funnel_builder.forms.delete: Delete a Funnel Builder form (fields: formId)",
    "- funnel_builder.forms.submissions.list: List form submissions (fields: formId, limit?, cursor?)",
    "- funnel_builder.forms.submissions.get: Get a single form submission with device context (fields: formId, submissionId)",
    "- funnel_builder.form_field_keys.get: List unique form field keys across forms",
    "- funnel_builder.funnels.list: List funnels",
    "- funnel_builder.funnels.get: Get a funnel (fields: funnelId)",
    "- funnel_builder.funnels.update: Update a funnel (fields: funnelId, name?, status?, slug?, domain?, seo?)",
    "- funnel_builder.funnels.delete: Delete a funnel (fields: funnelId)",
    "- funnel_builder.pages.list: List pages for a funnel (fields: funnelId)",
    "- funnel_builder.pages.create: Create a page (fields: funnelId, slug, title?, contentMarkdown?, sortOrder?)",
    "- funnel_builder.pages.update: Update a page (fields: funnelId, pageId, title?, contentMarkdown? (NOT content), sortOrder?, editorMode=MARKDOWN|BLOCKS|CUSTOM_HTML?, customHtml?, blocksJson?, customChatJson?, slug?, seo?)",
    "- funnel_builder.pages.delete: Delete a page (fields: funnelId, pageId)",
    "- funnel_builder.pages.generate_html: Generate/update a page’s custom HTML with AI (fields: funnelId, pageId, prompt, currentHtml?, attachments?, contextKeys?, contextMedia?)",
    "- funnel_builder.pages.export_custom_html: Generate and store custom HTML from blocks (fields: funnelId, pageId, blocksJson?, title?, setEditorMode?)",
    "- funnel_builder.pages.global_header: Apply/unset a global header block (fields: mode, funnelId, headerBlock OR keepOnPageId+localHeaderBlock)",
    "- funnel_builder.custom_code_block.generate: Generate custom code block HTML/CSS or block actions (fields: funnelId, pageId, prompt, currentHtml?, currentCss?, contextKeys?, contextMedia?)",
    "- funnel_builder.sales.products.list: List Stripe products (Funnel Builder sales)",
    "- funnel_builder.sales.products.create: Create a Stripe product (fields: name, description?, imageUrls?, priceCents, currency?)",
    "- blogs.appearance.get: Get blog appearance (fonts)",
    "- blogs.appearance.update: Update blog appearance (fields: useBrandFont?, titleFontKey?, bodyFontKey?)",
    "- blogs.site.get: Get blog site settings",
    "- blogs.site.create: Create/update blog site settings (fields: name, primaryDomain?, slug?)",
    "- blogs.site.update: Upsert blog site settings (fields: name, primaryDomain?, slug?)",
    "- blogs.usage.get: Get blog usage stats (fields: range=7d|30d|90d|all?)",
    "- blogs.posts.list: List blog posts (fields: take?, includeArchived?)",
    "- blogs.posts.create: Create a draft blog post (fields: title?)",
    "- blogs.posts.get: Get a blog post (fields: postId)",
    "- blogs.posts.update: Update a blog post (fields: postId, title, slug, excerpt, content, seoKeywords?, publishedAt?, archived?)",
    "- blogs.posts.delete: Delete a blog post (fields: postId)",
    "- blogs.posts.archive: Archive/unarchive a blog post (fields: postId, archived)",
    "- blogs.posts.export_markdown: Export a blog post as Markdown (fields: postId)",
    "- blogs.automation.settings.get: Get blog automation settings",
    "- blogs.automation.settings.update: Update blog automation settings (fields: enabled, frequencyDays, topics, autoPublish?)",
    "- blogs.generate_now: Generate a blog draft now",
    "- blogs.posts.generate_draft: Generate an AI draft for a specific post (fields: postId, prompt?/topic?)",
    "- blogs.posts.publish: Publish a blog post (fields: postId)",
    "- blogs.site.verify: Verify your blog primary domain via DNS TXT record (fields: domain)",
    "- newsletter.site.get: Get newsletter site settings",
    "- newsletter.site.update: Create/update newsletter site settings (fields: name, primaryDomain?, slug?)",
    "- newsletter.usage.get: Get newsletter usage stats (fields: range=7d|30d|90d|all?)",
    "- newsletter.royalty_free_images.search: Search Wikimedia Commons royalty-free images (fields: q, take?)",
    "- newsletter.royalty_free_images.suggest: Suggest a Commons search query and return images (fields: prompt, take?)",
    "- newsletter.newsletters.list: List newsletters (fields: kind=external|internal?, take?)",
    "- newsletter.newsletters.create: Create a newsletter (fields: kind, status?, title, excerpt, content, smsText?)",
    "- newsletter.newsletters.get: Get a newsletter (fields: newsletterId)",
    "- newsletter.newsletters.update: Update a newsletter (fields: newsletterId, title, excerpt, content, smsText?, hostedOnly?)",
    "- newsletter.newsletters.send: Send a newsletter now (fields: newsletterId)",
    "- newsletter.audience.contacts.search: Search contacts for newsletter audience (fields: q? OR ids?, take?)",
    "- newsletter.automation.settings.get: Get newsletter automation settings (fields: kind=external|internal?)",
    "- newsletter.automation.settings.update: Update newsletter automation settings (fields: kind, enabled, frequencyDays, requireApproval?, channels?, topics?, promptAnswers?, deliveryEmailHint?, deliverySmsHint?, includeImages?, royaltyFreeImages?, includeImagesWhereNeeded?, fontKey?, audience?)",
    "- newsletter.generate_now: Generate a newsletter draft now (fields: kind=external|internal)",
    "- billing.summary.get: Get billing summary",
    "- billing.subscriptions.list: List active subscriptions",
    "- billing.info.get: Get billing profile info (customer + default payment method)",
    "- billing.info.update: Update billing profile info (fields: billingEmail?, billingName?, billingPhone?, billingAddress?, billingCity?, billingState?, billingPostalCode?)",
    "- billing.subscriptions.cancel: Cancel your active subscription (fields: immediate?)",
    "- billing.subscriptions.cancel_by_id: Cancel a specific subscription (fields: subscriptionId, immediate?)",
    "- billing.checkout_module: Start module checkout (fields: module, promoCode?, campaignId?, serviceSlug?, successPath?, cancelPath?)",
    "- billing.portal_session.create: Create a Stripe billing portal session (fields: returnPath?)",
    "- billing.credits_only.cancel: Cancel/resume credits-only billing access (fields: action=cancel|resume)",
    "- billing.monthly_credits.cron.run: Process due monthly credits gifts (fields: limit?, maxCatchUpGiftsPerOwner?)",
    "- billing.onboarding.checkout: Start onboarding checkout (fields: planIds, planQuantities?, couponCode?)",
    "- billing.onboarding.confirm: Confirm onboarding after checkout (fields: sessionId? OR bypass?)",
    "- billing.setup_intent.create: Create a Stripe SetupIntent to add a card",
    "- billing.setup_intent.finalize: Finalize SetupIntent and set default payment method (fields: setupIntentId)",
    "- billing.upgrade.checkout: Start upgrade bundle checkout (fields: bundleId)",
    "- pricing.get: Get module and credits pricing (includes credit USD value)",
    "- ads.next: Get the next portal ad campaign for a placement (fields: placement, path?, excludeCampaignIds?)",
    "- ads.click: Record an ad click and get the redirect URL (fields: campaignId, placement, path?, to?)",
    "- ads.claim: Claim an ad campaign reward (fields: campaignId, watchedSeconds?, path?)",
    "- ads.reward: Claim the daily ad reward (credits-only billing)",
    "- credits.get: Get credits balance + auto-top-up state",
    "- credits.auto_topup.set: Enable/disable auto-top-up (fields: autoTopUp)",
    "- credits.topup.start: Start a credits top-up (fields: credits OR packages (legacy))",
    "- credits.topup.confirm_checkout: Confirm a Stripe Checkout top-up (fields: sessionId)",
    "- reporting.summary.get: Get reporting dashboard KPIs (fields: range=today|7d|30d|90d|all?)",
    "- reporting.sales.get: Get sales report (fields: range=7d|30d?)",
    "- reporting.stripe.get: Get Stripe charges report (fields: range=7d|30d?)",
    "- credit.contacts.list: List/search credit contacts (fields: q?)",
    "- credit.pulls.list: List credit pulls (fields: contactId?)",
    "- credit.pulls.create: Create a credit pull stub record (fields: contactId)",
    "- credit.disputes.letters.list: List credit dispute letters (fields: contactId?)",
    "- credit.disputes.letter.get: Get a credit dispute letter (fields: letterId)",
    "- credit.disputes.letter.create: Generate a credit dispute letter draft using AI (fields: contactId, disputesText, recipientName?, recipientAddress?, creditPullId?)",
    "- credit.disputes.letter.update: Update a credit dispute letter (fields: letterId, subject?, bodyText?)",
    "- credit.disputes.letter.pdf.generate: Generate/export dispute letter PDF to media library (fields: letterId)",
    "- credit.disputes.letter.send: Email a dispute letter (fields: letterId, to?)",
    "- credit.reports.list: List credit reports",
    "- credit.reports.get: Get a credit report (fields: reportId)",
    "- credit.reports.import: Import a credit report JSON and extract items (fields: rawJson, contactId?, provider?)",
    "- credit.reports.pull: Create a placeholder provider-pulled report (fields: contactId, provider?)",
    "- credit.reports.items.update: Update a credit report item status (fields: reportId, itemId, auditTag?, disputeStatus?)",
    "- automations.run: Run an automation by id (fields: automationId, contact?)",
    "- automations.create: Create an automation (fields: name, template?=blank|post_appointment_nurture_enrollment, nurtureCampaignId?, prompt?, targetContactId?)",
    "- automations.settings.get: Get automations settings (returns webhookToken, viewer, automations)",
    "- automations.settings.update: Replace automations settings (fields: automations)",
    "- automations.test_sms: Trigger an automation as if an inbound SMS occurred (fields: automationId, from, body?)",
    "- contacts.list: List/search contacts (fields: q?, limit?)",
    "- contacts.create: Create a contact (fields: name, email?, phone?, tags?, customVariables?)",
    "- contacts.get: Get a contact by id with recent activity (fields: contactId)",
    "- contacts.update: Update a contact (fields: contactId, name, email?, phone?, customVariables?)",
    "- contacts.delete: Delete a contact (fields: contactId)",
    "- contacts.tags.list: List tag assignments for a contact (fields: contactId)",
    "- contacts.tags.add: Assign a tag to a contact (fields: contactId, tagId)",
    "- contacts.tags.remove: Remove a tag from a contact (fields: contactId, tagId)",
    "- onboarding.status.get: Get onboarding completion status (business profile + blogs setup)",
    "- suggested_setup.preview.get: Get suggested setup preview (entitlements + proposed actions)",
    "- suggested_setup.apply: Apply selected suggested setup actions (fields: actionIds)",
    "- ai_agents.list: List known ElevenLabs agent IDs referenced by your portal account (voice/chat/outbound)",
    "- ai_chat.threads.list: List Pura AI chat threads only (NOT customer inbox/email/SMS conversations)",
    "- ai_chat.threads.create: Create a new AI chat thread (fields: title?)",
    "- ai_chat.threads.update: Update thread metadata (fields: threadId, title?, pinned?)",
    "- ai_chat.threads.delete: Delete an AI chat thread (fields: threadId)",
    "- ai_chat.threads.duplicate: Duplicate an AI chat thread (fields: threadId, title?)",
    "- ai_chat.threads.share.get: Get the share settings for a thread (fields: threadId)",
    "- ai_chat.threads.share.set: Share a thread with portal users (fields: threadId, userIds[])",
    "- ai_chat.threads.choice.set: Set a thread choice/selection (fields: threadId, kind, value)",
    "- ai_chat.threads.actions.run: Run a thread action (fields: threadId, action=pin|unpin|delete|duplicate, title? (duplicate))",
    "- ai_chat.threads.runs.list: List recent run ledger entries for a thread (fields: threadId)",
    "- ai_chat.threads.status.get: Get the current live status snapshot for a thread (fields: threadId)",
    "- ai_chat.threads.status.list: Get live status snapshots across visible threads",
    "- ai_chat.messages.list: List messages in an AI chat thread (fields: threadId)",
    "- ai_chat.messages.send: Send a chat message and get an assistant reply (fields: threadId, text?, url?, attachments?)",
    "- ai_chat.attachments.upload: Upload one or more files for chat (fields: files[{fileName,mimeType?,contentBase64}])",
    "- ai_chat.actions.execute: Execute a whitelisted portal action and append the result to a thread (fields: threadId, action, args?)",
    "- ai_chat.scheduled.create: Create a scheduled AI chat user message (fields: threadId?, text, sendAtIso? OR sendAtLocal?, repeatEveryMinutes?)",
    "  - sendAtLocal: { isoWeekday: 1..7, timeLocal: \"HH:mm\", timeZone?: \"America/Chicago\" } (recommended for weekday schedules)",
    "- ai_chat.scheduled.list: List scheduled (unsent) AI chat user messages",
    "- ai_chat.scheduled.reschedule: Bulk shift scheduled AI chat messages to a new time-of-day (fields: channel?, threadId?, messageIds?, timeLocal, timeZone?)",
    "- ai_chat.scheduled.update: Update a scheduled message (fields: messageId, text?, sendAtIso? OR sendAtLocal?, repeatEveryMinutes?)",
    "- ai_chat.scheduled.delete: Delete a scheduled message (fields: messageId)",
    "- ai_chat.threads.flush: No-op (kept for legacy callers)",
    "- ai_chat.cron.run: Process due scheduled AI chat messages (cron)",
    "- contact_tags.list: List contact tags",
    "- contact_tags.create: Create a contact tag (fields: name, color?)",
    "- contact_tags.update: Update a contact tag (fields: tagId, name?, color?)",
    "- contact_tags.delete: Delete a contact tag (fields: tagId)",
    "- me.get: Get the current portal member identity (ownerId/memberId/role) and effective permissions",
    "- auth.resend_verification: Resend your email verification message (returns alreadyVerified=true if applicable)",
    "- auth.verify_email: Verify an email token (fields: token) (no session required)",
    "- engagement.ping: Record a lightweight portal engagement ping (fields: path?, source?)",
    "- engagement.active_time: Record portal active time telemetry and hours-saved rollups (fields: dtSec, path?)",
    "- push.register: Register your device for push notifications (fields: expoPushToken, platform?, deviceName?)",
    "- referrals.link.get: Get your referral link + referral stats",
    "- referrals.link.rotate: Rotate your referral code and return the updated referral link + stats",
    "- profile.get: Get the current portal member profile (name/email/phone/city/state + voice agent status)",
    "- profile.update: Update profile and extras (fields: firstName?, lastName?, email?, phone?, city?, state?, voiceAgentId?, voiceAgentApiKey?, enableDefaultSmsNotifications?, currentPassword? (required for name/email changes))",
    "- profile.password.update: Change your password (fields: currentPassword, newPassword)",
    "- integrations.twilio.get: Get Twilio SMS integration status + webhook URLs (fields: includeDiagnostics?)",
    "- integrations.twilio.update: Connect or clear Twilio SMS (fields: clear? OR accountSid/authToken/messagingServiceSid?/phoneNumberE164?)",
    "- integrations.stripe.get: Get Stripe integration status (secret key prefix + connected account)",
    "- integrations.stripe.delete: Disconnect Stripe integration (clears stored keys and connection metadata)",
    "- integrations.stripe.update: Set Stripe secret key (fields: secretKey) (encryption required)",
    "- integrations.sales_reporting.get: Get sales reporting integration status (active provider + configured providers)",
    "- integrations.sales_reporting.disconnect: Disconnect a sales reporting provider (fields: provider)",
    "- integrations.sales_reporting.update: Connect/update a sales reporting provider (fields: provider, credentials?, setActive?) (encryption required for most providers)",
    "- integrations.api_keys.list: List portal API keys",
    "- integrations.api_keys.create: Create a scoped portal API key (fields: name, permissions, creditLimit?)",
    "- integrations.api_keys.update: Update a scoped portal API key (fields: keyId, name?, permissions?, creditLimit?)",
    "- integrations.api_keys.delete: Delete a scoped portal API key (fields: keyId)",
    "- integrations.api_keys.reveal: Reveal the raw value for a portal API key (fields: keyId)",
    "- follow_up.settings.get: Get Follow-Up automation settings and queue preview",
    "- follow_up.settings.update: Update Follow-Up automation settings (fields: settings)",
    "- follow_up.custom_variables.get: Get Follow-Up custom variables (available to lead scraping and follow-up)",
    "- follow_up.custom_variables.update: Set a Follow-Up custom variable (fields: key, value)",
    "- follow_up.ai.generate_step: Draft Follow-Up message copy (fields: kind, stepName?, prompt?, existingSubject?, existingBody?)",
    "- follow_up.test_send: Send a test follow-up message (fields: channel, to, subject?, body)",

    "- lead_scraping.settings.get: Get Lead Scraping settings",
    "- lead_scraping.settings.update: Update Lead Scraping settings (fields: settings)",
    "- lead_scraping.run: Run Lead Scraping now (fields: kind=B2B|B2C?, count?, niche?, location?, requireEmail?, requirePhone?, requireWebsite?, aiOutbound?)",
    "- lead_scraping.leads.list: List/search scraped leads (fields: take?, q?, kind?)",
    "- lead_scraping.leads.update: Update a scraped lead (fields: leadId, starred?, email?, tag?, tagColor?)",
    "- lead_scraping.leads.delete: Delete a scraped lead (fields: leadId)",
    "- lead_scraping.contact.send: Manually send an email and/or text to a scraped lead (fields: leadId, message, subject? (email), sendEmail?, sendSms?)",
    "- lead_scraping.outbound.approve: Mark a lead as approved/unapproved for outbound (fields: leadId, approved). May send outbound if triggers are ON_APPROVE.",
    "- lead_scraping.outbound.send: Send outbound to a lead using current Lead Scraping outbound settings (fields: leadId)",
    "- lead_scraping.outbound.ai.draft_template: Draft Lead Scraping outbound template copy with AI (fields: kind=SMS|EMAIL, prompt?, existingSubject?, existingBody?)",
    "- notifications.recipients.list: List notification recipient contacts for the portal account",
    "- webhooks.get: Get canonical webhook URLs (Twilio inbound/status callback + legacy tokens)",
    "- bug_report.submit: Submit a bug report to the team (fields: message, url?, area?, meta?)",
    "- support_chat.send: Ask the support chat assistant a question (fields: message, url?, meta?, context.recentMessages?)",
    "- voice_agent.tools.get: List voice agent tool IDs resolved from your ElevenLabs API key (call transfer, calendar booking, etc)",
    "- voice_agent.voices.list: List available ElevenLabs voices (requires voice agent API key)",
    "- voice_agent.voices.preview: Generate a short voice preview audio clip (fields: voiceId, text)",
    "- services.catalog.get: List the portal services catalog (grouped by category)",
    "- services.status.get: Get portal service status for each service (active/needs_setup/locked/etc)",
    "- services.lifecycle.update: Pause/cancel/resume a service (fields: serviceSlug, action=pause|cancel|resume)",
    "- mailbox.get: Get the portal mailbox email alias",
    "- mailbox.update: Update the portal mailbox email alias local-part (fields: localPart)",
    "- missed_call_textback.settings.get: Get Missed-Call Text Back settings and recent events",
    "- missed_call_textback.settings.update: Update Missed-Call Text Back settings or regenerate webhook token (fields: settings? OR regenerateToken=true)",
    "- people.users.list: List portal team members and invites",
    "- people.users.invite: Invite a team member (fields: email, role=ADMIN|MEMBER?, permissions?)",
    "- people.users.update: Update a team member role/permissions (fields: userId, role?, permissions?)",
    "- people.users.delete: Remove a team member (fields: userId)",
    "- people.leads.update: Update a lead (fields: leadId, businessName?, email?, phone?, website?, contactId?)",
    "- people.contacts.import: Import contacts from CSV text (fields: csvText, allowDuplicates?, tags?, mapping?)",
    "- people.contacts.custom_variable_keys.get: List existing contact custom variable keys",
    "- people.contacts.duplicates.get: List duplicate contact groups (fields: limitGroups?, summaryOnly?)",
    "- people.contacts.merge: Merge duplicate contacts (fields: primaryContactId, mergeContactIds, primaryEmail?)",
    "- people.contacts.custom_variables.patch: Set/remove a contact custom variable (fields: contactId, key, value?)",
    "- inbox.threads.list: List/search inbox threads (fields: channel=EMAIL|SMS?, q?, take?)",
    "- inbox.thread.messages.list: Load messages for a thread (fields: threadId, take?)",
    "- inbox.thread.contact.set: Set/link the contact for an inbox thread (fields: threadId, name, email?, phone?)",
    "- inbox.scheduled.update: Reschedule a pending scheduled inbox message (fields: scheduledId, scheduledFor)",
    "- inbox.attachments.upload: Upload one or more inbox attachments (fields: files[{fileName,mimeType?,contentBase64}])",
    "- inbox.attachments.create_from_media: Create an inbox attachment from a Media Library item (fields: mediaItemId)",
    "- inbox.attachments.delete: Delete an unsent inbox attachment (fields: id)",
    "- inbox.settings.get: Get inbox settings (mailbox + webhook URLs)",
    "- inbox.settings.update: Regenerate inbox webhook token (fields: regenerateToken=true)",
    "- inbox.send: Send or schedule an inbox message (fields: channel=email|sms, to, subject?, body?, attachmentIds?, threadId?, sendAt?)",
    "- inbox.send_sms: Send an SMS (fields: body, to? (phone), contactId? (preferred), threadId?)",
    "- inbox.send_email: Send an email (fields: to, subject, body, threadId?)",
    "- reviews.send_request_for_booking: Send a review request for a completed booking (fields: bookingId)",
    "- reviews.send_request_for_contact: Send a review request to a contact (fields: contactId)",
    "- reviews.reply: Reply to a review (fields: reviewId, reply?)",
    "- reviews.settings.get: Get review request settings",
    "- reviews.settings.update: Update review request settings (fields: settings)",
    "- reviews.site.get: Get hosted reviews site config",
    "- reviews.site.update: Update hosted reviews site primary domain (fields: primaryDomain?)",
    "- reviews.inbox.list: List collected reviews (fields: includeArchived?)",
    "- reviews.archive: Archive/unarchive a collected review (fields: reviewId, archived)",
    "- reviews.bookings.list: List upcoming and recent bookings (for sending review requests)",
    "- reviews.contacts.search: Search contacts (fields: q?, take?)",
    "- reviews.events.list: List review request events (fields: limit?)",
    "- reviews.handle.get: Get the public reviews page handle",
    "- reviews.questions.list: List review Q&A questions",
    "- reviews.questions.answer: Answer a review question (fields: id, answer?)",
    "- media.folders.list: List all Media Library folders",
    "- media.folders.update: Rename/move a Media Library folder (fields: id, name?, parentId?, color?)",
    "- media.folder.ensure: Ensure a Media Library folder exists (fields: name, parentId?, color?)",
    "- media.items.list: List/search Media Library items (fields: q?, folderId?, limit?)",
    "- media.items.move: Move media items into a folder (fields: itemIds, folderId? OR folderName(+parentId?))",
    "- media.items.update: Rename or move a single Media Library item (fields: id, fileName?, folderId?)",
    "- media.items.delete: Delete a Media Library item (fields: id)",
    "- media.items.create_from_blob: Save a Vercel Blob upload into Media Library (fields: url, fileName, mimeType, fileSize, folderId?)",
    "- media.import_remote_image: Import an image from a URL into Media Library (fields: url, fileName?, folderId? OR folderName(+parentId?))",
    "- media.list.get: List Media Library folders/items for a folder (fields: folderId?)",
    "- media.stats.get: Get Media Library stats (items/folders counts)",
    "- dashboard.get: Get the portal dashboard data (fields: scope=default|embedded?)",
    "- dashboard.save: Save the portal dashboard layout/data (fields: scope?, data)",
    "- dashboard.reset: Reset the portal dashboard layout (fields: scope=default|embedded?)",
    "- dashboard.add_widget: Add a dashboard widget (fields: scope?, widgetId)",
    "- dashboard.remove_widget: Remove a dashboard widget (fields: scope?, widgetId)",
    "- dashboard.optimize: Optimize dashboard widgets/layout for a niche (fields: scope?, niche?)",
    "- dashboard.analysis.get: Get the cached dashboard analysis summary",
    "- dashboard.analysis.generate: Generate or refresh the dashboard analysis summary (fields: trigger?, force?)",
    "- dashboard.quick_access.get: Get dashboard quick access shortcuts",
    "- dashboard.quick_access.update: Update dashboard quick access shortcuts (fields: slugs)",
    "- booking.calendar.create: Create a booking calendar config entry (fields: title, id?, description?, durationMinutes?, meetingLocation?, meetingDetails?, notificationEmails?)",
    "- booking.availability.set_daily: Set business-hour availability for a date range (fields: startDateLocal, endDateLocal, startTimeLocal, endTimeLocal, timeZone?, isoWeekdays?, replaceExisting?)",
    "- booking.calendars.get: Get booking calendars config",
    "- booking.calendars.update: Update booking calendars config (fields: calendars[]; each item requires id + title; prefer booking.calendars.get then update; do NOT use this for business-hour availability)",
    "- booking.bookings.list: List upcoming/recent bookings (fields: take?)",
    "- booking.cancel: Cancel a booking (fields: bookingId)",
    "- booking.reschedule: Reschedule a booking start time (fields: bookingId, startAtIso, forceAvailability?)",
    "- booking.contact: Contact a booking lead via email and/or SMS (fields: bookingId, message, subject?, sendEmail?, sendSms?)",

    "- booking.settings.get: Get booking settings",
    "- booking.settings.update: Update booking settings (fields: enabled?, title?, description?, durationMinutes?, timeZone?, slug?, meetingPlatform?, photoUrl?, meetingLocation?, meetingDetails?, appointmentPurpose?, toneDirection?, notificationEmails?)",
    "- booking.form.get: Get booking form config",
    "- booking.form.update: Update booking form config (fields: thankYouMessage?, phone?, notes?, questions?; questions[] items use {label, kind=short|long|single_choice|multiple_choice?, options?})",
    "- booking.site.get: Get booking public site config",
    "- booking.site.update: Update booking public site primary domain (fields: primaryDomain?)",
    "- booking.suggestions.slots: List suggested available booking slots (fields: startAtIso?, days?, durationMinutes?, limit?)",

    "- booking.reminders.settings.get: Get appointment reminder settings (fields: calendarId?)",
    "- booking.reminders.settings.update: Update appointment reminder settings (fields: calendarId?, settings)",
    "- booking.reminders.ai.generate_step: Draft appointment reminder copy with AI (fields: kind=SMS|EMAIL, prompt?, existingSubject?, existingBody?)",

    "- nurture.campaigns.list: List nurture campaigns (fields: take?)",
    "- nurture.campaigns.create: Create a nurture campaign (fields: name?)",
    "- nurture.campaigns.get: Get a nurture campaign and its steps (fields: campaignId)",
    "- nurture.campaigns.update: Update a nurture campaign (fields: campaignId, name?, status?, audienceTagIds?, smsFooter?, emailFooter?)",
    "- nurture.campaigns.delete: Delete a nurture campaign (fields: campaignId)",
    "- nurture.campaigns.steps.add: Add a nurture step to a campaign (fields: campaignId, kind=SMS|EMAIL|TAG?)",
    "- nurture.steps.update: Update a nurture step (fields: stepId, ord?, kind?, delayMinutes?, subject?, body?)",
    "- nurture.steps.delete: Delete a nurture step (fields: stepId)",
    "- nurture.campaigns.enroll: Enroll contacts into a campaign using audience tags (fields: campaignId, tagIds?, dryRun?)",
    "- nurture.billing.confirm_checkout: Confirm a Stripe checkout for a campaign (fields: campaignId, sessionId)",
    "- nurture.ai.generate_step: Draft a nurture campaign step with AI (fields: kind=SMS|EMAIL, campaignName?, prompt?, existingSubject?, existingBody?)",

    "- ai_outbound_calls.campaigns.list: List AI outbound call campaigns (fields: lite?)",
    "- ai_outbound_calls.campaigns.create: Create an AI outbound call campaign (fields: name?)",
    "- ai_outbound_calls.campaigns.update: Update an AI outbound call campaign (fields: campaignId, name?, status?, audienceTagIds?, chatAudienceTagIds?, messageChannelPolicy?, voiceAgentId?, manualVoiceAgentId?, voiceAgentConfig?, voiceId?, knowledgeBase?, messagesKnowledgeBase?, chatAgentId?, manualChatAgentId?, chatAgentConfig?, callOutcomeTagging?, messageOutcomeTagging?)",
    "- ai_outbound_calls.campaigns.activity.get: Get AI outbound call campaign call activity (fields: campaignId)",
    "- ai_outbound_calls.campaigns.messages_activity.get: Get AI outbound call campaign message activity (fields: campaignId, take?)",
    "- ai_outbound_calls.contacts.search: Search contacts (AI outbound calls) (fields: q?, take?)",
    "- ai_outbound_calls.manual_calls.list: List manual calls (fields: campaignId?, reconcileTwilio?)",
    "- ai_outbound_calls.manual_calls.get: Get a manual call (fields: id, reconcileTwilio?)",
    "- ai_outbound_calls.campaigns.enroll_message: Manually enroll a contact into a campaign message sequence (fields: campaignId, contactId?, target?, channelPolicy?)",
    "- ai_outbound_calls.campaigns.generate_agent_config: AI-generate a starter agent config JSON for a campaign (fields: campaignId, kind=calls|messages, context)",
    "- ai_outbound_calls.campaigns.knowledge_base.sync: Sync campaign Calls knowledge base (fields: campaignId)",
    "- ai_outbound_calls.campaigns.knowledge_base.upload: Upload a file to the campaign Calls knowledge base (fields: campaignId, fileName, mimeType?, contentBase64, name?)",
    "- ai_outbound_calls.campaigns.manual_call: Start a manual outbound call from a campaign (fields: campaignId, toNumber)",
    "- ai_outbound_calls.campaigns.messages_knowledge_base.sync: Sync campaign Messages knowledge base (fields: campaignId)",
    "- ai_outbound_calls.campaigns.messages_knowledge_base.upload: Upload a file to the campaign Messages knowledge base (fields: campaignId, fileName, mimeType?, contentBase64)",
    "- ai_outbound_calls.campaigns.preview_message_reply: Preview an AI reply for a customer message (fields: campaignId, channel=sms|email, inbound, history?)",
    "- ai_outbound_calls.campaigns.sync_agent: Sync campaign Calls agent with ElevenLabs (fields: campaignId)",
    "- ai_outbound_calls.campaigns.sync_chat_agent: Sync campaign Messages agent with ElevenLabs (fields: campaignId)",
    "- ai_outbound_calls.cron.run: No-op (cron endpoint is protected; use the platform scheduler)",
    "- ai_outbound_calls.manual_calls.refresh: Refresh a manual call record (fetch transcript/recording if available) (fields: id)",
    "- ai_outbound_calls.recordings.get: Fetch a manual-call recording audio (base64; size-limited) (fields: recordingSid, asBase64?, maxBytes?)",
    "- ai_receptionist.settings.get: Get AI receptionist settings and recent call events",
    "- ai_receptionist.highlights.get: Summarize important AI receptionist status + recent call issues (fields: lookbackHours?, limit?)",
    "- ai_receptionist.settings.update: Update AI receptionist settings or regenerate webhook token (fields: settings? OR regenerateToken=true, syncChatAgent?)",
    "- ai_receptionist.events.refresh: Refresh/reconcile a call event (fields: callSid)",
    "- ai_receptionist.events.delete: Delete a call event (fields: callSid)",
    "- ai_receptionist.recordings.get: Get a link to an AI receptionist call recording audio stream (fields: recordingSid)",
    "- ai_receptionist.recordings.demo.get: Get a demo AI receptionist recording audio link (fields: id)",
    "- ai_receptionist.demo_audio.get: Get a demo AI receptionist audio link (fields: id)",
    "- ai_receptionist.settings.generate: Generate AI receptionist settings (fields: context?, mode?, aiCanTransferToHuman?, forwardToPhoneE164?)",
    "- ai_receptionist.sms_system_prompt.generate: Generate an inbound SMS system prompt for the AI receptionist (fields: context?)",
    "- ai_receptionist.text.polish: Polish receptionist text (fields: kind, channel, text)",
    "- ai_receptionist.sms_reply.preview: Preview an AI receptionist SMS reply (fields: inbound, history?, contactTagIds?)",
    "- ai_receptionist.sms_knowledge_base.sync: Sync the AI receptionist SMS knowledge base (fields: knowledgeBase.seedUrl?, knowledgeBase.crawlDepth?, knowledgeBase.maxUrls?, knowledgeBase.text?)",
    "- ai_receptionist.voice_knowledge_base.sync: Sync the AI receptionist Voice knowledge base (fields: knowledgeBase.seedUrl?, knowledgeBase.crawlDepth?, knowledgeBase.maxUrls?, knowledgeBase.text?)",
    "- ai_receptionist.sms_knowledge_base.upload: Upload a file to the AI receptionist SMS knowledge base (fields: fileName, mimeType?, contentBase64, knowledgeBase.seedUrl?, knowledgeBase.crawlDepth?, knowledgeBase.maxUrls?, knowledgeBase.text?)",
    "- ai_receptionist.voice_knowledge_base.upload: Upload a file to the AI receptionist Voice knowledge base (fields: fileName, mimeType?, contentBase64, knowledgeBase.seedUrl?, knowledgeBase.crawlDepth?, knowledgeBase.maxUrls?, knowledgeBase.text?)",
    "- business_profile.get: Get the Business Profile (and hosted theme)",
    "- business_profile.update: Create/update the Business Profile (fields: businessName, websiteUrl?, industry?, businessModel?, primaryGoals?, targetCustomer?, brandVoice?, logoUrl?, brandPrimaryHex?, brandSecondaryHex?, brandAccentHex?, brandTextHex?, brandFontFamily?, brandFontGoogleFamily?, hostedTheme?)",
    "- elevenlabs.convai.token.get: Get an ElevenLabs ConvAI conversation token for an agent (fields: agentId) (returns sensitive token)",
    "- elevenlabs.convai.signed_url.get: Get an ElevenLabs ConvAI signed URL for an agent (fields: agentId) (returns sensitive URL)",
  ];

  const filtered = includeAiChat
    ? lines
    : lines.filter((l) => {
        const s = String(l).trimStart();
        if (/^\-\s*ai_chat\./i.test(s)) return false;
        if (/^\-\s*sendAtLocal\s*:/i.test(s)) return false;
        return true;
      });
  return filtered.join("\n");
}

export function extractJsonObject(text: string): unknown {
  const raw = String(text || "").trim();
  if (!raw) return null;

  // Prefer fenced JSON blocks.
  const fence = /```json\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      // fallthrough
    }
  }

  // Fallback: first {...} blob.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
}
