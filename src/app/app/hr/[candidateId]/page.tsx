import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import HrCandidateDetailClient from "./HrCandidateDetailClient";

export default async function HrCandidatePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "HR" && role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  const { candidateId } = await params;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Employee onboarding</h1>
          <a className="text-sm font-medium text-brand-ink hover:underline" href="/app/hr">
            Back
          </a>
        </div>
        <div className="mt-6">
          <HrCandidateDetailClient candidateId={candidateId} />
        </div>
      </div>
    </div>
  );
}
