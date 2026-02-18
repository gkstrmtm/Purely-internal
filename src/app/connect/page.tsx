import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";

import { ConnectLandingClient } from "./ConnectLandingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectLandingPage() {
	const [session, portalUser] = await Promise.all([
		getServerSession(authOptions).catch(() => null),
		getPortalUser().catch(() => null),
	]);
	const signedInName = session?.user?.name ?? portalUser?.name ?? portalUser?.email ?? null;
	return <ConnectLandingClient signedInName={signedInName} />;
}
