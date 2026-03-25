import { z } from "zod";

export const PortalAgentActionKeySchema = z.enum([
  "tasks.create",
  "tasks.create_for_all",
  "tasks.list",
  "tasks.assignees.list",
  "funnel.create",

  "funnel_builder.settings.get",
  "funnel_builder.settings.update",
  "funnel_builder.domains.list",
  "funnel_builder.domains.create",
  "funnel_builder.domains.update",
  "funnel_builder.forms.list",
  "funnel_builder.forms.create",
  "funnel_builder.forms.get",
  "funnel_builder.forms.update",
  "funnel_builder.forms.delete",
  "funnel_builder.forms.submissions.list",
  "funnel_builder.form_field_keys.get",
  "funnel_builder.funnels.list",
  "funnel_builder.funnels.get",
  "funnel_builder.funnels.update",
  "funnel_builder.funnels.delete",
  "funnel_builder.pages.list",
  "funnel_builder.pages.create",
  "funnel_builder.pages.update",
  "funnel_builder.pages.delete",
  "funnel_builder.pages.export_custom_html",
  "funnel_builder.pages.global_header",
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
  "blogs.generate_now",
  "newsletter.site.get",
  "newsletter.site.update",
  "newsletter.usage.get",
  "newsletter.newsletters.list",
  "newsletter.newsletters.create",
  "newsletter.newsletters.get",
  "newsletter.newsletters.update",
  "newsletter.audience.contacts.search",
  "newsletter.automation.settings.get",
  "newsletter.automation.settings.update",
  "newsletter.generate_now",

  "billing.summary.get",
  "billing.subscriptions.list",
  "billing.info.get",
  "pricing.get",
  "credits.get",
  "credits.auto_topup.set",
  "credit.contacts.list",
  "credit.pulls.list",
  "credit.disputes.letters.list",
  "credit.disputes.letter.get",
  "credit.reports.list",
  "credit.reports.get",
  "automations.run",
  "automations.create",
  "contacts.list",
  "contacts.create",
  "onboarding.status.get",

  "ai_agents.list",

  "me.get",

  "profile.get",

  "integrations.twilio.get",

  "integrations.stripe.get",
  "integrations.sales_reporting.get",

  "follow_up.settings.get",
  "follow_up.custom_variables.get",

  "notifications.recipients.list",

  "voice_agent.tools.get",
  "voice_agent.voices.list",

  "webhooks.get",
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
  "inbox.threads.list",
  "inbox.thread.messages.list",
  "inbox.settings.get",
  "inbox.settings.update",
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
  "media.folder.ensure",
  "media.items.move",
  "media.import_remote_image",
  "media.list.get",
  "media.stats.get",

  "dashboard.get",
  "dashboard.reset",
  "dashboard.add_widget",
  "dashboard.remove_widget",
  "dashboard.optimize",
  "booking.calendar.create",
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

  "ai_outbound_calls.campaigns.list",
  "ai_outbound_calls.campaigns.create",
  "ai_outbound_calls.campaigns.update",
  "ai_outbound_calls.campaigns.activity.get",
  "ai_outbound_calls.campaigns.messages_activity.get",
  "ai_outbound_calls.contacts.search",
  "ai_outbound_calls.manual_calls.list",
  "ai_outbound_calls.manual_calls.get",

  "ai_receptionist.settings.get",
  "ai_receptionist.recordings.get",
  "ai_receptionist.recordings.demo.get",
  "ai_receptionist.demo_audio.get",

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
      dueAtIso: z.string().trim().optional().nullable(),
    })
    .strict(),

  "tasks.create_for_all": z
    .object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(5000).optional(),
      dueAtIso: z.string().trim().optional().nullable(),
    })
    .strict(),

  "tasks.list": z
    .object({
      status: z.enum(["OPEN", "DONE", "CANCELED", "ALL"]).optional().nullable(),
      assigned: z.enum(["all", "me"]).optional().nullable(),
      limit: z.number().int().min(1).max(500).optional().nullable(),
    })
    .strict(),

  "tasks.assignees.list": z.object({}).strict(),

  "notifications.recipients.list": z.object({}).strict(),

  "voice_agent.tools.get": z.object({}).strict(),
  "voice_agent.voices.list": z.object({}).strict(),

  "funnel.create": z
    .object({
      name: z.string().trim().min(1).max(120),
      slug: z.string().trim().min(2).max(60),
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
    .object({
      funnelId: z.string().trim().min(1).max(120),
      pageId: z.string().trim().min(1).max(120),
      title: z.string().trim().max(200).optional(),
      contentMarkdown: z.string().optional(),
      sortOrder: z.number().finite().optional(),
      editorMode: z.enum(["MARKDOWN", "BLOCKS", "CUSTOM_HTML"]).optional(),
      customHtml: z.string().optional(),
      blocksJson: z.unknown().optional(),
      customChatJson: z.unknown().optional(),
      slug: z.string().trim().max(64).optional(),
      seo: z.unknown().optional().nullable(),
    })
    .strict(),

  "funnel_builder.pages.delete": z
    .object({
      funnelId: z.string().trim().min(1).max(120),
      pageId: z.string().trim().min(1).max(120),
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

  "blogs.appearance.get": z.object({}).strict(),

  "blogs.appearance.update": z
    .object({
      useBrandFont: z.boolean().optional(),
      titleFontKey: z.string().trim().max(40).optional(),
      bodyFontKey: z.string().trim().max(40).optional(),
    })
    .strict(),

  "blogs.site.get": z.object({}).strict(),

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
    .strict(),

  "blogs.posts.list": z
    .object({
      take: z.number().int().min(1).max(200).optional(),
      includeArchived: z.boolean().optional(),
    })
    .strict(),

  "blogs.posts.create": z
    .object({
      title: z.string().trim().max(180).optional(),
    })
    .strict(),

  "blogs.posts.get": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .strict(),

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
    .strict(),

  "blogs.posts.delete": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "blogs.posts.archive": z
    .object({
      postId: z.string().trim().min(1).max(120),
      archived: z.boolean(),
    })
    .strict(),

  "blogs.posts.export_markdown": z
    .object({
      postId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "blogs.automation.settings.get": z.object({}).strict(),

  "blogs.automation.settings.update": z
    .object({
      enabled: z.boolean(),
      frequencyDays: z.number().int().min(1).max(30),
      topics: z.array(z.string().trim().min(1).max(200)).max(50),
      autoPublish: z.boolean().optional(),
    })
    .strict(),

  "blogs.generate_now": z.object({}).strict(),

  "newsletter.site.get": z.object({}).strict(),

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
    .strict(),

  "newsletter.newsletters.list": z
    .object({
      kind: z.enum(["external", "internal"]).optional(),
      take: z.number().int().min(1).max(200).optional(),
    })
    .strict(),

  "newsletter.newsletters.create": z
    .object({
      kind: z.enum(["external", "internal"]),
      status: z.enum(["DRAFT", "READY"]).optional(),
      title: z.string().trim().min(1).max(180),
      excerpt: z.string().trim().max(6000),
      content: z.string().trim().max(200000),
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
    .strict(),

  "newsletter.newsletters.get": z
    .object({
      newsletterId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "newsletter.newsletters.update": z
    .object({
      newsletterId: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(180),
      excerpt: z.string().trim().max(6000),
      content: z.string().trim().max(200000),
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
    .strict(),

  "newsletter.audience.contacts.search": z
    .object({
      q: z.string().trim().max(120).optional(),
      ids: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
      take: z.number().int().min(1).max(200).optional(),
    })
    .strict(),

  "newsletter.automation.settings.get": z
    .object({
      kind: z.enum(["external", "internal"]).optional(),
    })
    .strict(),

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
    .strict(),

  "newsletter.generate_now": z
    .object({
      kind: z.enum(["external", "internal"]),
    })
    .strict(),

  "billing.summary.get": z.object({}).strict(),

  "billing.subscriptions.list": z.object({}).strict(),

  "billing.info.get": z.object({}).strict(),

  "pricing.get": z.object({}).strict(),

  "credits.get": z.object({}).strict(),

  "credits.auto_topup.set": z
    .object({
      autoTopUp: z.boolean(),
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

  "credit.reports.list": z.object({}).strict(),

  "credit.reports.get": z
    .object({
      reportId: z.string().trim().min(1).max(120),
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
    .strict(),

  "automations.create": z
    .object({
      name: z.string().trim().min(1).max(80),
    })
    .strict(),

  "contacts.list": z
    .object({
      limit: z.number().int().min(1).max(100).optional(),
    })
    .strict(),

  "contacts.create": z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().max(120).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      tags: z.union([z.array(z.string().trim().min(1).max(60)).max(10), z.string().trim().max(600)]).optional().nullable(),
      customVariables: z.record(z.string().trim().max(60), z.string().trim().max(120)).optional().nullable(),
    })
    .strict(),

  "onboarding.status.get": z.object({}).strict(),

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

  "profile.get": z.object({}).strict(),

  "integrations.twilio.get": z
    .object({
      includeDiagnostics: z.boolean().optional().nullable(),
    })
    .strict(),

  "integrations.stripe.get": z.object({}).strict(),

  "integrations.sales_reporting.get": z.object({}).strict(),

  "follow_up.settings.get": z.object({}).strict(),

  "follow_up.custom_variables.get": z.object({}).strict(),

  "webhooks.get": z.object({}).strict(),

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

  "services.catalog.get": z.object({}).strict(),

  "services.status.get": z.object({}).strict(),

  "services.lifecycle.update": z
    .object({
      serviceSlug: z.string().trim().min(1).max(80),
      action: z.enum(["pause", "cancel", "resume"]),
    })
    .strict(),

  "mailbox.get": z.object({}).strict(),

  "mailbox.update": z
    .object({
      localPart: z.string().trim().min(2).max(48),
    })
    .strict(),

  "missed_call_textback.settings.get": z.object({}).strict(),

  "missed_call_textback.settings.update": z
    .object({
      settings: z.unknown().optional(),
      regenerateToken: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.regenerateToken === true || v.settings !== undefined, { message: "Missing settings" }),

  "people.users.list": z.object({}).strict(),

  "people.users.invite": z
    .object({
      email: z.string().trim().email().max(200),
      role: z.enum(["ADMIN", "MEMBER"]).optional().nullable(),
      permissions: z.unknown().optional(),
    })
    .strict(),

  "people.users.update": z
    .object({
      userId: z.string().trim().min(1).max(120),
      role: z.enum(["ADMIN", "MEMBER"]).optional().nullable(),
      permissions: z.unknown().optional(),
    })
    .strict(),

  "people.users.delete": z
    .object({
      userId: z.string().trim().min(1).max(120),
    })
    .strict(),

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
      channel: z.enum(["EMAIL", "SMS"]).optional().nullable(),
      take: z.number().int().min(1).max(200).optional().nullable(),
    })
    .strict(),

  "inbox.thread.messages.list": z
    .object({
      threadId: z.string().trim().min(1).max(120),
      take: z.number().int().min(10).max(500).optional().nullable(),
    })
    .strict(),

  "inbox.settings.get": z.object({}).strict(),

  "inbox.settings.update": z
    .object({
      regenerateToken: z.boolean().optional(),
    })
    .strict(),

  "inbox.send_sms": z
    .object({
      to: z.string().trim().min(3).max(64),
      body: z.string().trim().min(1).max(900),
      threadId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),

  "inbox.send_email": z
    .object({
      to: z.string().trim().min(3).max(200),
      subject: z.string().trim().min(1).max(140),
      body: z.string().trim().min(1).max(20000),
      threadId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),

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
    })
    .strict(),

  "reviews.archive": z
    .object({
      reviewId: z.string().trim().min(1).max(120),
      archived: z.boolean(),
    })
    .strict(),

  "reviews.bookings.list": z.object({}).strict(),

  "reviews.contacts.search": z
    .object({
      q: z.string().trim().max(200).optional().nullable(),
      take: z.number().int().min(1).max(50).optional().nullable(),
    })
    .strict(),

  "reviews.events.list": z
    .object({
      limit: z.number().int().min(1).max(200).optional().nullable(),
    })
    .strict(),

  "reviews.handle.get": z.object({}).strict(),

  "reviews.questions.list": z.object({}).strict(),

  "reviews.questions.answer": z
    .object({
      id: z.string().trim().min(1).max(120),
      answer: z.string().max(2000).optional().nullable(),
    })
    .strict(),

  "media.folder.ensure": z
    .object({
      name: z.string().trim().min(1).max(120),
      parentId: z.string().trim().min(1).optional().nullable(),
      color: z.string().trim().min(1).max(32).optional().nullable(),
    })
    .strict(),

  "media.items.move": z
    .object({
      itemIds: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
      folderId: z.string().trim().min(1).optional().nullable(),
      folderName: z.string().trim().min(1).max(120).optional().nullable(),
      parentId: z.string().trim().min(1).optional().nullable(),
    })
    .strict(),

  "media.import_remote_image": z
    .object({
      url: z.string().trim().url().max(500),
      fileName: z.string().trim().max(240).optional().nullable(),
      folderId: z.string().trim().min(1).optional().nullable(),
      folderName: z.string().trim().min(1).max(120).optional().nullable(),
      parentId: z.string().trim().min(1).optional().nullable(),
    })
    .strict(),

  "media.list.get": z
    .object({
      folderId: z.string().trim().min(1).max(80).optional().nullable(),
    })
    .strict(),

  "media.stats.get": z.object({}).strict(),

  "dashboard.get": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
    })
    .strict(),

  "dashboard.reset": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
    })
    .strict(),

  "dashboard.add_widget": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      widgetId: z.string().trim().min(1).max(80),
    })
    .strict(),

  "dashboard.remove_widget": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      widgetId: z.string().trim().min(1).max(80),
    })
    .strict(),

  "dashboard.optimize": z
    .object({
      scope: z.enum(["default", "embedded"]).optional().nullable(),
      niche: z.string().trim().min(1).max(120).optional().nullable(),
    })
    .strict(),

  "booking.calendar.create": z
    .object({
      title: z.string().trim().min(1).max(80),
      id: z.string().trim().min(2).max(60).optional(),
      description: z.string().trim().max(400).optional(),
      durationMinutes: z.number().int().min(10).max(180).optional(),
      meetingLocation: z.string().trim().max(120).optional(),
      meetingDetails: z.string().trim().max(600).optional(),
      notificationEmails: z.array(z.string().trim().min(3).max(200)).max(20).optional(),
    })
    .strict(),

  "booking.calendars.get": z
    .object({})
    .strict(),

  "booking.calendars.update": z
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
            .strict(),
        )
        .max(25),
    })
    .strict(),

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
    .object({})
    .strict(),

  "booking.settings.update": z
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
    .strict(),

  "booking.form.get": z
    .object({})
    .strict(),

  "booking.form.update": z
    .object({
      thankYouMessage: z.string().max(500).optional(),
      phone: z
        .object({
          enabled: z.boolean().optional(),
          required: z.boolean().optional(),
        })
        .optional(),
      notes: z
        .object({
          enabled: z.boolean().optional(),
          required: z.boolean().optional(),
        })
        .optional(),
      questions: z
        .array(
          z
            .object({
              id: z.string().trim().min(1).max(50),
              label: z.string().trim().min(1).max(120),
              required: z.boolean().optional(),
              kind: z.enum(["short", "long", "single_choice", "multiple_choice"]).optional(),
              options: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
            })
            .strict(),
        )
        .max(20)
        .optional(),
    })
    .strict(),

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
    })
    .strict(),

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

  "ai_outbound_calls.campaigns.list": z
    .object({
      lite: z.boolean().optional().nullable(),
    })
    .strict(),

  "ai_outbound_calls.campaigns.create": z
    .object({
      name: z.string().trim().min(1).max(80).optional().nullable(),
    })
    .strict(),

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
    .strict(),

  "ai_outbound_calls.campaigns.activity.get": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
    })
    .strict(),

  "ai_outbound_calls.campaigns.messages_activity.get": z
    .object({
      campaignId: z.string().trim().min(1).max(120),
      take: z.number().int().min(1).max(60).optional().nullable(),
    })
    .strict(),

  "ai_outbound_calls.contacts.search": z
    .object({
      q: z.string().trim().max(80).optional().nullable(),
      take: z.number().int().min(1).max(20).optional().nullable(),
    })
    .strict(),

  "ai_outbound_calls.manual_calls.list": z
    .object({
      campaignId: z.string().trim().max(120).optional().nullable(),
      reconcileTwilio: z.boolean().optional().nullable(),
    })
    .strict(),

  "ai_outbound_calls.manual_calls.get": z
    .object({
      id: z.string().trim().min(1).max(120),
      reconcileTwilio: z.boolean().optional().nullable(),
    })
    .strict(),

  "ai_receptionist.settings.get": z.object({}).strict(),

  "ai_receptionist.recordings.get": z
    .object({
      recordingSid: z.string().trim().min(1).max(64),
    })
    .strict(),

  "ai_receptionist.recordings.demo.get": z
    .object({
      id: z.string().trim().min(1).max(40),
    })
    .strict(),

  "ai_receptionist.demo_audio.get": z
    .object({
      id: z.string().trim().min(1).max(40),
    })
    .strict(),

  "ai_receptionist.settings.generate": z
    .object({
      context: z.string().trim().max(4000).optional().nullable(),
      mode: z.enum(["AI", "FORWARD"]).optional().nullable(),
      aiCanTransferToHuman: z.boolean().optional().nullable(),
      forwardToPhoneE164: z.string().trim().max(60).nullable().optional(),
    })
    .strict(),

  "ai_receptionist.sms_system_prompt.generate": z
    .object({
      context: z.string().trim().max(4000).optional().nullable(),
    })
    .strict(),

  "ai_receptionist.text.polish": z
    .object({
      kind: z.enum(["systemPrompt", "greeting"]),
      channel: z.enum(["voice", "sms"]),
      text: z.string().trim().min(1).max(8000),
    })
    .strict(),

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
    .strict(),

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
    .strict(),

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
    .strict(),

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
    .strict(),

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
    .strict(),

  "business_profile.get": z.object({}).strict(),

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
    .strict(),

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
    .strict(),

  "reporting.sales.get": z
    .object({
      range: z.enum(["7d", "30d"]).optional().nullable(),
    })
    .strict(),

  "reporting.stripe.get": z
    .object({
      range: z.enum(["7d", "30d"]).optional().nullable(),
    })
    .strict(),
} as const;

export type PortalAgentActionArgs<K extends PortalAgentActionKey> = z.infer<(typeof PortalAgentActionArgsSchemaByKey)[K]>;

export type PortalAgentActionProposal = {
  key: PortalAgentActionKey;
  title: string;
  confirmLabel?: string;
  args: Record<string, unknown>;
};

export function portalAgentActionsIndexText(): string {
  return [
    "Available actions (choose at most 2):",
    "- tasks.create: Create a portal task (fields: title, description?, assignedToUserId?, dueAtIso?)",
    "- tasks.create_for_all: Create the same task for every team member (fields: title, description?, dueAtIso?)",
    "- tasks.list: List tasks (fields: status=OPEN|DONE|CANCELED|ALL?, assigned=all|me?, limit?)",
    "- tasks.assignees.list: List task assignees (team members)",
    "- funnel.create: Create a Funnel Builder funnel (fields: name, slug)",
    "- funnel_builder.settings.get: Get Funnel Builder settings",
    "- funnel_builder.settings.update: Update Funnel Builder settings (fields: notifyEmails?, webhookUrl?, regenerateSecret?)",
    "- funnel_builder.domains.list: List Funnel Builder custom domains",
    "- funnel_builder.domains.create: Add a Funnel Builder custom domain (fields: domain)",
    "- funnel_builder.domains.update: Update domain root behavior (fields: domain, rootMode?, rootFunnelSlug?)",
    "- funnel_builder.forms.list: List Funnel Builder forms",
    "- funnel_builder.forms.create: Create a Funnel Builder form (fields: slug, name?)",
    "- funnel_builder.forms.get: Get a Funnel Builder form (fields: formId)",
    "- funnel_builder.forms.update: Update a Funnel Builder form (fields: formId, name?, status?, slug?, schemaJson?)",
    "- funnel_builder.forms.delete: Delete a Funnel Builder form (fields: formId)",
    "- funnel_builder.forms.submissions.list: List form submissions (fields: formId, limit?, cursor?)",
    "- funnel_builder.form_field_keys.get: List unique form field keys across forms",
    "- funnel_builder.funnels.list: List funnels",
    "- funnel_builder.funnels.get: Get a funnel (fields: funnelId)",
    "- funnel_builder.funnels.update: Update a funnel (fields: funnelId, name?, status?, slug?, domain?, seo?)",
    "- funnel_builder.funnels.delete: Delete a funnel (fields: funnelId)",
    "- funnel_builder.pages.list: List pages for a funnel (fields: funnelId)",
    "- funnel_builder.pages.create: Create a page (fields: funnelId, slug, title?, contentMarkdown?, sortOrder?)",
    "- funnel_builder.pages.update: Update a page (fields: funnelId, pageId, title?, contentMarkdown?, sortOrder?, editorMode?, customHtml?, blocksJson?, customChatJson?, slug?, seo?)",
    "- funnel_builder.pages.delete: Delete a page (fields: funnelId, pageId)",
    "- funnel_builder.pages.export_custom_html: Generate and store custom HTML from blocks (fields: funnelId, pageId, blocksJson?, title?, setEditorMode?)",
    "- funnel_builder.pages.global_header: Apply/unset a global header block (fields: mode, funnelId, headerBlock OR keepOnPageId+localHeaderBlock)",
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
    "- newsletter.site.get: Get newsletter site settings",
    "- newsletter.site.update: Create/update newsletter site settings (fields: name, primaryDomain?, slug?)",
    "- newsletter.usage.get: Get newsletter usage stats (fields: range=7d|30d|90d|all?)",
    "- newsletter.newsletters.list: List newsletters (fields: kind=external|internal?, take?)",
    "- newsletter.newsletters.create: Create a newsletter (fields: kind, status?, title, excerpt, content, smsText?)",
    "- newsletter.newsletters.get: Get a newsletter (fields: newsletterId)",
    "- newsletter.newsletters.update: Update a newsletter (fields: newsletterId, title, excerpt, content, smsText?, hostedOnly?)",
    "- newsletter.audience.contacts.search: Search contacts for newsletter audience (fields: q? OR ids?, take?)",
    "- newsletter.automation.settings.get: Get newsletter automation settings (fields: kind=external|internal?)",
    "- newsletter.automation.settings.update: Update newsletter automation settings (fields: kind, enabled, frequencyDays, requireApproval?, channels?, topics?, promptAnswers?, deliveryEmailHint?, deliverySmsHint?, includeImages?, royaltyFreeImages?, includeImagesWhereNeeded?, fontKey?, audience?)",
    "- newsletter.generate_now: Generate a newsletter draft now (fields: kind=external|internal)",
    "- billing.summary.get: Get billing summary",
    "- billing.subscriptions.list: List active subscriptions",
    "- billing.info.get: Get billing profile info (customer + default payment method)",
    "- pricing.get: Get module and credits pricing (includes credit USD value)",
    "- credits.get: Get credits balance + auto-top-up state",
    "- credits.auto_topup.set: Enable/disable auto-top-up (fields: autoTopUp)",
    "- reporting.summary.get: Get reporting dashboard KPIs (fields: range=today|7d|30d|90d|all?)",
    "- reporting.sales.get: Get sales report (fields: range=7d|30d?)",
    "- reporting.stripe.get: Get Stripe charges report (fields: range=7d|30d?)",
    "- credit.contacts.list: List/search credit contacts (fields: q?)",
    "- credit.pulls.list: List credit pulls (fields: contactId?)",
    "- credit.disputes.letters.list: List credit dispute letters (fields: contactId?)",
    "- credit.disputes.letter.get: Get a credit dispute letter (fields: letterId)",
    "- credit.reports.list: List credit reports",
    "- credit.reports.get: Get a credit report (fields: reportId)",
    "- automations.run: Run an automation by id (fields: automationId, contact?)",
    "- automations.create: Create a new automation shell (fields: name)",
    "- contacts.list: List recent contacts (fields: limit?)",
    "- contacts.create: Create a contact (fields: name, email?, phone?, tags?, customVariables?)",
    "- onboarding.status.get: Get onboarding completion status (business profile + blogs setup)",
    "- ai_agents.list: List known ElevenLabs agent IDs referenced by your portal account (voice/chat/outbound)",
    "- contact_tags.list: List contact tags",
    "- contact_tags.create: Create a contact tag (fields: name, color?)",
    "- contact_tags.update: Update a contact tag (fields: tagId, name?, color?)",
    "- contact_tags.delete: Delete a contact tag (fields: tagId)",
    "- me.get: Get the current portal member identity (ownerId/memberId/role) and effective permissions",
    "- profile.get: Get the current portal member profile (name/email/phone/city/state + voice agent status)",
    "- integrations.twilio.get: Get Twilio SMS integration status + webhook URLs (fields: includeDiagnostics?)",
    "- integrations.stripe.get: Get Stripe integration status (secret key prefix + connected account)",
    "- integrations.sales_reporting.get: Get sales reporting integration status (active provider + configured providers)",
    "- follow_up.settings.get: Get Follow-Up automation settings and queue preview",
    "- follow_up.custom_variables.get: Get Follow-Up custom variables (available to lead scraping and follow-up)",
    "- notifications.recipients.list: List notification recipient contacts for the portal account",
    "- webhooks.get: Get canonical webhook URLs (Twilio inbound/status callback + legacy tokens)",
    "- support_chat.send: Ask the support chat assistant a question (fields: message, url?, meta?, context.recentMessages?)",
    "- voice_agent.tools.get: List voice agent tool IDs resolved from your ElevenLabs API key (call transfer, calendar booking, etc)",
    "- voice_agent.voices.list: List available ElevenLabs voices (requires voice agent API key)",
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
    "- people.contacts.custom_variable_keys.get: List existing contact custom variable keys",
    "- people.contacts.duplicates.get: List duplicate contact groups (fields: limitGroups?, summaryOnly?)",
    "- people.contacts.merge: Merge duplicate contacts (fields: primaryContactId, mergeContactIds, primaryEmail?)",
    "- people.contacts.custom_variables.patch: Set/remove a contact custom variable (fields: contactId, key, value?)",
    "- inbox.threads.list: List inbox threads (fields: channel=EMAIL|SMS?, take?)",
    "- inbox.thread.messages.list: Load messages for a thread (fields: threadId, take?)",
    "- inbox.settings.get: Get inbox settings (mailbox + webhook URLs)",
    "- inbox.settings.update: Regenerate inbox webhook token (fields: regenerateToken=true)",
    "- inbox.send_sms: Send an SMS (fields: to, body, threadId?)",
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
    "- media.folder.ensure: Ensure a Media Library folder exists (fields: name, parentId?, color?)",
    "- media.items.move: Move media items into a folder (fields: itemIds, folderId? OR folderName(+parentId?))",
    "- media.import_remote_image: Import an image from a URL into Media Library (fields: url, fileName?, folderId? OR folderName(+parentId?))",
    "- media.list.get: List Media Library folders/items for a folder (fields: folderId?)",
    "- media.stats.get: Get Media Library stats (items/folders counts)",
    "- dashboard.get: Get the portal dashboard data (fields: scope=default|embedded?)",
    "- dashboard.reset: Reset the portal dashboard layout (fields: scope=default|embedded?)",
    "- dashboard.add_widget: Add a dashboard widget (fields: scope?, widgetId)",
    "- dashboard.remove_widget: Remove a dashboard widget (fields: scope?, widgetId)",
    "- dashboard.optimize: Optimize dashboard widgets/layout for a niche (fields: scope?, niche?)",
    "- booking.calendar.create: Create a booking calendar config entry (fields: title, id?, description?, durationMinutes?, meetingLocation?, meetingDetails?, notificationEmails?)",
    "- booking.calendars.get: Get booking calendars config",
    "- booking.calendars.update: Update booking calendars config (fields: calendars[])",
    "- booking.bookings.list: List upcoming/recent bookings (fields: take?)",
    "- booking.cancel: Cancel a booking (fields: bookingId)",
    "- booking.reschedule: Reschedule a booking start time (fields: bookingId, startAtIso, forceAvailability?)",
    "- booking.contact: Contact a booking lead via email and/or SMS (fields: bookingId, message, subject?, sendEmail?, sendSms?)",

    "- booking.settings.get: Get booking settings",
    "- booking.settings.update: Update booking settings (fields: enabled?, title?, description?, durationMinutes?, timeZone?, slug?, meetingPlatform?, photoUrl?, meetingLocation?, meetingDetails?, appointmentPurpose?, toneDirection?, notificationEmails?)",
    "- booking.form.get: Get booking form config",
    "- booking.form.update: Update booking form config (fields: thankYouMessage?, phone?, notes?, questions?)",
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
    "- ai_receptionist.settings.get: Get AI receptionist settings and recent call events",
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
  ].join("\n");
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
