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

  { action: "contacts.get", method: "GET", endpoint: "/api/portal/contacts/[contactId]" },
  { action: "contacts.update", method: "PATCH", endpoint: "/api/portal/contacts/[contactId]" },

  { action: "contacts.tags.list", method: "GET", endpoint: "/api/portal/contacts/[contactId]/tags" },
  { action: "contacts.tags.add", method: "POST", endpoint: "/api/portal/contacts/[contactId]/tags" },
  { action: "contacts.tags.remove", method: "DELETE", endpoint: "/api/portal/contacts/[contactId]/tags" },

  { action: "tasks.list", method: "GET", endpoint: "/api/portal/tasks" },
  { action: "tasks.create", method: "POST", endpoint: "/api/portal/tasks" },
  { action: "tasks.update", method: "PATCH", endpoint: "/api/portal/tasks/[taskId]" },
  { action: "tasks.assignees.list", method: "GET", endpoint: "/api/portal/tasks/assignees" },

  { action: "people.users.list", method: "GET", endpoint: "/api/portal/people/users" },
  { action: "people.users.invite", method: "POST", endpoint: "/api/portal/people/users" },
  { action: "people.users.update", method: "PATCH", endpoint: "/api/portal/people/users/[userId]" },
  { action: "people.users.delete", method: "DELETE", endpoint: "/api/portal/people/users/[userId]" },
  { action: "people.leads.update", method: "PATCH", endpoint: "/api/portal/people/leads/[leadId]" },
  { action: "people.contacts.custom_variable_keys.get", method: "GET", endpoint: "/api/portal/people/contacts/custom-variable-keys" },
  { action: "people.contacts.duplicates.get", method: "GET", endpoint: "/api/portal/people/contacts/duplicates" },
  { action: "people.contacts.merge", method: "POST", endpoint: "/api/portal/people/contacts/merge" },
  { action: "people.contacts.custom_variables.patch", method: "PATCH", endpoint: "/api/portal/people/contacts/[contactId]/custom-variables" },

  { action: "contact_tags.list", method: "GET", endpoint: "/api/portal/contact-tags" },
  { action: "contact_tags.create", method: "POST", endpoint: "/api/portal/contact-tags" },
  { action: "contact_tags.update", method: "PATCH", endpoint: "/api/portal/contact-tags/[tagId]" },
  { action: "contact_tags.delete", method: "DELETE", endpoint: "/api/portal/contact-tags/[tagId]" },

  { action: "me.get", method: "GET", endpoint: "/api/portal/me" },

  { action: "auth.resend_verification", method: "POST", endpoint: "/api/portal/auth/resend-verification" },

  { action: "engagement.ping", method: "POST", endpoint: "/api/portal/engagement/ping" },
  { action: "engagement.active_time", method: "POST", endpoint: "/api/portal/engagement/active-time" },

  { action: "push.register", method: "POST", endpoint: "/api/portal/push/register" },

  { action: "profile.get", method: "GET", endpoint: "/api/portal/profile" },

  { action: "notifications.recipients.list", method: "GET", endpoint: "/api/portal/notifications/recipients" },

  { action: "voice_agent.tools.get", method: "GET", endpoint: "/api/portal/voice-agent/tools" },
  { action: "voice_agent.voices.list", method: "GET", endpoint: "/api/portal/voice-agent/voices" },
  { action: "voice_agent.voices.preview", method: "POST", endpoint: "/api/portal/voice-agent/voices/preview" },

  { action: "ai_agents.list", method: "GET", endpoint: "/api/portal/ai-agents" },

  { action: "ai_chat.threads.list", method: "GET", endpoint: "/api/portal/ai-chat/threads" },
  { action: "ai_chat.threads.create", method: "POST", endpoint: "/api/portal/ai-chat/threads" },
  { action: "ai_chat.threads.flush", method: "POST", endpoint: "/api/portal/ai-chat/threads/[threadId]/flush" },
  { action: "ai_chat.messages.list", method: "GET", endpoint: "/api/portal/ai-chat/threads/[threadId]/messages" },
  { action: "ai_chat.messages.send", method: "POST", endpoint: "/api/portal/ai-chat/threads/[threadId]/messages" },
  { action: "ai_chat.attachments.upload", method: "POST", endpoint: "/api/portal/ai-chat/attachments" },
  { action: "ai_chat.actions.execute", method: "POST", endpoint: "/api/portal/ai-chat/actions/execute" },
  { action: "ai_chat.cron.run", method: "GET", endpoint: "/api/portal/ai-chat/cron" },
  { action: "ai_chat.scheduled.list", method: "GET", endpoint: "/api/portal/ai-chat/scheduled" },
  { action: "ai_chat.scheduled.update", method: "PATCH", endpoint: "/api/portal/ai-chat/scheduled/[messageId]" },
  { action: "ai_chat.scheduled.delete", method: "DELETE", endpoint: "/api/portal/ai-chat/scheduled/[messageId]" },

  { action: "webhooks.get", method: "GET", endpoint: "/api/portal/webhooks" },
  { action: "support_chat.send", method: "POST", endpoint: "/api/portal/support-chat" },

  { action: "bug_report.submit", method: "POST", endpoint: "/api/portal/bug-report" },

  { action: "integrations.twilio.get", method: "GET", endpoint: "/api/portal/integrations/twilio" },
  { action: "integrations.stripe.get", method: "GET", endpoint: "/api/portal/integrations/stripe" },
  { action: "integrations.stripe.delete", method: "DELETE", endpoint: "/api/portal/integrations/stripe" },
  { action: "integrations.sales_reporting.get", method: "GET", endpoint: "/api/portal/integrations/sales-reporting" },
  { action: "integrations.sales_reporting.disconnect", method: "DELETE", endpoint: "/api/portal/integrations/sales-reporting" },

  { action: "follow_up.settings.get", method: "GET", endpoint: "/api/portal/follow-up/settings" },
  { action: "follow_up.settings.update", method: "PUT", endpoint: "/api/portal/follow-up/settings" },
  { action: "follow_up.custom_variables.get", method: "GET", endpoint: "/api/portal/follow-up/custom-variables" },
  { action: "follow_up.custom_variables.update", method: "PUT", endpoint: "/api/portal/follow-up/custom-variables" },
  { action: "follow_up.ai.generate_step", method: "POST", endpoint: "/api/portal/follow-up/ai/generate-step" },
  { action: "follow_up.test_send", method: "POST", endpoint: "/api/portal/follow-up/test-send" },

  { action: "automations.run", method: "POST", endpoint: "/api/portal/automations/run" },

  { action: "automations.settings.get", method: "GET", endpoint: "/api/portal/automations/settings" },
  { action: "automations.settings.update", method: "PUT", endpoint: "/api/portal/automations/settings" },
  { action: "automations.test_sms", method: "POST", endpoint: "/api/portal/automations/test-sms" },

  { action: "services.catalog.get", method: "GET", endpoint: "/api/portal/services/catalog" },
  { action: "services.lifecycle.update", method: "POST", endpoint: "/api/portal/services/lifecycle" },
  { action: "services.status.get", method: "GET", endpoint: "/api/portal/services/status" },

  { action: "referrals.link.get", method: "GET", endpoint: "/api/portal/referrals/link" },
  { action: "referrals.link.rotate", method: "POST", endpoint: "/api/portal/referrals/link" },

  { action: "mailbox.get", method: "GET", endpoint: "/api/portal/mailbox" },
  { action: "mailbox.update", method: "PUT", endpoint: "/api/portal/mailbox" },

  { action: "missed_call_textback.settings.get", method: "GET", endpoint: "/api/portal/missed-call-textback/settings" },
  { action: "missed_call_textback.settings.update", method: "PUT", endpoint: "/api/portal/missed-call-textback/settings" },

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

  { action: "media.folders.list", method: "GET", endpoint: "/api/portal/media/folders" },
  { action: "media.folder.ensure", method: "POST", endpoint: "/api/portal/media/folders" },
  { action: "media.folders.update", method: "PATCH", endpoint: "/api/portal/media/folders/[id]" },
  { action: "media.items.list", method: "GET", endpoint: "/api/portal/media/items" },
  { action: "media.items.move", method: "POST", endpoint: "/api/portal/media/items" },
  { action: "media.items.update", method: "PATCH", endpoint: "/api/portal/media/items/[id]" },
  { action: "media.items.delete", method: "DELETE", endpoint: "/api/portal/media/items/[id]" },
  { action: "media.items.create_from_blob", method: "POST", endpoint: "/api/portal/media/items/from-blob" },
  { action: "media.import_remote_image", method: "POST", endpoint: "/api/portal/media/import-remote" },
  { action: "media.list.get", method: "GET", endpoint: "/api/portal/media/list" },
  { action: "media.stats.get", method: "GET", endpoint: "/api/portal/media/stats" },

  { action: "dashboard.get", method: "GET", endpoint: "/api/portal/dashboard" },

  // Route uses a single PUT endpoint with body.action controlling behavior.
  { action: "dashboard.save", method: "PUT", endpoint: "/api/portal/dashboard" },
  { action: "dashboard.add_widget", method: "PUT", endpoint: "/api/portal/dashboard" },
  { action: "dashboard.remove_widget", method: "PUT", endpoint: "/api/portal/dashboard" },
  { action: "dashboard.reset", method: "PUT", endpoint: "/api/portal/dashboard" },

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

  // AI Outbound Calls (safe CRUD + reporting)
  { action: "ai_outbound_calls.campaigns.list", method: "GET", endpoint: "/api/portal/ai-outbound-calls/campaigns" },
  { action: "ai_outbound_calls.campaigns.create", method: "POST", endpoint: "/api/portal/ai-outbound-calls/campaigns" },
  { action: "ai_outbound_calls.campaigns.update", method: "PATCH", endpoint: "/api/portal/ai-outbound-calls/campaigns/[campaignId]" },
  { action: "ai_outbound_calls.campaigns.activity.get", method: "GET", endpoint: "/api/portal/ai-outbound-calls/campaigns/[campaignId]/activity" },
  { action: "ai_outbound_calls.campaigns.messages_activity.get", method: "GET", endpoint: "/api/portal/ai-outbound-calls/campaigns/[campaignId]/messages-activity" },
  { action: "ai_outbound_calls.contacts.search", method: "GET", endpoint: "/api/portal/ai-outbound-calls/contacts/search" },
  { action: "ai_outbound_calls.manual_calls.list", method: "GET", endpoint: "/api/portal/ai-outbound-calls/manual-calls" },
  { action: "ai_outbound_calls.manual_calls.get", method: "GET", endpoint: "/api/portal/ai-outbound-calls/manual-calls/[id]" },

  // Blogs (safe settings + CRUD)
  { action: "blogs.appearance.get", method: "GET", endpoint: "/api/portal/blogs/appearance" },
  { action: "blogs.appearance.update", method: "PUT", endpoint: "/api/portal/blogs/appearance" },
  { action: "blogs.site.get", method: "GET", endpoint: "/api/portal/blogs/site" },
  { action: "blogs.site.create", method: "POST", endpoint: "/api/portal/blogs/site" },
  { action: "blogs.site.update", method: "PUT", endpoint: "/api/portal/blogs/site" },
  { action: "blogs.usage.get", method: "GET", endpoint: "/api/portal/blogs/usage" },
  { action: "blogs.posts.list", method: "GET", endpoint: "/api/portal/blogs/posts" },
  { action: "blogs.posts.create", method: "POST", endpoint: "/api/portal/blogs/posts" },
  { action: "blogs.posts.get", method: "GET", endpoint: "/api/portal/blogs/posts/[postId]" },
  { action: "blogs.posts.update", method: "PUT", endpoint: "/api/portal/blogs/posts/[postId]" },
  { action: "blogs.posts.delete", method: "DELETE", endpoint: "/api/portal/blogs/posts/[postId]" },
  { action: "blogs.posts.archive", method: "POST", endpoint: "/api/portal/blogs/posts/[postId]/archive" },
  { action: "blogs.posts.export_markdown", method: "GET", endpoint: "/api/portal/blogs/posts/[postId]/export" },
  { action: "blogs.automation.settings.get", method: "GET", endpoint: "/api/portal/blogs/automation/settings" },
  { action: "blogs.automation.settings.update", method: "PUT", endpoint: "/api/portal/blogs/automation/settings" },
  { action: "blogs.generate_now", method: "POST", endpoint: "/api/portal/blogs/automation/generate-now" },
  { action: "blogs.posts.generate_draft", method: "POST", endpoint: "/api/portal/blogs/posts/[postId]/generate" },
  { action: "blogs.posts.publish", method: "POST", endpoint: "/api/portal/blogs/posts/[postId]/publish" },
  { action: "blogs.site.verify", method: "POST", endpoint: "/api/portal/blogs/site/verify" },

  // Newsletter (safe settings + CRUD)
  { action: "newsletter.site.get", method: "GET", endpoint: "/api/portal/newsletter/site" },
  { action: "newsletter.site.update", method: "POST", endpoint: "/api/portal/newsletter/site" },
  { action: "newsletter.usage.get", method: "GET", endpoint: "/api/portal/newsletter/usage" },
  { action: "newsletter.royalty_free_images.search", method: "GET", endpoint: "/api/portal/newsletter/royalty-free-images" },
  { action: "newsletter.newsletters.list", method: "GET", endpoint: "/api/portal/newsletter/newsletters" },
  { action: "newsletter.newsletters.create", method: "POST", endpoint: "/api/portal/newsletter/newsletters" },
  { action: "newsletter.newsletters.get", method: "GET", endpoint: "/api/portal/newsletter/newsletters/[newsletterId]" },
  { action: "newsletter.newsletters.update", method: "PUT", endpoint: "/api/portal/newsletter/newsletters/[newsletterId]" },
  { action: "newsletter.audience.contacts.search", method: "GET", endpoint: "/api/portal/newsletter/audience/contacts" },
  { action: "newsletter.royalty_free_images.suggest", method: "POST", endpoint: "/api/portal/newsletter/royalty-free-images/suggest" },
  { action: "newsletter.automation.settings.get", method: "GET", endpoint: "/api/portal/newsletter/automation/settings" },
  { action: "newsletter.automation.settings.update", method: "PUT", endpoint: "/api/portal/newsletter/automation/settings" },
  { action: "newsletter.generate_now", method: "POST", endpoint: "/api/portal/newsletter/automation/generate-now" },

  // Billing (safe reads)
  { action: "billing.summary.get", method: "GET", endpoint: "/api/portal/billing/summary" },
  { action: "billing.subscriptions.list", method: "GET", endpoint: "/api/portal/billing/subscriptions" },
  { action: "billing.info.get", method: "GET", endpoint: "/api/portal/billing/billing-info" },
  { action: "pricing.get", method: "GET", endpoint: "/api/portal/pricing" },

  // Credits (billing-gated)
  { action: "credits.get", method: "GET", endpoint: "/api/portal/credits" },
  { action: "credits.auto_topup.set", method: "PUT", endpoint: "/api/portal/credits" },

  // Reporting (safe reads)
  { action: "reporting.summary.get", method: "GET", endpoint: "/api/portal/reporting" },
  { action: "reporting.sales.get", method: "GET", endpoint: "/api/portal/reporting/sales" },
  { action: "reporting.stripe.get", method: "GET", endpoint: "/api/portal/reporting/stripe" },

  // Credit Reports (safe reads)
  { action: "credit.contacts.list", method: "GET", endpoint: "/api/portal/credit/contacts" },
  { action: "credit.pulls.list", method: "GET", endpoint: "/api/portal/credit/credit-pulls" },
  { action: "credit.disputes.letters.list", method: "GET", endpoint: "/api/portal/credit/disputes" },
  { action: "credit.disputes.letter.get", method: "GET", endpoint: "/api/portal/credit/disputes/[letterId]" },
  { action: "credit.reports.list", method: "GET", endpoint: "/api/portal/credit/reports" },
  { action: "credit.reports.get", method: "GET", endpoint: "/api/portal/credit/reports/[reportId]" },

  // Inbox (safe reads)
  { action: "inbox.threads.list", method: "GET", endpoint: "/api/portal/inbox/threads" },
  { action: "inbox.thread.messages.list", method: "GET", endpoint: "/api/portal/inbox/threads/[threadId]/messages" },
  { action: "inbox.thread.contact.set", method: "POST", endpoint: "/api/portal/inbox/threads/[threadId]/contact" },
  { action: "inbox.scheduled.update", method: "PATCH", endpoint: "/api/portal/inbox/scheduled/[scheduledId]" },
  { action: "inbox.attachments.create_from_media", method: "POST", endpoint: "/api/portal/inbox/attachments/from-media" },
  { action: "inbox.attachments.delete", method: "DELETE", endpoint: "/api/portal/inbox/attachments/[id]" },
  { action: "inbox.settings.get", method: "GET", endpoint: "/api/portal/inbox/settings" },
  { action: "inbox.settings.update", method: "PUT", endpoint: "/api/portal/inbox/settings" },
  { action: "inbox.send", method: "POST", endpoint: "/api/portal/inbox/send" },

  // AI Receptionist (safe-ish reads / playback helpers)
  { action: "ai_receptionist.settings.get", method: "GET", endpoint: "/api/portal/ai-receptionist/settings" },
  { action: "ai_receptionist.recordings.get", method: "GET", endpoint: "/api/portal/ai-receptionist/recordings/[recordingSid]" },
  { action: "ai_receptionist.recordings.demo.get", method: "GET", endpoint: "/api/portal/ai-receptionist/recordings/demo/[id]" },
  { action: "ai_receptionist.demo_audio.get", method: "GET", endpoint: "/api/portal/ai-receptionist/demo-audio/[id]" },
  { action: "ai_receptionist.settings.generate", method: "POST", endpoint: "/api/portal/ai-receptionist/generate-settings" },
  { action: "ai_receptionist.sms_system_prompt.generate", method: "POST", endpoint: "/api/portal/ai-receptionist/generate-sms-system-prompt" },
  { action: "ai_receptionist.text.polish", method: "POST", endpoint: "/api/portal/ai-receptionist/polish" },
  { action: "ai_receptionist.sms_reply.preview", method: "POST", endpoint: "/api/portal/ai-receptionist/preview-sms-reply" },
  { action: "ai_receptionist.sms_knowledge_base.sync", method: "POST", endpoint: "/api/portal/ai-receptionist/sms-knowledge-base/sync" },
  { action: "ai_receptionist.voice_knowledge_base.sync", method: "POST", endpoint: "/api/portal/ai-receptionist/voice-knowledge-base/sync" },
  { action: "ai_receptionist.sms_knowledge_base.upload", method: "POST", endpoint: "/api/portal/ai-receptionist/sms-knowledge-base/upload" },
  { action: "ai_receptionist.voice_knowledge_base.upload", method: "POST", endpoint: "/api/portal/ai-receptionist/voice-knowledge-base/upload" },

  // Business Profile (safe-ish settings CRUD)
  { action: "business_profile.get", method: "GET", endpoint: "/api/portal/business-profile" },
  { action: "business_profile.update", method: "PUT", endpoint: "/api/portal/business-profile" },
  { action: "onboarding.status.get", method: "GET", endpoint: "/api/portal/onboarding/status" },
  { action: "suggested_setup.preview.get", method: "GET", endpoint: "/api/portal/suggested-setup/preview" },
  { action: "suggested_setup.apply", method: "POST", endpoint: "/api/portal/suggested-setup/apply" },

  // ElevenLabs ConvAI helpers (sensitive tokens/URLs; no deterministic execute-first)
  { action: "elevenlabs.convai.token.get", method: "POST", endpoint: "/api/portal/elevenlabs/convai/token" },
  { action: "elevenlabs.convai.signed_url.get", method: "POST", endpoint: "/api/portal/elevenlabs/convai/signed-url" },

  // Funnel Builder (non-AI CRUD parity)
  { action: "funnel_builder.settings.get", method: "GET", endpoint: "/api/portal/funnel-builder/settings" },
  { action: "funnel_builder.settings.update", method: "POST", endpoint: "/api/portal/funnel-builder/settings" },

  { action: "funnel_builder.domains.list", method: "GET", endpoint: "/api/portal/funnel-builder/domains" },
  { action: "funnel_builder.domains.create", method: "POST", endpoint: "/api/portal/funnel-builder/domains" },
  { action: "funnel_builder.domains.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/domains" },
  { action: "funnel_builder.domains.verify", method: "POST", endpoint: "/api/portal/funnel-builder/domains/[domainId]/verify" },

  { action: "funnel_builder.forms.list", method: "GET", endpoint: "/api/portal/funnel-builder/forms" },
  { action: "funnel_builder.forms.create", method: "POST", endpoint: "/api/portal/funnel-builder/forms" },
  { action: "funnel_builder.forms.get", method: "GET", endpoint: "/api/portal/funnel-builder/forms/[formId]" },
  { action: "funnel_builder.forms.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/forms/[formId]" },
  { action: "funnel_builder.forms.delete", method: "DELETE", endpoint: "/api/portal/funnel-builder/forms/[formId]" },
  { action: "funnel_builder.forms.submissions.list", method: "GET", endpoint: "/api/portal/funnel-builder/forms/[formId]/submissions" },
  { action: "funnel_builder.form_field_keys.get", method: "GET", endpoint: "/api/portal/funnel-builder/form-field-keys" },

  { action: "funnel_builder.funnels.list", method: "GET", endpoint: "/api/portal/funnel-builder/funnels" },
  { action: "funnel.create", method: "POST", endpoint: "/api/portal/funnel-builder/funnels" },
  { action: "funnel_builder.funnels.get", method: "GET", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]" },
  { action: "funnel_builder.funnels.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]" },
  { action: "funnel_builder.funnels.delete", method: "DELETE", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]" },

  { action: "funnel_builder.custom_code_block.generate", method: "POST", endpoint: "/api/portal/funnel-builder/custom-code-block/generate" },

  { action: "funnel_builder.pages.list", method: "GET", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages" },
  { action: "funnel_builder.pages.create", method: "POST", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages" },
  { action: "funnel_builder.pages.update", method: "PATCH", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]" },
  { action: "funnel_builder.pages.delete", method: "DELETE", endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]" },
  {
    action: "funnel_builder.pages.export_custom_html",
    method: "POST",
    endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/export-custom-html",
  },
  {
    action: "funnel_builder.pages.generate_html",
    method: "POST",
    endpoint: "/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html",
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
