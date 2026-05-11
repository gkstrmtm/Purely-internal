import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { coerceBlocksJson } from "@/lib/creditFunnelBlocks";
import type { FunnelPageIntentProfile } from "@/lib/funnelPageIntent";
import { getFunnelPageCurrentHtml, type FunnelPageHtmlState } from "@/lib/funnelPageState";
import { detectIntentType, type FunnelPageIntentType } from "@/lib/funnelPageIntent";

type FunnelPageContractInput = FunnelPageHtmlState & {
  title?: string | null;
  slug?: string | null;
  editorMode?: string | null;
  blocksJson?: unknown;
  intentProfile?: FunnelPageIntentProfile | null;
};

type FunnelPageContractSignals = {
  hasPrimaryCta: boolean;
  hasProof: boolean;
  hasBookingHandoff: boolean;
  hasFormHandoff: boolean;
  hasCheckoutHandoff: boolean;
  hasConfirmationState: boolean;
};

export type FunnelPageContractValidation = {
  ok: boolean;
  pageType: FunnelPageIntentType;
  issues: string[];
  signals: FunnelPageContractSignals;
};

function collectTextFromBlocks(blocks: CreditFunnelBlock[]): string {
  const text: string[] = [];

  const visit = (items: CreditFunnelBlock[]) => {
    for (const block of items) {
      if (block.type === "heading" || block.type === "paragraph") {
        text.push(String(block.props.text || ""));
      }

      if (block.type === "button") {
        text.push(String(block.props.text || ""));
        text.push(String(block.props.href || ""));
      }

      if (block.type === "formLink") {
        text.push(String(block.props.text || ""));
        text.push(String(block.props.formSlug || ""));
      }

      if (block.type === "salesCheckoutButton" || block.type === "addToCartButton") {
        text.push(String(block.props.text || ""));
        text.push(String(block.props.productName || ""));
        text.push(String(block.props.priceId || ""));
      }

      if (block.type === "testimonialGrid") {
        text.push(String(block.props.heading || ""));
        text.push(String(block.props.intro || ""));
        for (const item of block.props.items || []) {
          text.push(String(item.quote || ""));
          text.push(String(item.outcome || ""));
          text.push(String(item.role || ""));
        }
      }

      if (block.type === "syncedReviews") {
        text.push(String(block.props.heading || ""));
        text.push(String(block.props.intro || ""));
      }

      if (block.type === "pricingGrid") {
        text.push(String(block.props.heading || ""));
        text.push(String(block.props.intro || ""));
        for (const item of block.props.items || []) {
          text.push(String(item.name || ""));
          text.push(String(item.price || ""));
          text.push(String(item.ctaText || ""));
          text.push(String(item.ctaHref || ""));
          text.push(String(item.priceId || ""));
        }
      }

      if (block.type === "section") {
        visit(block.props.children || []);
        visit(block.props.leftChildren || []);
        visit(block.props.rightChildren || []);
      }

      if (block.type === "columns") {
        for (const column of block.props.columns || []) {
          visit(column.children || []);
        }
      }
    }
  };

  visit(blocks);
  return text.join(" ").toLowerCase();
}

function blockSignals(blocks: CreditFunnelBlock[]): FunnelPageContractSignals {
  const text = collectTextFromBlocks(blocks);

  const hasPrimaryCta = blocks.some((block) => {
    if (block.type === "button") return Boolean(String(block.props.href || "").trim() || String(block.props.text || "").trim());
    if (block.type === "formLink") return Boolean(String(block.props.formSlug || "").trim());
    if (block.type === "formEmbed") return Boolean(String(block.props.formSlug || "").trim());
    if (block.type === "calendarEmbed") return Boolean(String(block.props.calendarId || "").trim());
    if (block.type === "salesCheckoutButton" || block.type === "addToCartButton") return Boolean(String(block.props.priceId || "").trim());
    if (block.type === "cartButton") return true;
    return false;
  });

  return {
    hasPrimaryCta,
    hasProof: blocks.some((block) => block.type === "testimonialGrid" || block.type === "syncedReviews") || /\b(testimonial|review|reviews|trusted by|case stud|result|results|client stories|5 stars?)\b/.test(text),
    hasBookingHandoff:
      blocks.some((block) => block.type === "calendarEmbed" && Boolean(String(block.props.calendarId || "").trim())) ||
      /\b(book|booking|schedule|appointment|consultation|calendar|call)\b/.test(text),
    hasFormHandoff:
      blocks.some(
        (block) =>
          (block.type === "formLink" || block.type === "formEmbed") && Boolean(String(block.props.formSlug || "").trim()),
      ) || /\b(apply|application|form|register|quote|assessment|submit)\b/.test(text),
    hasCheckoutHandoff:
      blocks.some(
        (block) =>
          ((block.type === "salesCheckoutButton" || block.type === "addToCartButton") && Boolean(String(block.props.priceId || "").trim())) ||
          block.type === "cartButton",
      ) || /\b(checkout|buy now|purchase|order|cart|price_)\b/.test(text),
    hasConfirmationState: /\b(thank you|thanks|confirmed|next steps|order confirmed|you(?:'| a)?re booked)\b/.test(text),
  };
}

function htmlSignals(html: string): FunnelPageContractSignals {
  const source = String(html || "");
  const text = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return {
    hasPrimaryCta:
      /<(a|button|form)\b/i.test(source) ||
      /\b(book|schedule|apply|register|get started|get the offer|buy now|checkout|complete purchase|submit)\b/.test(text),
    hasProof:
      /\b(testimonial|testimonials|review|reviews|trusted by|case stud|results?|client stories|5 stars?|outcomes?)\b/.test(text) ||
      /<(section|div|aside|ul)\b[^>]*(testimonial|review|proof|trust|results?|outcomes?)\b/i.test(source),
    hasBookingHandoff:
      /<iframe\b[^>]+(calendar|book|schedule|appointment)/i.test(source) ||
      /\b(book|booking|schedule|appointment|consultation|calendar|call)\b/.test(text),
    hasFormHandoff:
      /<form\b/i.test(source) ||
      /\/forms\//i.test(source) ||
      /\b(apply|application|register|quote|assessment|submit)\b/.test(text),
    hasCheckoutHandoff:
      /\b(checkout|add to cart|cart|buy now|complete purchase|price[_-]?id)\b/.test(text) ||
      /\/api\/public\/funnel-builder\/checkout-session/i.test(source),
    hasConfirmationState: /\b(thank you|thanks|confirmed|next steps|order confirmed|you(?:'| a)?re booked)\b/.test(text),
  };
}

function mergeSignals(blocks: FunnelPageContractSignals, html: FunnelPageContractSignals): FunnelPageContractSignals {
  return {
    hasPrimaryCta: blocks.hasPrimaryCta || html.hasPrimaryCta,
    hasProof: blocks.hasProof || html.hasProof,
    hasBookingHandoff: blocks.hasBookingHandoff || html.hasBookingHandoff,
    hasFormHandoff: blocks.hasFormHandoff || html.hasFormHandoff,
    hasCheckoutHandoff: blocks.hasCheckoutHandoff || html.hasCheckoutHandoff,
    hasConfirmationState: blocks.hasConfirmationState || html.hasConfirmationState,
  };
}

export function validateFunnelPageContract(input: FunnelPageContractInput): FunnelPageContractValidation {
  const pageType = input.intentProfile?.pageType || detectIntentType([input.title, input.slug].filter(Boolean).join(" "));
  const formStrategy = input.intentProfile?.formStrategy || "none";
  const html = getFunnelPageCurrentHtml(input);
  const blocks = coerceBlocksJson(input.blocksJson);
  const signals = mergeSignals(blockSignals(blocks), htmlSignals(html));
  const issues: string[] = [];
  const requiresBookingHandoff = pageType === "booking" || formStrategy === "booking";
  const requiresFormHandoff =
    pageType === "lead-capture" ||
    pageType === "application" ||
    pageType === "webinar" ||
    formStrategy === "embed-form" ||
    formStrategy === "link-form" ||
    formStrategy === "auto-create-form" ||
    formStrategy === "application";
  const requiresCheckoutHandoff = pageType === "sales" || pageType === "checkout" || formStrategy === "checkout";

  if (!signals.hasPrimaryCta && pageType !== "thank-you" && pageType !== "home") {
    issues.push("Primary CTA rhythm is missing. Add at least one real action surface before publish.");
  }

  if (requiresBookingHandoff && !signals.hasBookingHandoff) {
    issues.push("Booking handoff is missing. Add a real calendar embed or a clear booking route before publish.");
  }

  if (["booking", "lead-capture", "sales", "application", "webinar"].includes(pageType) && !signals.hasProof) {
    issues.push("Proof placement is too thin for this page job. Add testimonials, synced reviews, or another concrete trust surface before publish.");
  }

  if (requiresFormHandoff && !signals.hasFormHandoff) {
    issues.push("Qualification or intake handoff is missing. Add a real form surface or route before publish.");
  }

  if (requiresCheckoutHandoff && !signals.hasCheckoutHandoff) {
    issues.push("Checkout handoff is missing. Add a real checkout surface before publish.");
  }

  if (pageType === "thank-you" && !signals.hasConfirmationState) {
    issues.push("Confirmation state is missing. Add a clear success or next-step confirmation before publish.");
  }

  return {
    ok: issues.length === 0,
    pageType,
    issues,
    signals,
  };
}