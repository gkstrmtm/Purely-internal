import { z } from "zod";

import {
  defaultPortalPermissionsForRole,
  PORTAL_SERVICE_KEYS,
  type PortalPermissions,
  type PortalServiceKey,
} from "@/lib/portalPermissions.shared";

export const portalPermissionsInputSchema = z
  .object(Object.fromEntries(PORTAL_SERVICE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<PortalServiceKey, z.ZodOptional<z.ZodBoolean>>)
  .strict();

export function normalizePortalPermissions(
  input: unknown,
  role: "OWNER" | "ADMIN" | "MEMBER",
): PortalPermissions {
  const defaults = defaultPortalPermissionsForRole(role);
  const parsed = portalPermissionsInputSchema.safeParse(input ?? {});
  if (!parsed.success) return defaults;

  const out: PortalPermissions = { ...defaults };
  for (const k of PORTAL_SERVICE_KEYS) {
    const v = parsed.data[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function hasPortalServiceAccess(opts: {
  role: "OWNER" | "ADMIN" | "MEMBER";
  permissionsJson: unknown;
  service: PortalServiceKey;
}): boolean {
  if (opts.role === "OWNER" || opts.role === "ADMIN") return true;

  const perms = normalizePortalPermissions(opts.permissionsJson, opts.role);
  return !!perms[opts.service];
}
