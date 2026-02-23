import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import HrCandidatesClient from "./HrCandidatesClient";

export default async function HrHomePage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "HR" && role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">HR candidates</h1>
        <p className="mt-2 text-sm text-zinc-600">Track candidates, schedule interviews, and queue follow-ups.</p>
        <div className="mt-6">
          <HrCandidatesClient />
        </div>
      </div>
    </div>
  );
}
