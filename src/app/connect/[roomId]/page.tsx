import type { Metadata } from "next";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";

import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import { authOptions } from "@/lib/auth";
import { buildCustomDomainNotFoundMetadata, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";
import { getPortalUser } from "@/lib/portalAuth";

import { ConnectRoomClient } from "./ConnectRoomClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
	const h = await headers();
	const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

	if (!isPlatformHostname(host) && host) {
		return buildCustomDomainNotFoundMetadata(host);
	}

	return {
		title: "Connect Room | Purely Automation",
		description: "Join your Connect room.",
	};
}

export default async function ConnectRoomPage(props: { params: Promise<{ roomId: string }> }) {
	const h = await headers();
	const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;
	if (!isPlatformHostname(host)) {
		return <DomainRouterNotFound />;
	}

	const { roomId } = await props.params;
	const [session, portalUser] = await Promise.all([
		getServerSession(authOptions).catch(() => null),
		getPortalUser().catch(() => null),
	]);
	const signedInName = session?.user?.name ?? portalUser?.name ?? portalUser?.email ?? null;

	return <ConnectRoomClient roomId={roomId} signedInName={signedInName} />;
}
