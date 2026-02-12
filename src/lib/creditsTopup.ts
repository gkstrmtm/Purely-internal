export function creditsPerTopUpPackage() {
  const raw = process.env.CREDITS_TOPUP_PER_PACKAGE;
  const n = raw ? Number(raw) : 25;
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 25;
}
