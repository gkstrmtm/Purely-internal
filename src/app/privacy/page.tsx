import type { Metadata } from "next";

import { MarketingLegalPage } from "@/components/marketing/MarketingLegalPage";
import { getSupportEmail } from "@/lib/supportContact";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy | Purely",
  description: "Purely privacy policy for public site visitors, customers, and owner-scoped provider integrations including Meta.",
};

export default function PrivacyPage() {
  const supportEmail = getSupportEmail();

  return (
    <MarketingLegalPage
      eyebrow="Privacy Policy"
      title="Privacy policy for Purely"
      summary="This page explains what information Purely collects, how it is used, and how owner-scoped provider integrations such as Meta are handled. It is written for public site visitors, customers, and businesses using Purely services."
      updatedLabel="Last updated May 20, 2026"
    >
      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">What Purely collects</h2>
        <p className="mt-3">
          Purely may collect account, contact, and business information you submit directly, such as your name, business name, email address, phone number, scheduling details, and support messages. Purely may also store workspace content you choose to upload or create, including uploaded files, media, captions, notes, and related business records.
        </p>
        <p className="mt-3">
          Purely may also collect provider integration data and usage data needed to operate the service. That can include connection status, approved account references, selected settings, reporting or activity summaries, browser type, IP address, device information, logs, and product usage records that help keep the platform working.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">How Purely uses information</h2>
        <p className="mt-3">
          Purely uses information to deliver requested services, keep accounts secure, support scheduling and communication workflows, improve product reliability, and answer support requests. Purely may also use operational logs and workspace data to troubleshoot issues, prevent abuse, and maintain the platform.
        </p>
        <p className="mt-3">
          If reporting or provider-related metrics are available, Purely may use them to show status, continuity, and performance information inside the product. Purely does not use this page to promise any particular business outcome from those metrics.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">How Purely protects data</h2>
        <p className="mt-3">
          Purely uses reasonable administrative, technical, and operational safeguards to protect the information it stores, including access controls, hosted infrastructure protections, and product logging used to investigate misuse or reliability issues.
        </p>
        <p className="mt-3">
          No internet service can promise absolute security. Purely does not make unsupported security guarantees through this page, but it does limit access to stored data to the systems and personnel reasonably needed to operate, support, and secure the platform.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Meta and provider integrations</h2>
        <p className="mt-3">
          When a business chooses to connect a provider integration through Purely, that business connects its own assets. For Meta, this means the business connects its own Facebook Pages and Instagram professional accounts. Purely only accesses the Pages or accounts that the user has approved through the provider flow.
        </p>
        <p className="mt-3">
          Purely does not post to Meta, Facebook, Instagram, or another provider without user approval. Purely may store connection status, approved account references, limited provider metadata, and operator-selected publishing or reporting settings when that information is needed to support the requested integration.
        </p>
        <p className="mt-3">
          Purely treats provider credentials and tokens as sensitive connection data. Purely may store or process them only as needed to maintain the approved integration, but this page does not describe internal security implementation details or expose secrets.
        </p>
        <p className="mt-3">
          Users can disconnect supported integrations from the relevant product settings when those controls are available, and they can request deletion of stored provider data by following the instructions on the data deletion page.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Retention and deletion basics</h2>
        <p className="mt-3">
          Purely keeps information for as long as it is reasonably needed to operate the workspace, support the requested service, keep records consistent, and handle security or support issues. When data is no longer needed, or when a valid deletion request is completed, Purely can remove the data that it controls subject to operational and legal constraints that may apply.
        </p>
        <p className="mt-3">
          Additional deletion details, including how to request removal of Meta, Facebook, Instagram, and other provider-related records that Purely controls, are available on the data deletion page.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Sharing and service providers</h2>
        <p className="mt-3">
          Purely may share data with infrastructure, hosting, authentication, analytics, scheduling, payment, or messaging providers when that sharing is needed to operate the service you requested. Purely does not sell personal information through these pages or make claims beyond the actual systems used to run the platform.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Requests and contact</h2>
        <p className="mt-3">
          For privacy questions, provider disconnect help, or deletion requests related to stored provider data, contact Purely at {supportEmail}. Include your business name, the workspace or account involved, and the provider connection you want reviewed so the request can be handled accurately.
        </p>
      </section>
    </MarketingLegalPage>
  );
}