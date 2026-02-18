import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
	const [session, portal] = await Promise.all([
		getServerSession(authOptions).catch(() => null),
		getPortalUser().catch(() => null),
	]);

	const employeeUser = session?.user
		? {
			email: session.user.email ?? null,
			name: session.user.name ?? null,
			role: session.user.role ?? null,
		}
		: null;

	const portalUser = portal
		? {
			email: portal.email ?? null,
			name: portal.name ?? null,
			role: portal.role ?? null,
		}
		: null;

	return NextResponse.json({ ok: true, employee: employeeUser, portal: portalUser });
}
