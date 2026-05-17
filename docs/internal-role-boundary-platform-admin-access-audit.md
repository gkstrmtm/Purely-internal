# P-030 Internal Role Boundary and Platform-Admin Access Audit

- Prompt ID: P-030
- Branch audited: `dev-retro`
- Date: 2026-05-16
- Scope: internal role boundary audit for manager/team operations versus platform-admin/account-ops access
- Repo file changes in this pass: removed `MANAGER` from platform-admin capability, added a separate admin-managed platform-admin grant, and rewired platform-admin nav/routes/APIs to use that grant
- Follow-up nav adjustment: restored a direct `Portal overrides` nav item for platform-admin-capable users so the route remains discoverable from the employee sidebar/top nav
- Local validation-only environment change: added a local `HR` test user (`hr@purelyautomation.dev`) in the dev database so runtime HR proofs could be executed
- Pura/chat impact: none

## Outcome

This pass finalized the platform-admin split.

The current boundary is holding for `DIALER`, `CLOSER`, `HR`, and now `MANAGER`: they do not have platform-admin nav visibility, direct platform-admin route access, or platform-admin mutation access.

In addition, platform-admin surfaces no longer hardcode `MANAGER` checks directly as their source of truth. They now route through a named capability layer backed by a separate admin-managed grant.

The remaining risk is operational, not authorization-related:

- platform-admin grant changes are enforced with fresh server-side checks, but nav visibility still depends on the current server render
- the grant table is SQL-backed drift hardening, not a Prisma model, so future schema consolidation should move it into first-class Prisma schema when the environment allows

## Source Of Truth

### Role enum

Defined in `prisma/schema.prisma`:

- `DIALER`
- `CLOSER`
- `MANAGER`
- `HR`
- `ADMIN`
- `CLIENT`

There is no generic `STAFF` or `TEAM_MEMBER` role in the schema. "Normal team user" currently means one of the concrete internal roles above.

### Shared auth helpers

Defined in `src/lib/apiAuth.ts`:

- `requireSalesManagerSession()` defines sales-manager authority
- `requirePlatformAdminSession()` defines platform-admin authority
- `requireManagerSession()` remains as a backwards-compatible sales-manager alias for existing manager/team APIs
- `requireStaffSession()` allows `MANAGER`, `HR`, or `ADMIN`
- client routes use `requireClientSession()`

### Capability layer

Defined in `src/lib/internalCapabilities.ts`:

- `hasSalesManagerCapability(role)`
- `hasPlatformAdminCapability(role)`
- `canAccessTeamOpsWorkspace(role)`
- `canAccessHrWorkspace(role)`

Current mapping:

- sales-manager capability: `MANAGER`, `ADMIN`
- platform-admin capability: explicit platform-admin grant or `ADMIN`

This keeps team operations and platform administration as separate responsibilities while still allowing `ADMIN` to retain umbrella access.

### Middleware boundary

Defined in `src/lib/proxy.ts`:

- `/app/hr` allows `HR`, `MANAGER`, `ADMIN`
- `/app/manager/admin` and `/app/manager/portal-overrides` are left to server-side grant checks so access changes do not depend on stale middleware role state
- `/app/manager/**` generally allows `MANAGER`, `HR`, `ADMIN`
- `DIALER` and `CLOSER` are redirected away from unauthorized internal sections

## Internal Role And Capability Matrix

| Base role / grant state | Internal team ops | Manager workspace | Platform admin nav | Platform-admin routes | Platform-admin mutations |
| --- | --- | --- | --- | --- | --- |
| `ADMIN` | Yes | Yes | Yes | Yes | Yes |
| `MANAGER` | Yes | Yes | No | No | No |
| Any internal employee with platform-admin grant | Base role unchanged | Base role unchanged | Yes | Yes | Yes |
| `HR` without grant | Yes | Partial manager staff surface only | No | No | No |
| `CLOSER` without grant | Closer-only | No | No | No | No |
| `DIALER` without grant | Dialer-only | No | No | No | No |
| `CLIENT` | No employee access | No | No | No | No |

## Nav Visibility Audit

### Static nav model

Defined in `src/components/AppTopNav.tsx`.

#### `DIALER`

Visible internal nav items:

- Leads
- Calls
- Appointments

#### `CLOSER`

Visible internal nav items:

- Meetings
- Availability

#### `HR`

Visible internal nav items:

- Candidates
- Interviews
- Employees
- Campaigns
- Leads
- Calls
- Appointments
- Employee invites
- Availability

Important nuance:

- `HR` is part of the shared manager/hr/admin shell and gets the `StaffViewSwitcher`.
- That means HR can click into `/app/manager` as a staff-facing manager workspace.
- HR does not receive the full manager nav.
- HR receives `managerItemsStaff`, which excludes `Platform admin`.

#### `MANAGER`

Visible internal nav items:

- Dashboard
- Employee invites
- Blogs
- Campaigns
- Ad approvals
- Leads
- Calls
- Appointments

#### Any granted internal employee

Visible internal nav items:

- Base-role navigation plus `Platform admin`
- Base-role navigation plus `Portal overrides`

#### `ADMIN`

Visible internal nav items:

- Same full manager nav as `MANAGER`
- Includes `Platform admin`
- Includes `Portal overrides`

### Runtime nav proof

Validated against the local app on `http://localhost:3000`.

- `ADMIN`: `Platform admin` visible
- `MANAGER`: `Platform admin` not visible
- `HR`: `Platform admin` not visible
- `CLOSER`: `Platform admin` not visible
- `DIALER`: `Platform admin` not visible

Code-level proof:

- Employees with a separate platform-admin grant receive a `Platform admin` link without changing their base role

## Direct Route Access Audit

Platform-admin routes audited:

- `/app/manager/admin`
- `/app/manager/portal-overrides`

### Runtime proof by role

| Role | `/app/manager/admin` | `/app/manager/portal-overrides` | Result |
| --- | --- | --- | --- |
| `ADMIN` | Allowed, heading `Platform admin` | Allowed, heading `Portal overrides` | Authorized |
| `MANAGER` | Redirected to `/app/manager` | Redirected to `/app/manager` | Denied |
| `HR` | Redirected to `/app/hr` | Redirected to `/app/hr` | Denied |
| `CLOSER` | Redirected to `/app/closer` | Redirected to `/app/closer` | Denied |
| `DIALER` | Redirected to `/app/dialer` | Redirected to `/app/dialer` | Denied |

A granted employee is allowed by code, and the grant can be managed from the Employees screen without changing the employee's base role.

### Route guard style

Platform-admin page routes use mixed enforcement:

- middleware guard in `src/lib/proxy.ts`
- page-level `getServerSession()` role checks in:
  - `src/app/app/manager/admin/page.tsx`
  - `src/app/app/manager/portal-overrides/page.tsx`

## API Mutation Access Audit

### Platform-admin/account-ops API routes audited

Account/platform operations:

- `src/app/api/manager/portal/overrides/route.ts`
- `src/app/api/manager/portal/credits/gift/route.ts`
- `src/app/api/manager/portal/billing-model/route.ts`
- `src/app/api/manager/portal/users/[ownerId]/route.ts`
- `src/app/api/manager/portal/seed-demo/route.ts`
- `src/app/api/manager/portal/seed-credit-demo/route.ts`
- `src/app/api/manager/portal/seed-ai-receptionist/route.ts`
- `src/app/api/manager/portal/user-details/route.ts`
- `src/app/api/manager/portal/beta-feedback/route.ts`

Platform-support utilities exposed from Platform admin:

- `src/app/api/manager/tutorial-videos/route.ts`
- `src/app/api/manager/tutorial-photos/route.ts`
- `src/app/api/manager/test-email/route.ts`

### Guard model

The audited account-ops mutation endpoints consistently enforce the named platform-admin capability.

Patterns used:

- local `requirePlatformAdmin(session)` helper inside route files
- shared `requirePlatformAdminSession()` from `src/lib/apiAuth.ts`

### Runtime mutation proof by role

Safe invalid-payload POSTs were sent to these endpoints so auth could be tested without mutating data:

- `/api/manager/portal/overrides`
- `/api/manager/portal/credits/gift`
- `/api/manager/portal/billing-model`
- `/api/manager/portal/seed-demo`
- `/api/manager/db-status`

Results:

| Role | Overrides | Credits gift | Billing model | Seed demo | DB status | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| `ADMIN` | `200` | `400 Invalid payload` | `400 Invalid payload` | `200` | `200` | Auth passed |
| `MANAGER` | `403 Forbidden` | `403 Forbidden` | `403 Forbidden` | `403 Forbidden` | `403 Forbidden` | Platform-admin access denied |
| `HR` | `403 Forbidden` | `403 Forbidden` | `403 Forbidden` | Not re-run in final pass | Not re-run in final pass | Denied by same guard model |
| `CLOSER` | `403 Forbidden` | `403 Forbidden` | `403 Forbidden` | Not re-run in final pass | Not re-run in final pass | Denied by same guard model |
| `DIALER` | `403 Forbidden` | `403 Forbidden` | `403 Forbidden` | Not re-run in final pass | Not re-run in final pass | Denied by same guard model |

This satisfies the boundary for sales-manager/team-ops roles while preserving `ADMIN` platform authority.

## Platform-Admin Surfaces Grouped By Product Meaning

### Internal sales/team operations

These belong in the manager/team workspace:

- dialer leads/calls/appointments
- closer meetings/availability
- HR candidates/interviews/employees
- internal invites
- team workflow
- future KPIs/commissions

### Platform administration/account operations

These belong in platform admin:

- Portal Overrides
- entitlement overrides
- credits gifting
- billing-model overrides
- client account deletion tombstones
- demo seeding
- tutorial asset management
- platform support/admin utilities

## Findings

### No active exposure found for sales-only roles

The current codebase does not expose platform-admin/account-ops tools to:

- `DIALER`
- `CLOSER`
- `HR`

Those roles are blocked at all of the relevant layers:

- nav visibility
- middleware
- page route guards
- API mutation guards

### `HR` can reach the manager workspace, but not platform admin

This is intentional in the current implementation:

- `HR` is allowed into `/app/manager/**`
- `HR` gets the staff manager subset, not the full manager nav
- `HR` is blocked from `/app/manager/admin`
- `HR` is blocked from `/app/manager/portal-overrides`
- `HR` is blocked from platform-admin mutation APIs

That is a product decision about shared team-ops workflow, not a platform-admin exposure.

### `MANAGER` is now separate from platform admin

`MANAGER` now means internal sales/team manager only.

Platform-admin/account operations require either:

- an explicit platform-admin grant
- `ADMIN`

That removes the earlier role-model ambiguity from authorization.

## Finalized Access Split

This pass implemented the access split directly:

- `DIALER`
- `CLOSER`
- `HR`
- `MANAGER`
- `ADMIN`

Platform-admin authority is now a separate admin-managed grant layered on top of those base roles.

Effective policy now:

- keep platform-admin tools grouped only under `/app/manager/admin`
- do not expose platform-admin/account-ops links as peer workflow items in the main manager nav for `MANAGER`
- treat `ADMIN` as the umbrella role and the platform-admin grant as the scoped platform/account-ops control

## Fixes Made In This Pass

Small code changes were made.

Reason:

- the capability split needed a reusable source of truth before removing `MANAGER` access
- platform-admin nav, route guards, middleware checks, and account-ops APIs now resolve through explicit platform-admin helpers
- platform-admin access is now managed separately from onboarding invites and base employee roles

## Remaining Risks

- the new grant-management UI still needs a focused runtime pass after the raw-SQL grant table is created in the live dev DB
- `HR` can enter the staff manager workspace, which is acceptable for current team ops but should stay clearly separated from platform-admin surfaces
- the prompt referenced `docs/platform-improvement-prompt-tracker.md`, but that file does not exist in this workspace, so no tracker update was made

## Validation Summary

Roles runtime-tested:

- `ADMIN`
- `MANAGER`
- `HR`
- `CLOSER`
- `DIALER`

Additional surface added in this pass:

- admin-only platform-admin grant controls on the Employees screen

Validation performed:

- local login/nav proof by role
- direct URL attempts against platform-admin routes
- safe invalid-payload mutation attempts against platform-admin APIs
- static guard audit of middleware, page routes, and API handlers
- `npx tsc --noEmit`

Environment limitation encountered during finalization:

- Prisma DB update failed in shell with `P1001: Can't reach database server`
- Prisma client regeneration failed in shell with a Windows `EPERM` rename error

No Pura/chat files or behavior were changed.
