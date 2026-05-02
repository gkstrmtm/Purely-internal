import type { Metadata } from "next";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";

import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import { authOptions } from "@/lib/auth";
import { buildCustomDomainNotFoundMetadata, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";
import { getPortalUser } from "@/lib/portalAuth";

import { ConnectLandingClient } from "./ConnectLandingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
	const h = await headers();
	const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

	if (!isPlatformHostname(host) && host) {
		return buildCustomDomainNotFoundMetadata(host);
	}

	return {
		title: "Connect | Purely Automation",
		description: "Join rooms and collaborate in Connect.",
	};
}

export default async function ConnectLandingPage() {
	const h = await headers();
	const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;
	if (!isPlatformHostname(host)) {
		return <DomainRouterNotFound />;
	}

	const [session, portalUser] = await Promise.all([
		getServerSession(authOptions).catch(() => null),
		getPortalUser().catch(() => null),
	]);
	const signedInName = session?.user?.name ?? portalUser?.name ?? portalUser?.email ?? null;
	return <ConnectLandingClient signedInName={signedInName} />;
}
