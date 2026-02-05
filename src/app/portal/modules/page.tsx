import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function PortalModulesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-ink">Modules</h1>
      <p className="mt-2 text-sm text-zinc-600">
        This page will show each automation module, its setup state, and usage.
      </p>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        Coming next: module setup flows (connect website, brand voice, scheduling, etc.).
      </div>
    </div>
  );
}
