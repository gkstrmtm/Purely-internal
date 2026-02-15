import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { ConnectLandingClient } from "./ConnectLandingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectLandingPage() {
	const session = await getServerSession(authOptions);
	return <ConnectLandingClient signedInName={session?.user?.name ?? null} />;
}
