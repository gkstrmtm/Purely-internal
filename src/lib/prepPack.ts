import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export type LeadForPrepPack = {
  businessName: string;
  phone: string;
  website?: string | null;
  location?: string | null;
  niche?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  interestedService?: string | null;
  notes?: string | null;
};

export function buildPrepPackBase(lead: LeadForPrepPack) {
  const interested =
    lead.interestedService?.trim() || deriveInterestedServiceFromNotes(lead.notes);

  const lines: string[] = [];
  lines.push(`# Prep pack: ${lead.businessName}`);
  lines.push("");
  lines.push("## Lead summary");
  lines.push(`- Business: ${lead.businessName}`);
  lines.push(`- Phone: ${lead.phone}`);
  if (lead.website) lines.push(`- Website: ${lead.website}`);
  if (lead.location) lines.push(`- Location: ${lead.location}`);
  if (lead.niche) lines.push(`- Niche: ${lead.niche}`);
  if (lead.contactName) lines.push(`- Contact: ${lead.contactName}`);
  if (lead.contactEmail) lines.push(`- Email: ${lead.contactEmail}`);
  if (lead.contactPhone) lines.push(`- Direct phone: ${lead.contactPhone}`);
  if (interested) lines.push(`- Interested in: ${interested}`);
  lines.push("");

  lines.push("## Goals / context");
  if (interested) {
    lines.push(`- Primary goal: ${interested}`);
  } else {
    lines.push("- Primary goal: (unknown)");
  }

  if (lead.notes?.trim()) {
    lines.push("");
    lines.push("## Notes");
    lines.push(lead.notes.trim());
  }

  lines.push("");
  lines.push("## Call plan");
  lines.push("- 30-second opener tailored to their niche/location");
  lines.push("- 5 discovery questions (pain, volume, systems, budget, timeline)");
  lines.push("- 2 case-study style proof points");
  lines.push("- Clear CTA: confirm next steps and success criteria");

  return lines.join("\n");
}
