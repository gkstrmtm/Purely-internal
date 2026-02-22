import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function AppIndexPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;

  if (role === "CLOSER") redirect("/app/closer");
  if (role === "MANAGER" || role === "ADMIN") redirect("/app/manager");
  redirect("/app/dialer");
}
