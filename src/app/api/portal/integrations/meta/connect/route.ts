import { NextResponse } from "next/server";

import { createMetaOAuthState, normalizeMetaReturnPath, getMetaProviderConnectUrl } from "@/lib/portalMetaIntegration.server";
import { DEFAULT_META_INTEGRATION_MODE, normalizePortalMetaIntegrationMode } from "@/lib/portalMetaModes";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const META_STATE_COOKIE = "portal_meta_oauth_state";
const META_CALLBACK_PATH = "/api/portal/integrations/meta/callback";

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("media", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() || "portal";
  if (!ownerId || memberId !== ownerId) {
    return NextResponse.json({ ok: false, error: "Only the account owner can connect Meta." }, { status: 403 });
  }

  const url = new URL(req.url);
  const nextPath = normalizeMetaReturnPath(url.searchParams.get("next"), portalVariant);
  const integrationMode = normalizePortalMetaIntegrationMode(url.searchParams.get("mode"), DEFAULT_META_INTEGRATION_MODE);

  try {
    const state = createMetaOAuthState({ ownerId, memberId, portalVariant, nextPath, integrationMode });
    const redirectTo = getMetaProviderConnectUrl({ state, integrationMode });
    const response = NextResponse.redirect(redirectTo, { status: 302 });
    response.cookies.set({
      name: META_STATE_COOKIE,
      value: encodeURIComponent(state),
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: META_CALLBACK_PATH,
      maxAge: 60 * 10,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Meta connection.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}