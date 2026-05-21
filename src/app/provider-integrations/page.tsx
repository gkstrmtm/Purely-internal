import type { Metadata } from "next";

import { MarketingLegalPage } from "@/components/marketing/MarketingLegalPage";
import { getSupportEmail } from "@/lib/supportContact";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Provider Integrations | Purely",
  description: "How Purely handles owner-scoped provider integrations, including Meta, Facebook, and Instagram accounts.",
};

export default function ProviderIntegrationsPage() {
  const supportEmail = getSupportEmail();

  return (
    <MarketingLegalPage
      eyebrow="Provider Integrations"
      title="Provider integration policy for Purely"
      summary="This page explains how Purely approaches provider integrations, with plain-language guidance for Meta, Facebook, Instagram, and other owner-scoped connections."
      updatedLabel="Last updated May 20, 2026"
    >
      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Owner-scoped connections</h2>
        <p className="mt-3">
          Purely is designed so each business connects its own provider assets. For Meta, that means the business connects its own Facebook Pages and Instagram professional accounts. Purely should not use one business's connection for another business.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Approved access only</h2>
        <p className="mt-3">
          Purely only accesses the Meta Pages, Instagram accounts, or other provider resources that the user has approved through the provider's authorization flow. Purely does not claim broader access than what the provider and the user have actually approved.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Publishing and approvals</h2>
        <p className="mt-3">
          Purely does not post without user approval. If a publishing workflow is offered, the intent is to support operator-reviewed actions, stored scheduling or status information, and business-controlled approvals. If a provider path is not live or not approved, Purely should present that as unavailable rather than pretending the integration is active.
        </p>
        <p className="mt-3">
          Direct Meta publishing is currently coming soon and remains soft-gated in the product. Until that path is actually enabled, Purely should treat Meta publishing as unavailable and keep manual-post or non-live continuity workflows in place.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Disconnecting an integration</h2>
        <p className="mt-3">
          Users can disconnect supported integrations from the applicable settings when those controls are available. If a self-serve disconnect surface is not present, Purely support can help review the connection and remove stored provider data that Purely controls.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Provider availability and reconnects</h2>
        <p className="mt-3">
          Third-party provider availability can affect whether a feature works as expected. Meta, Facebook, Instagram, and other providers may change permissions, require reconnecting an expired authorization, or temporarily limit what Purely can access.
        </p>
        <p className="mt-3">
          If a provider token expires, a permission is revoked, or a provider changes its API rules, Purely may need the user to reconnect the integration before related features can continue.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Deletion of stored provider data</h2>
        <p className="mt-3">
          Users may request deletion of stored provider data by following the instructions at /data-deletion or by contacting {supportEmail}. Purely can delete the provider-related data that it stores, but the user may still need to remove permissions or content directly inside Meta, Facebook, Instagram, or another provider.
        </p>
      </section>
    </MarketingLegalPage>
  );
}