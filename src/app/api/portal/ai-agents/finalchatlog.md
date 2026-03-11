# finalchatlog.md (Requirements Snapshot)

Date: 2026-03-11

This file intentionally contains only a concise requirements snapshot (not a raw chat transcript).

## Scope delivered

### Referrals
- Add a "Refer for free credits" UI in portal billing.
- Generate/return a referral link for the logged-in portal user.
- Capture referral code on signup and record invited signup metadata.
- Award referral credits once the invited user verifies their email (idempotent).

### Email verification
- Issue email verification tokens and send verification emails.
- Verify token endpoint that marks the user verified.
- Resend verification endpoint.
- Cron endpoint to send verification emails ~10 minutes after signup (plus Vercel schedule).

### Manager overrides
- Expand manager overrides to show invite/referral counts (and keep existing override behavior).

### Portal reporting UI
- Replace reporting checkbox with a toggle UI.

### Funnel Builder Sales (Stripe)
- Funnel-builder authenticated API to list/create Stripe products (expanded default price).
- Public endpoint to create a Stripe Checkout Session only if the priceId exists in that funnel pages saved Sales blocks.
- Add a new funnel block type: salesCheckoutButton with editor palette + inspector controls.
- Hosted funnel rendering passes funnelPageId into block render context.

## Notes
- Stripe calls use the owners decrypted Stripe secret key server-side.
- Public checkout endpoint validates requested priceId against the pages blocksJson to reduce abuse.
