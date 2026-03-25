import { prisma } from "@/lib/db";
import {
  PortalAgentActionArgsSchemaByKey,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";

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

export async function executePortalAgentActionForThread(opts: {
  ownerId: string;
  threadId: string;
  action: PortalAgentActionKey;
  args: Record<string, unknown>;
}) {
  const argsSchema = PortalAgentActionArgsSchemaByKey[opts.action];
  const argsParsed = argsSchema.safeParse(opts.args);
  if (!argsParsed.success) {
    return { ok: false as const, status: 400, error: "Invalid action args" };
  }

  const { json, status } = await runDelegatedAction(opts.action, argsParsed.data as any);
  const { markdown, linkUrl } = resultMarkdown(opts.action, json);

  const now = new Date();
  const assistantMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId: opts.ownerId,
      threadId: opts.threadId,
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

  await (prisma as any).portalAiChatThread.update({ where: { id: opts.threadId }, data: { lastMessageAt: now } });

  return {
    ok: status >= 200 && status < 300,
    status,
    action: opts.action,
    result: json,
    assistantMessage: assistantMsg,
    linkUrl,
  };
}
