# Mobile push notifications (Expo)

This repo uses Expo push notifications.

## What’s implemented

- Mobile app registers an Expo push token after portal login.
- Server stores tokens in `PortalDeviceToken` and sends pushes best-effort via `expo-server-sdk`.
- Push sending is wired into `src/lib/portalNotifications.ts` so many portal events automatically fan out.
- Push payload includes `data.path` for common kinds (Inbox / Tasks) so tapping a push can deep-link inside the mobile shell.

## Required Expo config

`expo-notifications` typically needs an EAS `projectId` at runtime. The app reads it from:

- `Constants.expoConfig.extra.eas.projectId` (preferred)
- `Constants.easConfig.projectId`

Make sure your `mobile-app/app.json` (or `app.config.*`) includes it.

## Database schema

A Prisma model was added in `prisma/schema.prisma`:

- `PortalDeviceToken` (stores `expoPushToken` per user/device)

### Applying the table

If `prisma migrate dev` is blocked by drift in your database, you can still apply this one table manually.

Postgres SQL (Supabase-compatible):

```sql
create table if not exists "PortalDeviceToken" (
  "id" text primary key,
  "userId" text not null,
  "expoPushToken" text not null,
  "platform" text,
  "deviceName" text,
  "lastSeenAt" timestamp(3),
  "revokedAt" timestamp(3),
  "createdAt" timestamp(3) not null default now(),
  "updatedAt" timestamp(3) not null default now(),
  constraint "PortalDeviceToken_userId_fkey" foreign key ("userId") references "User"("id") on delete cascade,
  constraint "PortalDeviceToken_expoPushToken_key" unique ("expoPushToken")
);

create index if not exists "PortalDeviceToken_userId_revokedAt_idx" on "PortalDeviceToken"("userId", "revokedAt");
create index if not exists "PortalDeviceToken_expoPushToken_idx" on "PortalDeviceToken"("expoPushToken");
```

Notes:
- Prisma uses `@default(cuid())` for `id`, so the application generates it; the SQL above does not add a DB-side default.
- The API route `POST /api/portal/push/register` returns `503` if the table is missing.

## Local verification

- Start the server: `npm run dev`
- Start mobile: `cd mobile-app && npm run start`
- Log into the portal in the app.
- Confirm a row exists in `PortalDeviceToken` for your user.
- Trigger an event that already uses `tryNotifyPortalAccountUsers` (e.g. inbound SMS) and verify a push is delivered.
