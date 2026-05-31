import { NextResponse } from "next/server";

import {
  completeMetaOauthConnection,
  getDefaultMetaReturnPath,
  readMetaOAuthState,
} from "@/lib/portalMetaIntegration.server";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const META_STATE_COOKIE = "portal_meta_oauth_state";
const META_CALLBACK_PATH = "/api/portal/integrations/meta/callback";

function appendMetaStatus(origin: string, nextPath: string, status: string, message?: string | null) {
  const target = new URL(nextPath, origin);
  target.searchParams.set("metaConnection", status);
  if (message) target.searchParams.set("metaMessage", message);
  return target;
}

function clearStateCookie(response: NextResponse, isSecure: boolean) {
  response.cookies.set({
    name: META_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: META_CALLBACK_PATH,
    maxAge: 0,
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireClientSessionForService("media", "edit");
  const stateToken = String(url.searchParams.get("state") || "").trim();
  const statePayload = readMetaOAuthState(stateToken);
  const storedCookie = req.headers.get("cookie") || "";
  const stateMatch = storedCookie.match(new RegExp(`(?:^|; )${META_STATE_COOKIE}=([^;]+)`));
  const cookieState = stateMatch ? decodeURIComponent(stateMatch[1]) : "";

  const redirect = (targetPath: string, status: string, message?: string | null) => {
    const response = NextResponse.redirect(appendMetaStatus(url.origin, targetPath, status, message), { status: 302 });
    clearStateCookie(response, url.protocol === "https:");
    return response;
  };

  if (!auth.ok) {
    const fallbackPath = getDefaultMetaReturnPath(statePayload?.portalVariant || "portal");
    return redirect(
      fallbackPath,
      "unauthorized",
      auth.status === 401 ? "Sign in again before finishing the Meta connection." : "You do not have access to manage Meta from this workspace.",
    );
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() || "portal";
  const fallbackPath = getDefaultMetaReturnPath(portalVariant);
  const nextPath = statePayload?.nextPath || fallbackPath;
  if (!ownerId || memberId !== ownerId) {
    return redirect(fallbackPath, "forbidden", "Only the account owner can finish the Meta connection.");
  }

  if (!statePayload || !cookieState || cookieState !== stateToken) {
    return redirect(fallbackPath, "invalid_state", "The Meta connection state did not match. Start the connection again.");
  }

  if (statePayload.ownerId !== ownerId || statePayload.memberId !== memberId || statePayload.portalVariant !== portalVariant) {
    return redirect(fallbackPath, "invalid_state", "The Meta connection state no longer matches this session. Start the connection again.");
  }

  const errorReason = String(url.searchParams.get("error_reason") || url.searchParams.get("error") || "").trim();
  const errorDescription = String(url.searchParams.get("error_description") || "").trim();
  if (errorReason) {
    return redirect(nextPath, "cancelled", errorDescription || errorReason || "Meta connection was cancelled.");
  }

  const code = String(url.searchParams.get("code") || "").trim();
  if (!code) {
    return redirect(nextPath, "missing_code", "Meta did not return a connection code.");
  }

  try {
    const result = await completeMetaOauthConnection({ ownerId, code, integrationMode: statePayload.integrationMode });
    return redirect(nextPath, result.status === "needs_permissions" ? "needs_permissions" : "connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not finish the Meta connection.";
    return redirect(nextPath, "error", message);
  }
}