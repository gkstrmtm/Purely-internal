export type BookingMeetingOauthProvider = "zoom" | "google_meet";

export type BookingMeetingIntegrationProviderStatus = {
  connected: boolean;
  connectedEmail: string | null;
  connectedAtIso: string | null;
  oauthConfigured: boolean;
};

export type BookingMeetingIntegrationStatus = {
  encryptionConfigured: boolean;
  providers: Record<BookingMeetingOauthProvider, BookingMeetingIntegrationProviderStatus>;
};

export const BOOKING_MEETING_PROVIDER_LABELS: Record<BookingMeetingOauthProvider, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
};

export function normalizeBookingMeetingIntegrationStatus(raw: unknown): BookingMeetingIntegrationStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const providers = value.providers && typeof value.providers === "object" && !Array.isArray(value.providers)
    ? (value.providers as Record<string, unknown>)
    : null;
  const zoom = providers?.zoom && typeof providers.zoom === "object" && !Array.isArray(providers.zoom)
    ? (providers.zoom as Record<string, unknown>)
    : null;
  const googleMeet = providers?.google_meet && typeof providers.google_meet === "object" && !Array.isArray(providers.google_meet)
    ? (providers.google_meet as Record<string, unknown>)
    : null;

  return {
    encryptionConfigured: Boolean(value.encryptionConfigured),
    providers: {
      zoom: {
        connected: Boolean(zoom?.connected),
        connectedEmail: typeof zoom?.connectedEmail === "string" ? zoom.connectedEmail : null,
        connectedAtIso: typeof zoom?.connectedAtIso === "string" ? zoom.connectedAtIso : null,
        oauthConfigured: Boolean(zoom?.oauthConfigured),
      },
      google_meet: {
        connected: Boolean(googleMeet?.connected),
        connectedEmail: typeof googleMeet?.connectedEmail === "string" ? googleMeet.connectedEmail : null,
        connectedAtIso: typeof googleMeet?.connectedAtIso === "string" ? googleMeet.connectedAtIso : null,
        oauthConfigured: Boolean(googleMeet?.oauthConfigured),
      },
    },
  };
}
