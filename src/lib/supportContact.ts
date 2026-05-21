function cleanEmail(value: string | null | undefined): string | null {
  const email = String(value || "").trim();
  if (!email) return null;
  return email;
}

export function getSupportEmail(): string {
  return cleanEmail(process.env.SUPPORT_EMAIL) || cleanEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || "support@purelyautomation.com";
}

export function getSupportMailto(): string {
  return `mailto:${getSupportEmail()}`;
}