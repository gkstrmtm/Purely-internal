import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { authOptions } from "@/lib/auth";

export default async function DialerHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "DIALER" && role !== "MANAGER" && role !== "ADMIN") {
    redirect("/app");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Dialer</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Start by pulling leads, then generate a script.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            href="/app/dialer/leads"
          >
            Leads + AI script
          </Link>

          <Link
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            href="/app/dialer/calls"
          >
            Calls + transcripts
          </Link>

          <Link
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            href="/app/dialer/appointments"
          >
            My appointments
          </Link>
        </div>
      </div>
    </div>
  );
}
