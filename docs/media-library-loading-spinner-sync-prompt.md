Use this exact prompt when asking another developer to port the current Media Library loading treatment into a different branch.

```text
Please pull the current Media Library loading state from my branch into your branch exactly, without redesigning it.

Goal:
- Preserve the current loading spinner treatment and its visual tone inside the Media Library page.
- Do not restyle the whole Media Library.
- Do not introduce a different spinner system, skeleton system, or a louder loading card.

What to copy:
- The loading block in src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx around the main library body.
- The InlineSpinner usage and styling as currently implemented.

The target loading UI should remain:
- A rounded card container.
- Classes: rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600
- Inner row: flex items-center gap-3
- Spinner: <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
- Text label: Loading media library

Important constraints:
- Keep the current neutral zinc palette.
- Keep the spacing and radius exactly in-family with the rest of the page.
- No flashy skeletons, no full-page blocking overlay, no new background effects.
- If your branch already improved fetch logic, keep that logic, but preserve this exact loading presentation.
- If there is a content calendar branch divergence, only port the loading presentation and any minimal supporting imports.

Acceptance check:
- When the Media Library is loading, I should see the same subtle rounded loading card with the small gray spinner and the text “Loading media library”.
- It should feel identical to the current branch, not “inspired by” it.
```

Reference source:
- src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx
- src/components/InlineSpinner.tsx