import type { HostedThemeOverrides } from "@/lib/hostedTheme";

const NEUTRAL_FUNNEL_BOOKING_RUNTIME_THEME: HostedThemeOverrides = {
  version: 1,
  bgHex: "#ffffff",
  surfaceHex: "#ffffff",
  softHex: "#f4f4f5",
  borderHex: "#e4e4e7",
  textHex: "#18181b",
  mutedTextHex: "#52525b",
  primaryHex: "#111827",
  accentHex: "#111827",
  linkHex: "#111827",
};

export function getNeutralFunnelBookingRuntimeTheme(): HostedThemeOverrides {
  return { ...NEUTRAL_FUNNEL_BOOKING_RUNTIME_THEME };
}