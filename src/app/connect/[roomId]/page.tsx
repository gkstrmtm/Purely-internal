import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getPortalUser } from "@/lib/portalAuth";

import { ConnectRoomClient } from "./ConnectRoomClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectRoomPage(props: { params: Promise<{ roomId: string }> }) {
	const { roomId } = await props.params;
	const [session, portalUser] = await Promise.all([
		getServerSession(authOptions).catch(() => null),
		getPortalUser().catch(() => null),
	]);
	const signedInName = session?.user?.name ?? portalUser?.name ?? portalUser?.email ?? null;

	return <ConnectRoomClient roomId={roomId} signedInName={signedInName} />;
}
