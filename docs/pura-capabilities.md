# Pura (Portal AI) – Capabilities & Limits

This is a human-written overview of what Pura can actually do in the portal today.

## How Pura “does things”

Pura operates in two ways:

1) **Direct portal actions (server-side tools)**
- Pura can call a large set of first-party portal actions (CRUD + workflows) implemented in `src/lib/portalAgentActionExecutor.ts`.
- These actions map closely to `/api/portal/...` endpoints.

2) **UI automation via the Work canvas (browser-side)**
- Pura can queue UI actions that run inside your browser in the Work canvas iframe:
  - `ui.canvas.click`, `ui.canvas.type`, `ui.canvas.select`, `ui.canvas.set_checked`, `ui.canvas.scroll`, `ui.canvas.wait`
- The chat backend returns `clientUiActions`, and the portal client executes them in `PortalAiChatClient.tsx`.

This canvas path is the foundation for “Pura can do anything a user can do” (when there is no direct API tool for a UI operation).

## Uploaded files ("use this as inspiration")

- **Images**: When you attach images to a chat message, Pura can visually interpret them (image URLs are passed into the planner/model).
- **Text-like files**: When you attach a file that looks like text (e.g. `.txt`, `.md`, `.csv`, `.json`, `.yaml`, etc.), Pura ingests the text content and uses it as context for planning and generating portal changes.
- **PDF/DOCX** (best-effort): Pura will attempt to extract raw text from `.pdf` and `.docx` uploads (size-limited). If extraction fails, the attachment is ignored.

Implementation: the AI-chat messages route extracts text from Media Library-backed attachments and appends it to the planner prompt.

## Key feature areas covered by tools

This is not exhaustive (see the action index text in `src/lib/portalAgentActions.ts`), but highlights the big areas you called out:

- **Funnel Builder**: create/update funnels, pages, forms, domains; generate/export HTML; generate custom code blocks.
- **AI Outbound Calls**: create/update campaigns; enroll contacts; manual calls; activity; knowledge base sync/upload; agent config generation; ElevenLabs sync.
- **AI Receptionist**: get/update settings; refresh/delete call events; recordings; generate/polish text; preview SMS replies; knowledge base sync/upload.
- **AI Receptionist highlights**: Pura can generate a quick "anything important?" status summary from recent call events + current configuration.
- **Tasks**: list/create/update tasks and assignees.
- **Inbox**: list threads/messages; send email/SMS; schedule messages; upload attachments.
- **Media Library**: list/move/update/delete items and folders; import remote images; create from blob.

## Where to verify

- **Declared actions + schemas**: `src/lib/portalAgentActions.ts`
- **Action implementations**: `src/lib/portalAgentActionExecutor.ts`
- **Planner routing**: `src/lib/puraPlanner.ts`
- **$ref/entity resolution**: `src/lib/puraResolver.ts`
- **AI chat entrypoint**: `src/app/api/portal/ai-chat/threads/[threadId]/messages/route.ts`
- **Work canvas execution**: `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
