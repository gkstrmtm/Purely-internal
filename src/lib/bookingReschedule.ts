import crypto from "crypto";

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getSecret() {
  return (
    process.env.BOOKING_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.NEXTAUTH_URL ||
    ""
  );
}

export function signBookingRescheduleToken(input: { bookingId: string; contactEmail: string }) {
  const secret = getSecret();
  if (!secret) return null;
  const payload = `v1:${input.bookingId}:${String(input.contactEmail || "").toLowerCase()}`;
  const mac = crypto.createHmac("sha256", secret).update(payload).digest();
  return base64UrlEncode(mac);
}

export function verifyBookingRescheduleToken(input: {
  bookingId: string;
  contactEmail: string;
  token: string;
}) {
  const expected = signBookingRescheduleToken({
    bookingId: input.bookingId,
    contactEmail: input.contactEmail,
  });
  if (!expected) return false;
  const token = String(input.token || "").trim();
  if (!token) return false;
  return timingSafeEqual(expected, token);
}

export function getRequestOrigin(req: Request) {
  return (
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}
