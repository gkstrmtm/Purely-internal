import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import ManagerInvitesClient from "./ManagerInvitesClient";

export default async function ManagerInvitesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Employee invites</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Create one-time invite codes for new employees. Share the signup link or the code directly.
        </p>
        <div className="mt-6">
          <ManagerInvitesClient />
        </div>
      </div>
    </div>
  );
}
