import { Suspense } from "react";

import PortalGetStartedPage from "@/app/portal/get-started/page";

export const dynamic = "force-dynamic";

export default function CreditGetStartedPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-screen bg-brand-mist text-brand-ink">
					<div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
				</div>
			}
		>
			<PortalGetStartedPage />
		</Suspense>
	);
}
