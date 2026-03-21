export const PURELY_HOSTED_ORIGIN = "https://purelyautomation.com";

function normalizePath(pathname: string): string {
  const p = String(pathname || "").trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

export function toPurelyHostedUrl(pathname: string): string {
  return `${PURELY_HOSTED_ORIGIN}${normalizePath(pathname)}`;
}
