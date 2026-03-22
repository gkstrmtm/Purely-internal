export type ActivationProfile = {
  businessName: string;
  websiteUrl: string | null;
  industry: string | null;
  businessModel: string | null;
  primaryGoals: string[];
  targetCustomer: string | null;
  brandVoice: string | null;

  brand: {
    logoUrl: string | null;
    primaryHex: string | null;
    secondaryHex: string | null;
    accentHex: string | null;
    textHex: string | null;
    fontFamily: string | null;
    fontGoogleFamily: string | null;
  };

  // Placeholder for future expansion.
  size: "solo" | "small" | "mid" | "enterprise";
  tone: "professional" | "friendly" | "bold";
};

export type SuggestedSetupActionKind =
  | "blogs.createSite"
  | "blogs.setAutomationSettings";

export type SuggestedSetupAction = {
  id: string;
  serviceSlug: string;
  kind: SuggestedSetupActionKind;
  title: string;
  description: string;
  payload: Record<string, unknown>;
};

export type SuggestedSetupPreview = {
  activationProfile: ActivationProfile;
  proposedActions: SuggestedSetupAction[];
};
