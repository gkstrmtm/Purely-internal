export const EMPLOYEE_INVITE_ROLES = ["DIALER", "CLOSER", "MANAGER", "HR", "ADMIN"] as const;

export type EmployeeInviteRole = (typeof EMPLOYEE_INVITE_ROLES)[number];

export const EMPLOYEE_INVITE_ROLE_LABELS: Record<EmployeeInviteRole, string> = {
  DIALER: "Dialer / Setter",
  CLOSER: "Closer",
  MANAGER: "Manager",
  HR: "HR",
  ADMIN: "Admin",
};

export function normalizeEmployeeInviteRole(value: unknown): EmployeeInviteRole {
  if (typeof value !== "string") return "DIALER";
  const upper = value.trim().toUpperCase();
  return EMPLOYEE_INVITE_ROLES.includes(upper as EmployeeInviteRole)
    ? (upper as EmployeeInviteRole)
    : "DIALER";
}

export function canCreateEmployeeInviteRole(
  inviterRole: string | null | undefined,
  invitedRole: EmployeeInviteRole,
  hasElevatedInviteAccess = false,
) {
  if (inviterRole === "ADMIN" || hasElevatedInviteAccess) return true;
  return invitedRole === "DIALER" || invitedRole === "CLOSER";
}
