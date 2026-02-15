import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { ConnectRoomClient } from "./ConnectRoomClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectRoomPage(props: { params: Promise<{ roomId: string }> }) {
	const { roomId } = await props.params;
	const session = await getServerSession(authOptions);

	return <ConnectRoomClient roomId={roomId} signedInName={session?.user?.name ?? null} />;
}
