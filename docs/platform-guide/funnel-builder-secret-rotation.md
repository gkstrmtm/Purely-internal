# Funnel Builder Secret Rotation

Date: 2026-05-08

This procedure covers the secrets used by funnel builder AI and builder-adjacent flows.

## Covered secrets

- Provider API keys used by `@/lib/ai`
- Stripe secret keys used for builder-side product lookup and sales wiring
- Funnel builder webhook secrets stored in builder settings

## Rotation procedure

1. Rotate the provider secret at the provider first.
2. Update the server-side environment variable or owner-scoped integration record used by the builder route.
3. Restart or redeploy the app so new server processes stop using the old value.
4. Regenerate any owner-visible builder webhook secret through the funnel builder settings route instead of reusing the previous secret.
5. Verify the secret is never returned in client-visible route responses. The builder settings route returns only a masked webhook-secret value and a `hasWebhookSecret` flag.
6. Run a narrow post-rotation check on the affected route or integration path.
7. Review recent guardrail alerts and route failures for follow-on breakage.

## Builder-specific checks

- AI routes: confirm one successful generate/review request after rotation.
- Stripe-backed builder routes: confirm product listing or product creation still works for a connected account.
- Builder webhook flows: confirm a hosted form submission still signs webhook requests with the regenerated secret.

## Emergency revocation

- If a builder secret is suspected to have leaked, rotate it immediately, invalidate any dependent cached credentials, redeploy, and rerun the narrow validation for that surface.