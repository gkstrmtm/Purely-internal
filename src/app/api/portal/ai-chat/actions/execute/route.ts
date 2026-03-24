import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import {
  PortalAgentActionKeySchema,
  PortalAgentActionArgsSchemaByKey,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    threadId: z.string().trim().min(1).max(120),
    action: PortalAgentActionKeySchema,
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function asJson(res: Response) {
  return res.json().catch(() => null) as Promise<any>;
}

async function runDelegatedAction(action: PortalAgentActionKey, args: Record<string, unknown>) {
  switch (action) {
    case "tasks.create": {
      const mod = await import("@/app/api/portal/tasks/route");
      const req = new Request("https://local/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const res = await mod.POST(req);
      return { status: res.status, json: await asJson(res), res };
    }

    case "funnel.create": {
      const mod = await import("@/app/api/portal/funnel-builder/funnels/route");
      const req = new Request("https://local/portal/funnel-builder/funnels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const res = await mod.POST(req);
      return { status: res.status, json: await asJson(res), res };
    }

    case "blogs.generate_now": {
      const mod = await import("@/app/api/portal/blogs/automation/generate-now/route");
      // Handler has no Request param.
      const res = await mod.POST();
      return { status: res.status, json: await asJson(res), res };
    }

    case "newsletter.generate_now": {
      const mod = await import("@/app/api/portal/newsletter/automation/generate-now/route");
      const req = new Request("https://local/portal/newsletter/automation/generate-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const res = await mod.POST(req);
      return { status: res.status, json: await asJson(res), res };
    }

    case "automations.run": {
      const mod = await import("@/app/api/portal/automations/run/route");
      const req = new Request("https://local/portal/automations/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const res = await mod.POST(req);
      return { status: res.status, json: await asJson(res), res };
    }
  }
}

function resultMarkdown(action: PortalAgentActionKey, json: any): { markdown: string; linkUrl?: string } {
  if (action === "tasks.create" && json?.ok && json?.taskId) {
    return {
      markdown: `Created a task.\n\n[Open tasks](/portal/app/tasks)`,
      linkUrl: "/portal/app/tasks",
    };
  }

  if (action === "funnel.create" && json?.ok && json?.funnel?.id) {
    const id = String(json.funnel.id);
    const url = `/portal/app/services/funnel-builder/funnels/${encodeURIComponent(id)}/edit`;
    return {
      markdown: `Created a funnel.\n\n[Open funnel editor](${url})`,
      linkUrl: url,
    };
  }

  if (action === "blogs.generate_now" && json?.ok && json?.postId) {
    return {
      markdown: `Generated a blog draft.\n\n[Open blogs](/portal/app/services/blogs)`,
      linkUrl: "/portal/app/services/blogs",
    };
  }

  if (action === "newsletter.generate_now" && json?.ok && json?.newsletterId) {
    return {
      markdown: `Generated a newsletter draft.\n\n[Open newsletter](/portal/app/services/newsletter)`,
      linkUrl: "/portal/app/services/newsletter",
    };
  }

  if (action === "automations.run" && json?.ok) {
    return {
      markdown: `Triggered the automation run.\n\n[Open automations](/portal/app/services/automations)`,
      linkUrl: "/portal/app/services/automations",
    };
  }

  const err = typeof json?.error === "string" ? json.error : typeof json?.message === "string" ? json.message : null;
  return { markdown: err ? `Action failed: ${err}` : "Action finished." };
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const threadId = parsed.data.threadId;

  const thread = await (prisma as any).portalAiChatThread.findFirst({ where: { id: threadId, ownerId }, select: { id: true } });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const action = parsed.data.action;
  const argsRaw = parsed.data.args ?? {};

  const argsSchema = PortalAgentActionArgsSchemaByKey[action];
  const argsParsed = argsSchema.safeParse(argsRaw);
  if (!argsParsed.success) return NextResponse.json({ ok: false, error: "Invalid action args" }, { status: 400 });

  // Execute by delegating to existing API handlers (keeps auth/credits logic in one place).
  const { json, status } = await runDelegatedAction(action as PortalAgentActionKey, argsParsed.data as any);
  const { markdown, linkUrl } = resultMarkdown(action, json);

  const now = new Date();
  const assistantMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId,
      threadId,
      role: "assistant",
      text: markdown,
      attachmentsJson: null,
      createdByUserId: null,
      sendAt: null,
      sentAt: now,
    },
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
    },
  });

  await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { lastMessageAt: now } });

  return NextResponse.json({ ok: status >= 200 && status < 300, action, result: json, assistantMessage: assistantMsg, linkUrl });
}
