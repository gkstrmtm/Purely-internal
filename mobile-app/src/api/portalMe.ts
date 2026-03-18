import { apiFetch } from "./client";
import { AppConfig } from "../config/app";

export type PortalMeResponse =
  | {
      ok?: true;
      user: { email: string; name: string; role: string };
      entitlements?: unknown;
    }
  | { error: string };

export async function portalMe(): Promise<{ email: string; name: string; role: string } | null> {
  try {
    const res = await apiFetch<PortalMeResponse>("/api/customer/me", {
      method: "GET",
      headers: {
        [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
        [AppConfig.appHeaderName]: AppConfig.appHeaderValue,
      },
    });

    const user = (res as any)?.user;
    if (user && typeof user.email === "string") {
      return {
        email: String(user.email),
        name: typeof user.name === "string" ? String(user.name) : "",
        role: typeof user.role === "string" ? String(user.role) : "",
      };
    }

    return null;
  } catch (e: any) {
    // Unauthorized, forbidden, or network errors -> treat as logged out.
    return null;
  }
}
