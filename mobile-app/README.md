# Purely Mobile App (separate from web)

This folder is a **completely separate** mobile app project (React Native + Expo + TypeScript).

## Separation rules (non-negotiable)

- **Do not import from the web app** (no `src/`, no `@/`, no `next/*`, no Prisma).
- **Do not change existing portal/credit/employee/landing code** to “make mobile work”.
- **No shared paths**: everything mobile lives under `mobile-app/`.
- Any work in here should be runnable by doing `cd mobile-app` and using the scripts in *this* folder.

If you ever see an import that reaches outside `mobile-app/`, treat it as a bug.

## What this is right now

This is a **prepared scaffold** so we can build a mobile version of the same product UX without risking the current web app.

It includes:
- Expo + React Native TypeScript project structure
- A tiny app shell (`App.tsx`) that loads `src/App.tsx`
- A placeholder feature layout for: Tutorials, Funnel Builder, Inbox, People, Booking
- A small API client stub that will later point at the same backend

## Setup (when you’re ready)

From repo root:

```bash
cd mobile-app
npm install
npm run start
```

Then press:
- `i` for iOS simulator (macOS only)
- `a` for Android emulator
- or scan the QR with Expo Go

## Environment

Copy the example env file:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL` to your backend base URL.

## Next steps (once you provide visual aid)

- Build the navigation structure to match the portal
- Implement auth/session
- Mirror key flows: inbox threads, contacts, booking, funnels/forms
- Add offline-friendly caching and push notifications (if desired)
