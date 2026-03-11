export function getRequestIp(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  const raw = (xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) || "";
  const ip = String(raw || "").trim();
  if (!ip) return null;
  if (ip.length > 80) return null;
  return ip;
}
