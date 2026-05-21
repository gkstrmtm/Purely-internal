import type { Metadata } from "next";

import { MarketingLegalPage } from "@/components/marketing/MarketingLegalPage";
import { getSupportEmail } from "@/lib/supportContact";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | Purely",
  description: "How to request deletion of account data and provider integration data stored by Purely.",
};

export default function DataDeletionPage() {
  const supportEmail = getSupportEmail();

  return (
    <MarketingLegalPage
      eyebrow="Data Deletion"
      title="Data deletion instructions for Purely"
      summary="This page explains how a business or end user can request deletion of stored data from Purely, including information related to provider integrations such as Meta."
      updatedLabel="Last updated May 20, 2026"
    >
      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">How to request deletion</h2>
        <p className="mt-3">
          Send a deletion request to {supportEmail} and include the business name, the email address associated with the account, and the specific data you want removed. If your request is about a provider integration, identify the provider and the connected asset if you know it.
        </p>
        <p className="mt-3">
          If self-serve disconnect controls are available in the product, you can disconnect or remove a provider integration there first. If not, include a disconnect request in the same email so Purely can review the provider connection and the stored provider data together.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Meta and provider data</h2>
        <p className="mt-3">
          For Meta-related requests, Purely can review and delete stored provider data that Purely controls, such as connection status, approved account references, stored configuration details, and related operational records that are tied to the integration. Businesses connect their own Facebook Pages and Instagram professional accounts, and those connections can also be disconnected from the applicable product settings when that control is available.
        </p>
        <p className="mt-3">
          Purely only accesses approved Pages or accounts and does not post without user approval. Deleting data from Purely does not automatically delete records stored directly by Meta or another provider, so you may also need to manage deletion or revocation inside the provider's own settings.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">What to include</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Your full name and contact email.</li>
          <li>The Purely workspace, business, or account the request relates to.</li>
          <li>Whether the request covers account data, uploaded content, provider integration data, or all stored data that Purely controls for that account.</li>
          <li>Any provider details that help identify the correct connection, such as Meta, Facebook Page, or Instagram professional account references.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Processing</h2>
        <p className="mt-3">
          Purely may ask for enough information to verify the request and locate the right records. Requests are handled through support rather than an automatic public deletion endpoint so Purely can avoid deleting the wrong workspace or provider connection.
        </p>
        <p className="mt-3">
          After review, Purely may confirm the scope of the request, ask for clarification, disconnect the relevant provider relationship where appropriate, and remove the stored data that Purely controls. This page does not promise immediate deletion of data stored directly by Meta or another third-party provider.
        </p>
        <p className="mt-3">
          Purely aims to acknowledge deletion requests within a reasonable support window and complete verified requests as promptly as practical, usually after confirming scope and account ownership. More complex requests or provider-related requests may take longer if clarification or manual review is required.
        </p>
      </section>
    </MarketingLegalPage>
  );
}