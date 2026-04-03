import type { CreditFormContent, CreditFormField, CreditFormSuccessContent } from "@/lib/creditFormSchema";
import type { CreditFormTheme, CreditFormThemeKey } from "@/lib/creditFormThemes";

export type CreditFormTemplateKey =
  | "blank"
  | "credit-intake-premium"
  | "credit-intake-minimal"
  | "business-credit-intake"
  | "dispute-case-intake"
  | "document-upload-request"
  | "authorization-consent"
  | "identity-verification"
  | "consultation-request"
  | "client-onboarding"
  | "post-consult-followup"
  | "referral-request";

export type CreditFormTemplate = {
  key: CreditFormTemplateKey;
  label: string;
  description: string;
  defaultThemeKey: CreditFormThemeKey;
  content?: CreditFormContent;
  success?: CreditFormSuccessContent;
  fields: CreditFormField[];
};

function templateBaseSuccess(): CreditFormSuccessContent {
  return {
    title: "You're all set",
     message: "Thanks - we received your info and will follow up shortly.",
    buttonLabel: "Submit another",
    buttonAction: "reset",
  };
}

function contentTitle(displayTitle: string, description: string): CreditFormContent {
  return { displayTitle, description };
}

const BLANK_FIELDS: CreditFormField[] = [
  { name: "fullName", label: "Full name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "message", label: "Message", type: "textarea" },
];

export const CREDIT_FORM_TEMPLATES: CreditFormTemplate[] = [
  {
    key: "blank",
    label: "Blank (simple contact)",
    description: "Basic name/email/phone/message.",
    defaultThemeKey: "platinum-blue",
    content: contentTitle("Contact us", "Send us a message and we’ll get back to you."),
    success: templateBaseSuccess(),
    fields: BLANK_FIELDS,
  },

  {
    key: "credit-intake-premium",
    label: "Credit Repair Intake (Premium)",
    description: "Full personal intake + address + consent signature.",
    defaultThemeKey: "royal-indigo",
    content: contentTitle(
      "Client Intake",
      "Complete this intake so we can review your credit profile and prepare next steps.",
    ),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "phone", required: true },
      { name: "dob", label: "Date of birth", type: "short_answer", required: true },
      { name: "ssnLast4", label: "SSN (last 4)", type: "short_answer", required: true },
      { name: "addressLine1", label: "Address line 1", type: "short_answer", required: true },
      { name: "addressLine2", label: "Address line 2", type: "short_answer" },
      { name: "city", label: "City", type: "short_answer", required: true },
      { name: "state", label: "State", type: "short_answer", required: true },
      { name: "zip", label: "ZIP code", type: "short_answer", required: true },
      {
        name: "goals",
        label: "Primary goals",
        type: "checklist",
        options: ["Remove inaccurate items", "Improve credit score", "Prepare for mortgage", "Prepare for auto loan", "Build business credit"],
      },
      { name: "notes", label: "Anything else we should know?", type: "long_answer" },
      { name: "consent", label: "Consent & signature", type: "signature", required: true },
    ],
  },

  {
    key: "credit-intake-minimal",
    label: "Credit Intake (Minimal)",
    description: "Fast intake for ads/funnels.",
    defaultThemeKey: "emerald-clean",
    content: contentTitle("Free Credit Analysis", "Answer a few questions and we’ll text/email your next steps."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Mobile phone", type: "tel", required: true },
      {
        name: "bestTime",
        label: "Best time to reach you",
        type: "radio",
        required: true,
        options: ["Morning", "Afternoon", "Evening"],
      },
      {
        name: "goal",
        label: "What are you trying to qualify for?",
        type: "short_answer",
        required: true,
      },
      {
        name: "smsConsent",
        label: "Communication preference",
        type: "checklist",
        required: true,
        options: ["I agree to receive SMS/email updates about my request."],
      },
    ],
  },

  {
    key: "business-credit-intake",
    label: "Business Credit Intake",
    description: "Business details + owner info + signature.",
    defaultThemeKey: "ivory-gold",
    content: contentTitle("Business Credit Intake", "Tell us about your business so we can recommend a path to fundable business credit."),
    success: templateBaseSuccess(),
    fields: [
      { name: "businessName", label: "Business legal name", type: "short_answer", required: true },
      { name: "businessEmail", label: "Business email", type: "email", required: true },
      { name: "businessPhone", label: "Business phone", type: "phone" },
      { name: "businessAddress", label: "Business address", type: "long_answer", required: true },
      { name: "einLast4", label: "EIN (last 4)", type: "short_answer" },
      { name: "yearsInBusiness", label: "Years in business", type: "short_answer" },
      { name: "monthlyRevenue", label: "Monthly revenue (approx.)", type: "short_answer" },
      { name: "ownerFullName", label: "Owner full name", type: "name", required: true },
      { name: "ownerEmail", label: "Owner email", type: "email", required: true },
      { name: "ownerPhone", label: "Owner phone", type: "phone", required: true },
      { name: "ownerDob", label: "Owner DOB", type: "short_answer" },
      { name: "ownerSsnLast4", label: "Owner SSN (last 4)", type: "short_answer" },
      { name: "ownerSignature", label: "Authorization signature", type: "signature", required: true },
    ],
  },

  {
    key: "dispute-case-intake",
    label: "Dispute Case Intake",
    description: "Collect dispute targets and supporting context.",
    defaultThemeKey: "platinum-blue",
    content: contentTitle("Dispute Intake", "Tell us what’s on your report so we can build your dispute packet."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "phone" },
      {
        name: "bureaus",
        label: "Which credit bureaus have issues?",
        type: "checklist",
        required: true,
        options: ["Experian", "Equifax", "TransUnion"],
      },
      { name: "items", label: "List the inaccurate items (account names / numbers)", type: "long_answer", required: true },
      { name: "why", label: "Why are these items inaccurate?", type: "long_answer", required: true },
      { name: "supportingDocs", label: "Do you have supporting documents?", type: "radio", options: ["Yes", "No", "Not sure"] },
      { name: "signature", label: "Authorization signature", type: "signature", required: true },
    ],
  },

  {
    key: "document-upload-request",
    label: "Document Upload Request",
    description: "Securely request PDFs/photos from clients.",
    defaultThemeKey: "midnight-cyan",
    content: contentTitle("Upload documents", "Upload the requested documents to continue."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      {
        name: "documents",
        label: "Upload documents",
        type: "file_upload",
        required: true,
        maxFiles: 10,
        maxSizeMb: 25,
        allowedContentTypes: ["application/pdf", "image/*"],
      },
      { name: "notes", label: "Notes (optional)", type: "long_answer" },
    ],
  },

  {
    key: "authorization-consent",
    label: "Authorization + Consent",
    description: "Signature-first authorization form.",
    defaultThemeKey: "royal-indigo",
    content: contentTitle(
      "Authorization",
      "By signing below, you authorize us to review your credit reports and communicate with you about your case.",
    ),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "signature", label: "Signature", type: "signature", required: true },
    ],
  },

  {
    key: "identity-verification",
    label: "Identity Verification",
    description: "Collect DOB/SSN last4/address for verification.",
    defaultThemeKey: "emerald-clean",
    content: contentTitle("Verify your identity", "We use this only to verify your identity and match your credit file."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "name", required: true },
      { name: "dob", label: "Date of birth", type: "short_answer", required: true },
      { name: "ssnLast4", label: "SSN (last 4)", type: "short_answer", required: true },
      { name: "addressLine1", label: "Address line 1", type: "short_answer", required: true },
      { name: "city", label: "City", type: "short_answer", required: true },
      { name: "state", label: "State", type: "short_answer", required: true },
      { name: "zip", label: "ZIP code", type: "short_answer", required: true },
    ],
  },

  {
    key: "consultation-request",
    label: "Consultation Request",
    description: "High-converting funnel form for scheduling.",
    defaultThemeKey: "platinum-blue",
    content: contentTitle("Book a free consultation", "Tell us a bit about your situation and we’ll reach out."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      {
        name: "preferred",
        label: "Preferred contact method",
        type: "radio",
        required: true,
        options: ["Text me", "Call me", "Email me"],
      },
      { name: "goal", label: "What are you trying to qualify for?", type: "short_answer", required: true },
      { name: "timeline", label: "Timeline", type: "radio", options: ["ASAP", "30-60 days", "60-90 days", "Not sure"] },
    ],
  },

  {
    key: "client-onboarding",
    label: "Client Onboarding",
    description: "Onboarding checklist + signature.",
    defaultThemeKey: "ivory-gold",
    content: contentTitle("Welcome", "Let’s get you fully onboarded so we can start work immediately."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "phone" },
      {
        name: "onboarding",
        label: "Onboarding tasks",
        type: "checklist",
        options: ["I uploaded my ID", "I uploaded proof of address", "I reviewed the service agreement", "I’m ready to begin"],
      },
      { name: "signature", label: "Signature", type: "signature", required: true },
    ],
  },

  {
    key: "post-consult-followup",
    label: "Post-Consult Follow-up",
    description: "Collect outcome + next steps.",
    defaultThemeKey: "emerald-clean",
    content: contentTitle("Quick follow-up", "A few quick questions so we can tailor your plan."),
    success: templateBaseSuccess(),
    fields: [
      { name: "fullName", label: "Full name", type: "text" },
      { name: "email", label: "Email", type: "email" },
      {
        name: "status",
        label: "Where are you at?",
        type: "radio",
        required: true,
        options: ["Ready to start", "Need more info", "Not a fit right now"],
      },
      { name: "questions", label: "Questions or concerns", type: "long_answer" },
    ],
  },

  {
    key: "referral-request",
    label: "Referral Request",
    description: "Request referrals after wins.",
    defaultThemeKey: "platinum-blue",
    content: contentTitle("Know someone who needs help?", "Share their info and we’ll take great care of them."),
    success: templateBaseSuccess(),
    fields: [
      { name: "yourName", label: "Your name", type: "text", required: true },
      { name: "yourEmail", label: "Your email", type: "email" },
      { name: "friendName", label: "Friend’s name", type: "text", required: true },
      { name: "friendPhone", label: "Friend’s phone", type: "tel" },
      { name: "friendEmail", label: "Friend’s email", type: "email" },
      { name: "notes", label: "Notes", type: "short_answer" },
    ],
  },
];

export function getCreditFormTemplate(key: CreditFormTemplateKey | null | undefined): CreditFormTemplate | null {
  const k = typeof key === "string" ? (key.trim() as CreditFormTemplateKey) : ("" as any);
  if (!k) return null;
  return CREDIT_FORM_TEMPLATES.find((t) => t.key === k) ?? null;
}

export function coerceCreditFormTemplateKey(raw: unknown): CreditFormTemplateKey | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (CREDIT_FORM_TEMPLATES.find((t) => t.key === s)?.key as CreditFormTemplateKey) ?? null;
}

export function buildCreditFormSchemaFromTemplate(t: CreditFormTemplate): Record<string, unknown> {
  // Backwards compat: schema needs theme styling. Prefer buildCreditFormSchemaFromTemplateAndTheme.
  return {
    fields: t.fields,
    ...(t.content && Object.keys(t.content).length ? { content: t.content } : {}),
    ...(t.success && Object.keys(t.success).length ? { success: t.success } : {}),
  };
}

export function buildCreditFormSchemaFromTemplateAndTheme(t: CreditFormTemplate, theme: CreditFormTheme): Record<string, unknown> {
  const mergedSuccess: CreditFormSuccessContent = {
    ...(templateBaseSuccess() as any),
    ...(t.success || {}),
    ...theme.successColors,
  };

  const out: Record<string, unknown> = {
    fields: t.fields,
    style: theme.style,
  };
  if (t.content && Object.keys(t.content).length) out.content = t.content;
  if (Object.keys(mergedSuccess).length) out.success = mergedSuccess;
  return out;
}
