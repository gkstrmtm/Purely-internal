import { Suspense } from "react";

import PortalLoginClient from "./PortalLoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <PortalLoginClient />
    </Suspense>
  );
}
