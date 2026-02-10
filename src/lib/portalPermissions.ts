import { z } from "zod";

import {
  defaultPortalPermissionsForRole,
  PORTAL_SERVICE_KEYS,
  type PortalPermissions,
  type PortalServicePermissions,
  type PortalServiceKey,
} from "@/lib/portalPermissions.shared";

const portalServicePermissionsInputSchema = z.union([
  z.boolean(),
  z
    .object({
      view: z.boolean().optional(),
      edit: z.boolean().optional(),
    })
    .strict(),
]);

export const portalPermissionsInputSchema = z
  .object(
    Object.fromEntries(
      PORTAL_SERVICE_KEYS.map((k) => [k, portalServicePermissionsInputSchema.optional()]),
    ) as Record<PortalServiceKey, z.ZodOptional<typeof portalServicePermissionsInputSchema>>,
  )
  .strict();

export type PortalServiceCapability = "view" | "edit";

function normalizeServicePermissions(input: unknown, defaults: PortalServicePermissions): PortalServicePermissions {
  if (typeof input === "boolean") {
    return { view: input, edit: input };
  }

  if (!input || typeof input !== "object") return defaults;

  const raw = input as any;
  const view = typeof raw.view === "boolean" ? raw.view : defaults.view;
  const edit = typeof raw.edit === "boolean" ? raw.edit : defaults.edit;

  // If edit is granted, view is implicitly granted.
  return { view: view || edit, edit };
}

export function normalizePortalPermissions(
  input: unknown,
  role: "OWNER" | "ADMIN" | "MEMBER",
): PortalPermissions {
  const defaults = defaultPortalPermissionsForRole(role);
  if (role === "OWNER" || role === "ADMIN") return defaults;
  const parsed = portalPermissionsInputSchema.safeParse(input ?? {});
  if (!parsed.success) return defaults;

  const out: PortalPermissions = { ...defaults };
  for (const k of PORTAL_SERVICE_KEYS) {
    const v = (parsed.data as any)[k];
    if (v !== undefined) out[k] = normalizeServicePermissions(v, defaults[k]);
  }
  return out;
}

export function hasPortalServiceCapability(opts: {
  role: "OWNER" | "ADMIN" | "MEMBER";
  permissionsJson: unknown;
  service: PortalServiceKey;
  capability: PortalServiceCapability;
}): boolean {
  if (opts.role === "OWNER" || opts.role === "ADMIN") return true;

  const perms = normalizePortalPermissions(opts.permissionsJson, opts.role);
  const p = perms[opts.service];
  return opts.capability === "edit" ? !!p?.edit : !!p?.view;
}

export function hasPortalServiceAccess(opts: {
  role: "OWNER" | "ADMIN" | "MEMBER";
  permissionsJson: unknown;
  service: PortalServiceKey;
}): boolean {
  return hasPortalServiceCapability({ ...opts, capability: "view" });
}
