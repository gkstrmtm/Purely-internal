# Purely Mobile App (separate from web)

This folder is a **completely separate** mobile app project (React Native + Expo + TypeScript).

## Separation rules (non-negotiable)

- **Do not import from the web app** (no `src/`, no `@/`, no `next/*`, no Prisma).
- **Do not change existing portal/credit/employee/landing code** to “make mobile work”.
- **No shared paths**: everything mobile lives under `mobile-app/`.
- Any work in here should be runnable by doing `cd mobile-app` and using the scripts in *this* folder.

If you ever see an import that reaches outside `mobile-app/`, treat it as a bug.

## Portal source-of-truth (do not change)

This is the **source-of-truth Portal deployment URL from before mobile app work**:

- https://purely-internal-i5d62brbc-tabari-ropers-projects-6f2e090b.vercel.app

Hard rule:
- **Never change** the existing Vercel project that deploys the repo root (Next.js portal).
- The mobile app must always be deployed as a **separate** Vercel project with **Root Directory = `mobile-app`**.

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

## View in a browser (GitHub → Vercel)

If you want to **view this in a browser** (and use Chrome device emulation), deploy it as a **separate Vercel project** that points at this folder.

1) Push the branch you want to view to GitHub

2) In Vercel:
- Click **Add New… → Project**
- Import the same GitHub repo
- In **Project Settings**, set **Root Directory** to `mobile-app`

3) Build settings

You can leave them default if Vercel picks them up, but the expected values are:
- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

These are also defined in `mobile-app/vercel.json` (as long as the project Root Directory is `mobile-app`).

4) Environment Variables (optional now, required later)

Add `EXPO_PUBLIC_API_BASE_URL` in the Vercel project env vars (Preview + Production) when you’re ready to connect to the backend.

5) Deploy

After deploy, open the Vercel URL and in Chrome use:
- **DevTools → Toggle Device Toolbar** (mobile emulator)

Important: this does **not** change or deploy your existing Next.js web app unless you point a Vercel project at the repo root. Keep this project’s Root Directory set to `mobile-app`.

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
