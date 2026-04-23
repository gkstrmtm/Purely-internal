# Funnel Page Graph Foundation

## What This Slice Introduced

This change adds a non-breaking page-graph adapter at [src/lib/funnelPageGraph.ts](c:/Users/tabar/Purely-internal/src/lib/funnelPageGraph.ts).

The adapter does not replace the database schema yet. It derives one canonical page-draft model from the current legacy fields:

- `editorMode`
- `blocksJson`
- `customHtml`
- `draftHtml`
- `contentMarkdown`

It defines a single derived model with:

- `sourceMode`: `managed`, `custom-html`, or `markdown`
- `managedBlocks`
- `html.published`
- `html.draft`
- `html.current`
- `markdown`
- capability flags for layout, source editing, managed modules, and scoped AI edits

## What Now Uses It

The following paths now resolve through the adapter instead of branching directly on rival fields:

- [src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/funnelEditorPageWorkflow.ts](c:/Users/tabar/Purely-internal/src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/funnelEditorPageWorkflow.ts)
- [src/app/credit/f/[slug]/page.tsx](c:/Users/tabar/Purely-internal/src/app/credit/f/[slug]/page.tsx)
- [src/app/domain-router/[domain]/[[...path]]/page.tsx](c:/Users/tabar/Purely-internal/src/app/domain-router/[domain]/[[...path]]/page.tsx)
- [src/app/f/[slug]/[key]/page.tsx](c:/Users/tabar/Purely-internal/src/app/f/[slug]/[key]/page.tsx)

## Why This Matters

This is the first implementation step toward one real page draft without forcing a migration immediately.

Before this slice, core render and workflow paths still made their own decisions directly from `editorMode`, `blocksJson`, and `customHtml`.
After this slice, those paths can start converging on one adapter that expresses the intended contract:

- public renderers ask for a published render state
- editor workflow asks what kind of draft it is working with
- future AI and preview code can ask the same adapter instead of inventing another branch

## What This Does Not Solve Yet

- There is still no persisted canonical page graph in the schema.
- `FunnelEditorClient.tsx` still contains many local mode-specific decisions that should move behind shared helpers.
- API routes still persist legacy fields directly and should eventually write through a more explicit draft model.
- Preview, diff, and AI mutation planning are not graph-backed yet.

## Recommended Next Slice

1. Expand the adapter into a shared draft contract used by `FunnelEditorClient.tsx` selection, preview, and conversion logic.
2. Add a mutation envelope so AI and UI actions can describe typed page changes instead of patching raw fields ad hoc.
3. Introduce an explicit managed vs advanced/unmanaged page boundary so freeform HTML remains possible without pretending to round-trip cleanly.