import { Suspense } from "react";

import EmployeeLoginClient from "./EmployeeLoginClient";

export const dynamic = "force-dynamic";

export default function EmployeeLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <EmployeeLoginClient />
    </Suspense>
  );
}
