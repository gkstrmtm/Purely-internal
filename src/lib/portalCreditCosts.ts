export const PORTAL_CREDIT_COSTS = {
  // Short, fixed-cost AI copy generation actions
  aiDraftStep: 5,

  // Content generation
  newsletterGenerateDraft: 30,
  blogGenerateDraft: 50,

  // Voice / calling
  voicePerStartedMinute: 5,
  aiOutboundCallAttempt: 10,

  // Lead scraping
  leadScrapeReservePerRequestedLead: 1,
  leadScrapeSmsPerMessage: 1,
} as const;

export function portalCreditCostsForSupportText(): string {
  return [
    "Per-use credits (exact numbers):",
    `- Follow-up step AI draft: ${PORTAL_CREDIT_COSTS.aiDraftStep} credits per generate`,
    `- Nurture campaign step AI draft: ${PORTAL_CREDIT_COSTS.aiDraftStep} credits per generate`,
    `- Booking reminder step AI draft: ${PORTAL_CREDIT_COSTS.aiDraftStep} credits per generate`,
    `- Lead Scraping outbound template AI draft: ${PORTAL_CREDIT_COSTS.aiDraftStep} credits per generate`,
    `- Newsletter draft generation (Generate now / automation run): ${PORTAL_CREDIT_COSTS.newsletterGenerateDraft} credits per draft`,
    `- Blog post draft generation (Generate now / Generate draft): ${PORTAL_CREDIT_COSTS.blogGenerateDraft} credits per draft`,
    "- Blogs automation cron: charges 50 credits only when scheduled more frequently than weekly (frequencyDays < 7); weekly or less is 0 credits.",
    `- AI receptionist call minutes: ${PORTAL_CREDIT_COSTS.voicePerStartedMinute} credits per started minute (only billed if call duration >= 15s)`,
    `- AI outbound calls: ${PORTAL_CREDIT_COSTS.aiOutboundCallAttempt} credits per attempt + ${PORTAL_CREDIT_COSTS.voicePerStartedMinute} credits per started minute on completion`,
    `- Lead scraping run: reserves ${PORTAL_CREDIT_COSTS.leadScrapeReservePerRequestedLead} credit per requested lead (unused credits refunded if fewer leads are created)`,
    `- Lead scraping outbound SMS: ${PORTAL_CREDIT_COSTS.leadScrapeSmsPerMessage} credit per SMS message`,
  ].join("\n");
}
