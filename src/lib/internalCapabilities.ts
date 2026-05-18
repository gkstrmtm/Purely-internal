export type InternalEmployeeRole = "DIALER" | "CLOSER" | "MANAGER" | "HR" | "ADMIN";

type MaybeRole = string | null | undefined;

export function isInternalEmployeeRole(role: MaybeRole): role is InternalEmployeeRole {
  return role === "DIALER" || role === "CLOSER" || role === "MANAGER" || role === "HR" || role === "ADMIN";
}

export function hasSalesManagerCapability(role: MaybeRole) {
  return role === "MANAGER" || role === "ADMIN";
}

export function canAccessTeamOpsWorkspace(role: MaybeRole) {
  return role === "HR" || hasSalesManagerCapability(role);
}

export function canAccessHrWorkspace(role: MaybeRole) {
  return role === "HR" || hasSalesManagerCapability(role);
}

export function hasPlatformAdminCapability(role: MaybeRole, platformAdminGranted = false) {
  return role === "ADMIN" || platformAdminGranted;
}