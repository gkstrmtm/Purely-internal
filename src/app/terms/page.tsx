import type { Metadata } from "next";

import { MarketingLegalPage } from "@/components/marketing/MarketingLegalPage";
import { getSupportEmail } from "@/lib/supportContact";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service | Purely",
  description: "Public terms of service for Purely website visitors and customers.",
};

export default function TermsPage() {
  const supportEmail = getSupportEmail();

  return (
    <MarketingLegalPage
      eyebrow="Terms of Service"
      title="Terms of service for Purely"
      summary="These terms describe practical rules for using the Purely website, requesting services, and accessing Purely software or provider integrations."
      updatedLabel="Last updated May 20, 2026"
    >
      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Using Purely</h2>
        <p className="mt-3">
          By using the Purely website or services, you agree to use them lawfully, provide accurate information, and avoid misuse of the platform. You are responsible for activity taken through your account and for keeping your login credentials secure.
        </p>
        <p className="mt-3">
          You may not use Purely to send spam, abuse third-party platforms, upload unlawful content, misrepresent your identity, interfere with the service, or try to bypass product guardrails.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Your content and connected systems</h2>
        <p className="mt-3">
          You keep responsibility for the content, business data, and provider accounts you connect to Purely. If you choose to connect Meta or another provider, you are authorizing access only for the Pages, accounts, or resources you approve. Purely does not take ownership of those assets.
        </p>
        <p className="mt-3">
          You are also responsible for the outreach, messaging, scheduling, media, and other content sent or stored through your workspace. That includes making sure you have the right to use your content and that your communications comply with applicable laws, consent requirements, and provider rules.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Approvals and publishing</h2>
        <p className="mt-3">
          Purely does not promise that every integration or publishing workflow is available in every environment. Where provider features exist, Purely should only act within the permissions and approvals given by the user. Businesses remain responsible for reviewing their own content, approvals, compliance, and connected provider settings.
        </p>
        <p className="mt-3">
          Provider integrations depend on third-party platforms such as Meta, Facebook, Instagram, scheduling providers, or messaging systems. Those platforms may change their rules, permissions, APIs, or availability at any time.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">No guarantee of business outcomes</h2>
        <p className="mt-3">
          Purely does not guarantee sales, revenue, deliverability, booked appointments, social reach, lead volume, credit outcomes, or any other business result. Any reporting, automation, or provider workflow is still subject to your offer, approvals, audience, systems, and third-party platform behavior.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Paid features and credits</h2>
        <p className="mt-3">
          Some Purely features may depend on paid plans, credits, or separately connected providers. If credits, subscriptions, or provider-backed features are part of your workspace, you are responsible for reviewing the applicable pricing, limits, and third-party terms before relying on them.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Access, suspension, and termination</h2>
        <p className="mt-3">
          Purely may change, improve, pause, suspend, or remove features as the product evolves. Accounts or access may also be limited or terminated if Purely reasonably believes there is misuse, security risk, non-payment on an applicable plan, or a violation of these terms.
        </p>
        <p className="mt-3">
          Some features may remain in beta, be limited to certain workspaces, or require additional provider review before they are broadly available.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-950">Questions</h2>
        <p className="mt-3">
          If you need help understanding these terms or a specific provider workflow, contact {supportEmail} before relying on a feature for production use.
        </p>
      </section>
    </MarketingLegalPage>
  );
}