import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import {
  PortalAgentActionKeySchema,
  extractJsonObject,
  portalAgentActionsIndexText,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { executePortalAgentActionForThread } from "@/lib/portalAgentActionExecutor";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AttachmentSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  url: z.string().trim().min(1).max(500),
});

const SendMessageSchema = z
  .object({
    text: z.string().trim().max(4000).optional(),
    url: z.string().trim().optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
  })
  .refine(
    (d) => Boolean((d.text || "").trim()) || (Array.isArray(d.attachments) && d.attachments.length > 0),
    { message: "Text or attachments required" },
  );

function cleanSuggestedTitle(raw: string): string {
  const s = String(raw || "").trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  // Keep it short and UI-friendly.
  return s.replace(/^"|"$/g, "").replace(/^'|'$/g, "").slice(0, 60).trim();
}

const ActionProposalSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            key: PortalAgentActionKeySchema,
            title: z.string().trim().min(1).max(80),
            confirmLabel: z.string().trim().max(40).optional(),
            args: z.record(z.string(), z.unknown()).default({}),
          })
          .strict(),
      )
      .max(2)
      .default([]),
  })
  .strict();

function shouldAutoExecuteFromUserText(text: string) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  if (!t) return false;

  // Avoid auto-executing on obvious questions.
  if (/\b(how|why|what|can you|could you|should i|help me|explain)\b/i.test(t)) return false;

  const verb = /\b(create|make|build|generate|run|start|trigger|send|text|sms|email|reply|respond|reset|optimize|add|remove|move|import|upload|activate|pause|enroll)\b/i.test(t);
  if (!verb) return false;

  return /\b(task|funnel|newsletter|blog|automation|calendar|booking|appointment|contacts?|people|review|reviews|text|sms|email|message|media|media library|folder|dashboard|reporting|nurture|campaign)\b/i.test(t);
}

function normalizePhoneLike(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  // Keep leading + if present, otherwise just digits.
  const cleaned = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D+/g, "")}` : digits.replace(/\D+/g, "");
  if (cleaned.replace(/\D+/g, "").length < 8) return null;
  return cleaned.slice(0, 20);
}

function detectDeterministicActionsFromText(opts: {
  text: string;
  attachments: Array<{ id?: string | null; fileName?: string; url?: string }>;
}): Array<{ key: PortalAgentActionKey; title: string; args: Record<string, unknown> }> {
  const t = String(opts.text || "").trim();
  const lower = t.toLowerCase();
  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (!t && !attachments.length) return [];

  const bookingIdFromText = () => {
    const m = /\bbooking\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bbookingId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const campaignIdFromText = () => {
    const m =
      /\bcampaign\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) ||
      /\bcampaignId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const stepIdFromText = () => {
    const m = /\bstep\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bstepId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const tagIdsFromText = () => {
    const m = /\btagIds\s*[:=]\s*([^\n]{1,600})/i.exec(t) || /\btags?\s*[:=]\s*([^\n]{1,600})/i.exec(t);
    const raw = m?.[1] ? String(m[1]).trim() : "";
    if (!raw) return [] as string[];
    const ids = raw
      .split(/[\s,;|]+/g)
      .map((x) => x.trim())
      .filter((x) => /^[a-zA-Z0-9_-]{6,120}$/.test(x))
      .slice(0, 100);
    return ids;
  };

  const startAtIsoFromText = () => {
    const m = /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)\b/.exec(t) || /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)\b/.exec(t);
    const raw = m?.[1] ? String(m[1]).trim() : "";
    if (!raw) return "";
    return raw.includes(" ") ? raw.replace(" ", "T") : raw;
  };

  // Booking: list bookings.
  if (/\b(list|show)\b[\s\S]{0,30}\b(bookings?|appointments?)\b/i.test(t)) {
    return [{ key: "booking.bookings.list", title: "List bookings", args: { take: 25 } }];
  }

  // Booking: get calendars config.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(calendars?)\b/i.test(t) && /\bbooking\b/i.test(t)) {
    return [{ key: "booking.calendars.get", title: "Get booking calendars", args: {} }];
  }

  // Booking: get booking settings.
  if (/\b(show|get)\b[\s\S]{0,30}\b(booking)\b[\s\S]{0,30}\b(settings?)\b/i.test(t)) {
    return [{ key: "booking.settings.get", title: "Get booking settings", args: {} }];
  }

  // Booking: get booking form.
  if (/\b(show|get)\b[\s\S]{0,30}\b(booking)\b[\s\S]{0,30}\b(form)\b/i.test(t)) {
    return [{ key: "booking.form.get", title: "Get booking form", args: {} }];
  }

  // Booking: get hosted site settings.
  if (/\b(show|get)\b[\s\S]{0,40}\b(booking)\b[\s\S]{0,40}\b(site|domain|hosted|public)\b/i.test(t)) {
    return [{ key: "booking.site.get", title: "Get booking public site", args: {} }];
  }

  // Booking: get reminder settings.
  if (/\b(show|get)\b[\s\S]{0,40}\b(reminders?|reminder)\b[\s\S]{0,40}\b(settings?)\b/i.test(t) && /\bbooking\b/i.test(t)) {
    return [{ key: "booking.reminders.settings.get", title: "Get booking reminder settings", args: {} }];
  }

  // Booking: suggest available slots.
  if (/\b(available|suggest|find|show)\b[\s\S]{0,40}\b(slots?|availability)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const startAtIso = startAtIsoFromText();
    const durMatch = /\b(\d{2,3})\s*(?:min|mins|minutes)\b/i.exec(t);
    const durationMinutes = durMatch?.[1] ? Math.max(10, Math.min(180, Number(durMatch[1]))) : undefined;
    const daysMatch = /\b(\d{1,2})\s*days\b/i.exec(t);
    const days = daysMatch?.[1] ? Math.max(1, Math.min(30, Number(daysMatch[1]))) : undefined;
    return [{
      key: "booking.suggestions.slots",
      title: "Suggest available booking slots",
      args: {
        ...(startAtIso ? { startAtIso } : {}),
        ...(typeof durationMinutes === "number" && Number.isFinite(durationMinutes) ? { durationMinutes } : {}),
        ...(typeof days === "number" && Number.isFinite(days) ? { days } : {}),
        limit: 25,
      },
    }];
  }

  // Reviews: get review request settings.
  if (/\b(show|get)\b[\s\S]{0,30}\b(reviews?|review requests?)\b[\s\S]{0,30}\b(settings?)\b/i.test(t)) {
    return [{ key: "reviews.settings.get", title: "Get review request settings", args: {} }];
  }

  // Reviews: get hosted reviews site config.
  if (/\b(show|get)\b[\s\S]{0,40}\b(reviews?)\b[\s\S]{0,40}\b(site|domain|hosted|public)\b/i.test(t)) {
    return [{ key: "reviews.site.get", title: "Get hosted reviews site", args: {} }];
  }

  // Reviews: list collected reviews.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b/i.test(t) && /\b(inbox|collected|received)\b/i.test(t)) {
    const includeArchived = /\barchived\b/i.test(t);
    return [{ key: "reviews.inbox.list", title: "List reviews", args: { includeArchived } }];
  }

  // Reviews: list review request events.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(events?)\b/i.test(t)) {
    return [{ key: "reviews.events.list", title: "List review request events", args: { limit: 50 } }];
  }

  // Reviews: get public handle.
  if (/\b(show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(handle|link)\b/i.test(t)) {
    return [{ key: "reviews.handle.get", title: "Get reviews page handle", args: {} }];
  }

  // Reviews: list Q&A questions.
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(questions?|q&a)\b/i.test(t)) {
    return [{ key: "reviews.questions.list", title: "List review questions", args: {} }];
  }

  // Reviews: list bookings (for sending review requests).
  if (/\b(list|show|get)\b[\s\S]{0,30}\b(reviews?)\b[\s\S]{0,30}\b(bookings?|appointments?)\b/i.test(t)) {
    return [{ key: "reviews.bookings.list", title: "List bookings for review requests", args: {} }];
  }

  // Nurture: list campaigns.
  if (/\b(list|show)\b[\s\S]{0,30}\b(nurture\s+campaigns?|campaigns?)\b/i.test(t) && /\bnurture\b/i.test(t)) {
    return [{ key: "nurture.campaigns.list", title: "List nurture campaigns", args: { take: 50 } }];
  }

  // Nurture: create a campaign.
  if (/\b(create|add|new)\b/i.test(t) && /\b(nurture\s+campaign|campaign)\b/i.test(t) && /\bnurture\b/i.test(t)) {
    const quotedName = /\bcampaign\b\s+"([^"\n]{1,80})"/i.exec(t) || /\bcampaign\b\s+'([^'\n]{1,80})'/i.exec(t);
    const name = quotedName?.[1] ? String(quotedName[1]).trim().slice(0, 80) : "";
    return [{ key: "nurture.campaigns.create", title: "Create nurture campaign", args: name ? { name } : {} }];
  }

  // Nurture: activate/pause/archive campaign (requires campaignId).
  if (/\b(nurture)\b/i.test(t) && /\bcampaign\b/i.test(t) && /\b(activate|pause|archive)\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    if (campaignId) {
      const status = /\bactivate\b/i.test(t) ? "ACTIVE" : /\bpause\b/i.test(t) ? "PAUSED" : "ARCHIVED";
      return [{
        key: "nurture.campaigns.update",
        title: `${status === "ACTIVE" ? "Activate" : status === "PAUSED" ? "Pause" : "Archive"} nurture campaign`,
        args: { campaignId, status },
      }];
    }
  }

  // Nurture: enroll contacts (requires campaignId + tagIds).
  if (/\b(enroll)\b/i.test(t) && /\b(nurture)\b/i.test(t) && /\bcampaign\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    const tagIds = tagIdsFromText();
    if (campaignId && tagIds.length) {
      const dryRun = /\bdry\s*run\b/i.test(t) || /\bpreview\b/i.test(t);
      return [{ key: "nurture.campaigns.enroll", title: "Enroll campaign audience", args: { campaignId, tagIds, ...(dryRun ? { dryRun: true } : {}) } }];
    }
  }

  // Nurture: add a step.
  if (/\b(add|create|new)\b/i.test(t) && /\b(step)\b/i.test(t) && /\b(nurture)\b/i.test(t) && /\bcampaign\b/i.test(t)) {
    const campaignId = campaignIdFromText();
    if (campaignId) {
      const kind = /\bemail\b/i.test(t) ? "EMAIL" : /\btag\b/i.test(t) ? "TAG" : "SMS";
      return [{ key: "nurture.campaigns.steps.add", title: "Add nurture step", args: { campaignId, kind } }];
    }
  }

  // Nurture: update a step (requires stepId and quoted body).
  if (/\b(update|edit)\b/i.test(t) && /\b(step)\b/i.test(t) && /\b(nurture)\b/i.test(t)) {
    const stepId = stepIdFromText();
    if (stepId) {
      const quoted = /"([\s\S]{1,8000})"/.exec(t);
      const body = String((quoted?.[1] || "").trim()).slice(0, 8000);
      const delayMatch = /\bdelay(?:Minutes)?\s*[:=]\s*(\d{1,6})\b/i.exec(t);
      const delayMinutes = delayMatch?.[1] ? Math.max(0, Math.min(525600, Number(delayMatch[1]))) : null;
      if (body) {
        return [{
          key: "nurture.steps.update",
          title: "Update nurture step",
          args: { stepId, body, ...(delayMinutes !== null && Number.isFinite(delayMinutes) ? { delayMinutes } : {}) },
        }];
      }
    }
  }

  // Nurture: delete a step.
  if (/\b(delete|remove)\b/i.test(t) && /\b(step)\b/i.test(t) && /\b(nurture)\b/i.test(t)) {
    const stepId = stepIdFromText();
    if (stepId) return [{ key: "nurture.steps.delete", title: "Delete nurture step", args: { stepId } }];
  }

  // Booking: cancel.
  if (/\b(cancel)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const bookingId = bookingIdFromText();
    if (bookingId) return [{ key: "booking.cancel", title: "Cancel booking", args: { bookingId } }];
  }

  // Booking: reschedule.
  if (/\b(reschedule)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const bookingId = bookingIdFromText();
    const startAtIso = startAtIsoFromText();
    if (bookingId && startAtIso) {
      const forceAvailability = /\b(force)\b[\s\S]{0,20}\bavailability\b/i.test(t);
      return [{
        key: "booking.reschedule",
        title: "Reschedule booking",
        args: { bookingId, startAtIso, ...(forceAvailability ? { forceAvailability: true } : {}) },
      }];
    }
  }

  // Booking: contact.
  if (/\b(contact|message|follow[- ]?up)\b/i.test(t) && /\b(booking|appointment)\b/i.test(t)) {
    const bookingId = bookingIdFromText();
    if (bookingId) {
      const sendEmail = /\b(email)\b/i.test(t);
      const sendSms = /\b(text|sms)\b/i.test(t);
      const quoted = /"([\s\S]{1,2000})"/.exec(t);
      const msg = String((quoted?.[1] || "").trim()).slice(0, 2000);
      if ((sendEmail || sendSms) && msg) {
        return [{
          key: "booking.contact",
          title: "Contact booking",
          args: {
            bookingId,
            message: msg,
            ...(sendEmail ? { sendEmail: true } : {}),
            ...(sendSms ? { sendSms: true } : {}),
          },
        }];
      }
    }
  }

  // People: create a contact when the user provides at least a name.
  if (/\b(create|add|new)\b/i.test(t) && /\bcontact\b/i.test(t)) {
    const emailMatch = /\b([A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{2,80}\.[A-Z]{2,})\b/i.exec(t);
    const email = emailMatch?.[1] ? String(emailMatch[1]).trim().slice(0, 120) : null;

    const phoneMatch = /(\+?\d[\d\s().-]{7,}\d)/.exec(t);
    const phone = phoneMatch ? normalizePhoneLike(phoneMatch[1]) : null;

    const tagsMatch = /\btags?\s*[:=]\s*([^\n]{1,600})/i.exec(t);
    const tags = tagsMatch?.[1] ? String(tagsMatch[1]).trim().slice(0, 600) : null;

    let name = "";
    const quotedName = /\bcontact\b\s+"([^"\n]{2,80})"/i.exec(t) || /\bcontact\b\s+'([^'\n]{2,80})'/i.exec(t);
    if (quotedName?.[1]) {
      name = String(quotedName[1]).trim().slice(0, 80);
    } else {
      const after = /\bcontact\b\s*(?:named|called)?\s*([^\n]{2,120})/i.exec(t);
      if (after?.[1]) {
        const candidate = String(after[1])
          .replace(/\b(tags?|email|phone)\b[\s\S]*$/i, "")
          .replace(/\b([A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{2,80}\.[A-Z]{2,})\b/i, "")
          .replace(/(\+?\d[\d\s().-]{7,}\d)/, "")
          .trim();
        name = candidate.slice(0, 80);
      }
    }

    if (name) {
      return [{
        key: "contacts.create",
        title: "Create contact",
        args: {
          name,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(tags ? { tags } : {}),
        },
      }];
    }
  }

  // Media Library: move the *current message attachments* into a folder.
  if (attachments.length && /\b(folder|media library|media)\b/i.test(t) && /\b(put|move|add|save|organize|file|files)\b/i.test(t)) {
    const folderMatch = /\b(?:into|to|in)\s+"?([^"\n]{1,120})"?\s+folder\b/i.exec(t) || /\bfolder\s+(?:named|called)?\s*"?([^"\n]{1,120})"?/i.exec(t);
    const folderName = (folderMatch?.[1] || "").trim().slice(0, 120);
    const itemIds = attachments
      .map((a) => (typeof a.id === "string" ? a.id.trim() : ""))
      .filter(Boolean)
      .slice(0, 20);
    if (folderName && itemIds.length) {
      return [{ key: "media.items.move", title: "Move attachments to folder", args: { itemIds, folderName } }];
    }
  }

  // Media Library: import a remote image URL.
  if (/\b(media library|media)\b/i.test(t) && /\b(import|add|save|upload)\b/i.test(t)) {
    const urlMatch = /(https?:\/\/[^\s)\]]{4,500})/i.exec(t);
    const url = urlMatch?.[1] ? String(urlMatch[1]).trim() : "";
    if (url) {
      const folderMatch = /\b(?:into|to|in)\s+"?([^"\n]{1,120})"?\s+folder\b/i.exec(t);
      const folderName = (folderMatch?.[1] || "").trim().slice(0, 120) || null;
      return [{ key: "media.import_remote_image", title: "Import image to Media Library", args: { url, ...(folderName ? { folderName } : {}) } }];
    }
  }

  // Dashboard: reset / optimize.
  if (/\b(dashboard|reporting)\b/i.test(t) && /\b(reset)\b/i.test(t)) {
    return [{ key: "dashboard.reset", title: "Reset dashboard", args: {} }];
  }
  if (/\b(dashboard|reporting)\b/i.test(t) && /\b(optimize|clean|simplify|improve)\b/i.test(t)) {
    const nicheMatch = /\bfor\s+([^\n]{2,120})/i.exec(t);
    const niche = (nicheMatch?.[1] || "").trim().slice(0, 120);
    return [{ key: "dashboard.optimize", title: "Optimize dashboard", args: niche ? { niche } : {} }];
  }

  // List contacts.
  if (/\b(list|show)\b[\s\S]{0,20}\bcontacts\b/i.test(t)) {
    return [{ key: "contacts.list", title: "List contacts", args: { limit: 20 } }];
  }

  // Reviews: send a review request (bookingId/contactId required).
  if (/\b(send|request)\b/i.test(t) && /\breview\b/i.test(t)) {
    const bookingIdMatch = /\bbooking\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bbookingId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    const contactIdMatch = /\bcontact\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\bcontactId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    const bookingId = bookingIdMatch?.[1] ? String(bookingIdMatch[1]).trim() : "";
    const contactId = contactIdMatch?.[1] ? String(contactIdMatch[1]).trim() : "";

    if (bookingId) {
      return [{ key: "reviews.send_request_for_booking", title: "Send review request", args: { bookingId } }];
    }
    if (contactId) {
      return [{ key: "reviews.send_request_for_contact", title: "Send review request", args: { contactId } }];
    }
  }

  // Reviews: reply (or clear reply) on a review.
  if (/\breview\b/i.test(t) && /\b(reply|respond)\b/i.test(t)) {
    const reviewIdMatch = /\breview\s*(?:id)?\s*[:#]?\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t) || /\breviewId\s*[:=]\s*([a-zA-Z0-9_-]{6,120})\b/i.exec(t);
    const reviewId = reviewIdMatch?.[1] ? String(reviewIdMatch[1]).trim() : "";
    if (reviewId) {
      const clear = /\b(clear|remove|delete)\b[\s\S]{0,20}\breply\b/i.test(t);
      if (clear) {
        return [{ key: "reviews.reply", title: "Clear review reply", args: { reviewId, reply: null } }];
      }

      const quoted = /"([\s\S]{1,2000})"/.exec(t);
      const replyMatch = /\breply\s*[:\-]\s*([\s\S]{1,2000})$/i.exec(t);
      const reply = String((quoted?.[1] || replyMatch?.[1] || "").trim()).slice(0, 2000);
      if (reply) {
        return [{ key: "reviews.reply", title: "Reply to review", args: { reviewId, reply } }];
      }
    }
  }

  // Build/create a funnel.
  if (/\b(build|create|make)\b[\s\S]{0,30}\bfunnel\b/i.test(t)) {
    const nameMatch = /\b(named|called)\s+"?([^"\n]{2,80})"?/i.exec(t);
    const name = (nameMatch?.[2] || "New funnel").trim().slice(0, 120);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "new-funnel";
    return [{ key: "funnel.create", title: "Create a funnel", args: { name, slug } }];
  }

  // Create a new automation.
  if (/\b(build|create|make)\b[\s\S]{0,30}\bautomation\b/i.test(t)) {
    const nameMatch = /\b(named|called)\s+"?([^"\n]{2,80})"?/i.exec(t);
    const name = (nameMatch?.[2] || "New automation").trim().slice(0, 80);
    return [{ key: "automations.create", title: "Create an automation", args: { name } }];
  }

  // Create tasks for every employee.
  if (/\b(task|tasks)\b/i.test(t) && /\b(every|all)\b/i.test(lower) && /\b(employee|team|member|everyone)\b/i.test(lower)) {
    const titleMatch = /\b(task|tasks)\b\s*(?:for|about)?\s*:?\s*"?([^"\n]{3,160})"?/i.exec(t);
    const title = (titleMatch?.[1] || "Team task").trim().slice(0, 160);
    return [{ key: "tasks.create_for_all", title: "Create tasks for the whole team", args: { title } }];
  }

  // Send a text/SMS when a phone number is provided.
  if (/\b(send|text)\b/i.test(lower) && /\b(text|sms)\b/i.test(lower)) {
    const phoneMatch = /(\+?\d[\d\s().-]{7,}\d)/.exec(t);
    const to = phoneMatch ? normalizePhoneLike(phoneMatch[1]) : null;
    const quoted = /"([\s\S]{1,900})"/.exec(t);
    const body = (quoted?.[1] || "").trim();

    if (to && body) {
      return [{ key: "inbox.send_sms", title: "Send a text", args: { to, body } }];
    }
  }

  return [];
}

export async function GET(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const { threadId } = await ctx.params;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const messages = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
      createdByUserId: true,
    },
  });

  return NextResponse.json({ ok: true, messages });
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const createdByUserId = auth.session.user.memberId || ownerId;
  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, title: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const now = new Date();

  const cleanText = (parsed.data.text || "").trim();
  const attachments = Array.isArray(parsed.data.attachments) ? parsed.data.attachments : [];
  const attachmentLines = attachments
    .map((a) => {
      const name = String(a.fileName || "Attachment").slice(0, 200);
      const url = String(a.url || "").slice(0, 500);
      return url ? `- ${name}: ${url}` : `- ${name}`;
    })
    .join("\n");

  const promptMessage = [
    cleanText || "Please review the attachments.",
    attachmentLines ? "\nAttachments:\n" + attachmentLines : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId,
      threadId,
      role: "user",
      text: cleanText,
      attachmentsJson: attachments.length ? attachments : null,
      createdByUserId,
      sendAt: null,
      sentAt: now,
    },
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
    },
  });

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: now },
  });

  if (!isPortalSupportChatConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI chat is not configured for this environment." },
      { status: 503 },
    );
  }

  // 1) Prefer deterministic action execution for common commands.
  const deterministicActions = detectDeterministicActionsFromText({ text: cleanText, attachments });
  if (deterministicActions.length) {
    const first = deterministicActions[0];
    const exec = await executePortalAgentActionForThread({
      ownerId,
      actorUserId: createdByUserId,
      threadId,
      action: first.key,
      args: first.args,
    });

    return NextResponse.json({
      ok: true,
      userMessage: userMsg,
      assistantMessage: exec.assistantMessage,
      assistantActions: [],
      autoActionMessage: exec.assistantMessage,
    });
  }

  const recentRows = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "desc" },
    take: 13,
    select: { id: true, role: true, text: true },
  });

  const recentMessages = recentRows
    .filter((m: any) => m.id !== userMsg.id)
    .reverse()
    .slice(-12)
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || "").slice(0, 2000),
    }));

  // 2) Best-effort: propose actions the agent can execute.
  let assistantActions: Array<{ key: string; title: string; confirmLabel?: string; args: Record<string, unknown> }> = [];
  try {
    const system = [
      "You are an automation agent inside a business portal.",
      "Your job is to propose up to 2 concrete next actions that can be executed via whitelisted portal actions.",
      "Assume the system CAN execute whitelisted actions. Never refuse with statements like 'I can't do that'.",
      "Only propose actions when you have enough information from the conversation to fill required fields.",
      "Never invent IDs (automationId, userId, etc). If missing, propose no actions.",
      "If an action needs a slug (like funnel.create), derive it deterministically from the provided name.",
      "Output JSON only, in this exact shape: {\"actions\":[{\"key\":...,\"title\":...,\"confirmLabel\":...,\"args\":{...}}]}",
      "Do not include markdown fences unless needed.",
      "\n" + portalAgentActionsIndexText(),
    ].join("\n");

    const user = [
      "User message:",
      promptMessage,
      "\nCurrent page URL (if any):",
      parsed.data.url || "",
      "\nJSON:",
    ].join("\n");

    const raw = await generateText({ system, user });
    const obj = extractJsonObject(raw);
    const parsedActions = ActionProposalSchema.safeParse(obj);
    if (parsedActions.success) {
      assistantActions = parsedActions.data.actions.map((a) => ({
        key: a.key,
        title: a.title,
        confirmLabel: a.confirmLabel,
        args: a.args ?? {},
      }));
    }
  } catch {
    // ignore
  }

  // 3) Auto-execute when the user is clearly asking to do something.
  let autoActionMessage: any = null;
  if (shouldAutoExecuteFromUserText(cleanText) && assistantActions.length) {
    const first = assistantActions[0];
    try {
      const exec = await executePortalAgentActionForThread({
        ownerId,
        actorUserId: createdByUserId,
        threadId,
        action: first.key as PortalAgentActionKey,
        args: first.args || {},
      });
      if (exec.assistantMessage) {
        autoActionMessage = exec.assistantMessage;
        assistantActions = [];
      }
    } catch {
      // ignore
    }
  }

  // 4) If we auto-executed, return the action result as the assistant message.
  if (autoActionMessage) {
    return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: autoActionMessage, assistantActions, autoActionMessage });
  }

  // 5) Fall back to support-style chat when no action was executed.
  const reply = await runPortalSupportChat({
    message: promptMessage,
    url: parsed.data.url,
    recentMessages,
  });

  const assistantMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId,
      threadId,
      role: "assistant",
      text: reply,
      attachmentsJson: null,
      createdByUserId: null,
      sendAt: null,
      sentAt: now,
    },
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
    },
  });

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });

  // AI-generated thread title (not just the first message).
  // Only do this for untouched threads.
  try {
    const isDefaultTitle = String(thread.title || "").trim() === "New chat";
    if (isDefaultTitle && isPortalSupportChatConfigured()) {
      const titleSystem = [
        "You name chat threads in a business automation portal.",
        "Return a short, helpful title (2-6 words).",
        "No quotes. No trailing punctuation.",
      ].join("\n");

      const titleUser = [
        "Conversation:",
        `User: ${promptMessage}`,
        `Assistant: ${reply}`,
        "\nTitle:",
      ].join("\n");

      const proposed = cleanSuggestedTitle(await generateText({ system: titleSystem, user: titleUser }));
      if (proposed && proposed.length >= 3 && proposed.toLowerCase() !== "new chat") {
        await (prisma as any).portalAiChatThread.update({
          where: { id: threadId },
          data: { title: proposed },
        });
      }
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, userMessage: userMsg, assistantMessage: assistantMsg, assistantActions, autoActionMessage: null });
}
