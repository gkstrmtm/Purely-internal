# Retro Session Changes — 2026-05-08

Changes made in this session, grouped by surface. Ready to commit to the retro branch.

---

## Funnel Editor — Boot & Loading Polish (`FunnelEditorClient.tsx`)

### Layout shift eliminated on load
- Added `layoutFadeIn` state (alongside existing `layoutBootSettled`).
- `useLayoutEffect` sets `chatRailOpen`, `sidebarCollapsed`, and `layoutBootSettled` synchronously — grid snaps to its correct column count while `opacity: 0`.
- `useEffect` watching `layoutBootSettled` sets `layoutFadeIn` after the first post-boot paint, triggering a 200ms fade-in. Result: no visible column jump from 2-col → 3-col when the chat rail opens.
- Transition table: boot phase = 0ms/0ms, fade-in phase = 0ms grid / 200ms opacity, normal operation = 320ms grid / 0ms opacity.

### Loading skeleton redesigned
- Removed `FunnelEditorLoadingGlassBlock` (glass containers nested inside glass containers — visually noisy).
- Introduced `SkeletonBar` — a single `<div class="pa-skeleton rounded-lg" />` using a CSS-only shimmer.
- `FunnelEditorLoadingSidebar`: flat label + row skeleton list, no wrapper cards.
- `FunnelEditorLoadingCanvas`: clean white card with border, then skeleton bars at heading/body/CTA/image proportions — matches real preview frame geometry.
- `FunnelEditorLoadingChatRail`: flat bars for header identity, message list, composer area.
- All loading states now structurally match the settled editor panes.

### Content paint-in transition
- Added `pa-content-enter` CSS class (380ms `cubic-bezier(0.22, 1, 0.36, 1)` fade).
- Applied to the canvas branch, whole-page branch, and chat rail content branch — each fires when `selectedPage` becomes truthy (the loading → loaded handoff).
- Eliminates the frame-sharp snap when data arrives.

---

## Global CSS (`globals.css`)

### Shimmer animation
- `pa-skeleton-sweep` keyframe: speed slowed from 1.5s to 2.8s linear (was `ease-in-out`, which strobes).
- Gradient widened and softened: peak at 200px over 1200px travel range instead of 120px/800px.
- Result: calm, barely-perceptible shimmer that doesn't distract.

### Fade-in utility
- `pa-fade-in` keyframe + `pa-content-enter` class added for content mount transitions.

---

## 404 Page (`src/app/not-found.tsx`)

- Created `not-found.tsx` at app root — replaces Next.js default unstyled 404.
- Design matches existing `AppCrashFallback`: dark zinc-950 background, frosted card, "404" label, "Page not found." heading.
- Two actions: "Go home" (→ `/`) and "Open portal" (→ `/credit/app`).
- `metadata` export sets a proper page title.

---

## Files Modified in This Session (relevant to above)

| File | Change |
|------|--------|
| `src/app/globals.css` | Shimmer animation, `pa-content-enter` |
| `src/app/not-found.tsx` | New file — custom 404 page |
| `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx` | Boot fix, loading skeleton redesign, fade-in transitions |

---

## Notes for Deploy

- `not-found.tsx` is currently untracked — needs `git add src/app/not-found.tsx` before commit.
- No schema changes. No new environment variables. No new dependencies.
- All pre-existing lint warnings unchanged — no new errors introduced.
