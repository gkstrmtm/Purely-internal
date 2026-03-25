import { z } from "zod";

export const PortalAgentActionKeySchema = z.enum([
  "tasks.create",
  "tasks.create_for_all",
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

  "blogs.generate_now",
  "newsletter.generate_now",
  "automations.run",
  "automations.create",
  "contacts.list",
  "contacts.create",

  "people.users.list",
  "people.users.invite",
  "people.users.update",
  "people.users.delete",
  "people.leads.update",
  "people.contacts.custom_variable_keys.get",
  "people.contacts.duplicates.get",
  "people.contacts.merge",
  "people.contacts.custom_variables.patch",
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

  "blogs.generate_now": z.object({}).strict(),

  "newsletter.generate_now": z
    .object({
      kind: z.enum(["external", "internal"]),
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
    "- blogs.generate_now: Generate a blog draft now",
    "- newsletter.generate_now: Generate a newsletter draft now (fields: kind=external|internal)",
    "- automations.run: Run an automation by id (fields: automationId, contact?)",
    "- automations.create: Create a new automation shell (fields: name)",
    "- contacts.list: List recent contacts (fields: limit?)",
    "- contacts.create: Create a contact (fields: name, email?, phone?, tags?, customVariables?)",
    "- people.users.list: List portal team members and invites",
    "- people.users.invite: Invite a team member (fields: email, role=ADMIN|MEMBER?, permissions?)",
    "- people.users.update: Update a team member role/permissions (fields: userId, role?, permissions?)",
    "- people.users.delete: Remove a team member (fields: userId)",
    "- people.leads.update: Update a lead (fields: leadId, businessName?, email?, phone?, website?, contactId?)",
    "- people.contacts.custom_variable_keys.get: List existing contact custom variable keys",
    "- people.contacts.duplicates.get: List duplicate contact groups (fields: limitGroups?, summaryOnly?)",
    "- people.contacts.merge: Merge duplicate contacts (fields: primaryContactId, mergeContactIds, primaryEmail?)",
    "- people.contacts.custom_variables.patch: Set/remove a contact custom variable (fields: contactId, key, value?)",
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
