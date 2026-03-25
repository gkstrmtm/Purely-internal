import { z } from "zod";

export const PortalAgentActionKeySchema = z.enum([
  "tasks.create",
  "tasks.create_for_all",
  "funnel.create",
  "blogs.generate_now",
  "newsletter.generate_now",
  "automations.run",
  "automations.create",
  "contacts.list",
  "contacts.create",
  "inbox.send_sms",
  "inbox.send_email",
  "reviews.send_request_for_booking",
  "reviews.send_request_for_contact",
  "reviews.reply",
  "media.folder.ensure",
  "media.items.move",
  "media.import_remote_image",
  "dashboard.reset",
  "dashboard.add_widget",
  "dashboard.remove_widget",
  "dashboard.optimize",
  "booking.calendar.create",
  "booking.bookings.list",
  "booking.cancel",
  "booking.reschedule",
  "booking.contact",
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
    "- blogs.generate_now: Generate a blog draft now",
    "- newsletter.generate_now: Generate a newsletter draft now (fields: kind=external|internal)",
    "- automations.run: Run an automation by id (fields: automationId, contact?)",
    "- automations.create: Create a new automation shell (fields: name)",
    "- contacts.list: List recent contacts (fields: limit?)",
    "- contacts.create: Create a contact (fields: name, email?, phone?, tags?, customVariables?)",
    "- inbox.send_sms: Send an SMS (fields: to, body, threadId?)",
    "- inbox.send_email: Send an email (fields: to, subject, body, threadId?)",
    "- reviews.send_request_for_booking: Send a review request for a completed booking (fields: bookingId)",
    "- reviews.send_request_for_contact: Send a review request to a contact (fields: contactId)",
    "- reviews.reply: Reply to a review (fields: reviewId, reply?)",
    "- media.folder.ensure: Ensure a Media Library folder exists (fields: name, parentId?, color?)",
    "- media.items.move: Move media items into a folder (fields: itemIds, folderId? OR folderName(+parentId?))",
    "- media.import_remote_image: Import an image from a URL into Media Library (fields: url, fileName?, folderId? OR folderName(+parentId?))",
    "- dashboard.reset: Reset the portal dashboard layout (fields: scope=default|embedded?)",
    "- dashboard.add_widget: Add a dashboard widget (fields: scope?, widgetId)",
    "- dashboard.remove_widget: Remove a dashboard widget (fields: scope?, widgetId)",
    "- dashboard.optimize: Optimize dashboard widgets/layout for a niche (fields: scope?, niche?)",
    "- booking.calendar.create: Create a booking calendar config entry (fields: title, id?, description?, durationMinutes?, meetingLocation?, meetingDetails?, notificationEmails?)",
    "- booking.bookings.list: List upcoming/recent bookings (fields: take?)",
    "- booking.cancel: Cancel a booking (fields: bookingId)",
    "- booking.reschedule: Reschedule a booking start time (fields: bookingId, startAtIso, forceAvailability?)",
    "- booking.contact: Contact a booking lead via email and/or SMS (fields: bookingId, message, subject?, sendEmail?, sendSms?)",
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
