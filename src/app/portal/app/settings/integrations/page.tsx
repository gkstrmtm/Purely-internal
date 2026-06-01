import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { ProviderSetupWizardPanel } from "@/app/portal/app/settings/integrations/ProviderSetupWizardPanel";
import { requirePortalUser } from "@/lib/portalAuth";

type IntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PortalAppSettingsIntegrationsPage({ searchParams }: IntegrationsPageProps) {
  await requirePortalUser();

  const resolvedSearchParams = await searchParams;
  const from = firstQueryValue(resolvedSearchParams.from);
  const setup = firstQueryValue(resolvedSearchParams.setup);
  const showSalesReportingNote = from === "sales-reporting" || from === "stripe-sales";
  const showStripeSetupNote = setup === "stripe";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Integrations</h1>
      {showSalesReportingNote || showStripeSetupNote ? (
        <div className="mt-4 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
          <div className="font-semibold text-sky-950">Finish payment setup here</div>
          <div className="mt-1">
            Connect Stripe in the sales reporting section below, then go back to Sales Reporting to confirm live payment data is loading.
          </div>
        </div>
      ) : null}
      <div className="mt-6">
        <ProviderSetupWizardPanel />
      </div>
      <div id="provider-setup-controls" className="mt-6">
        <PortalProfileClient embedded mode="integrations" />
      </div>
    </div>
  );
}
