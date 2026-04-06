import type { PortalAgentActionKey } from "@/lib/portalAgentActions";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

const safeStr = (v: unknown, max = 120): string => {
  if (typeof v !== "string") return "";
  return v.trim().replace(/[\r\n\t]+/g, " ").slice(0, max);
};

export function summarizeIdsFromArgs(args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (k === "id" || k.endsWith("Id")) {
      const s = safeStr(v, 120);
      if (s) out[k] = s;
      continue;
    }
    if (k.endsWith("Ids") && Array.isArray(v)) {
      const ids = (v as unknown[])
        .map((x) => safeStr(x, 60))
        .filter(Boolean)
        .slice(0, 4);
      if (ids.length) out[k] = ids.join(",");
    }
  }
  return out;
}

function pickArray(result: Record<string, unknown>, key: string): any[] {
  const v = (result as any)[key];
  return Array.isArray(v) ? v : [];
}

function pickLabel(obj: Record<string, unknown>): string {
  return (
    safeStr(obj.label, 120) ||
    safeStr(obj.name, 120) ||
    safeStr(obj.title, 120) ||
    safeStr(obj.slug, 120) ||
    safeStr(obj.fileName, 120) ||
    safeStr(obj.tag, 120) ||
    safeStr(obj.email, 120) ||
    safeStr(obj.phone, 120) ||
    ""
  );
}

function previewList<T>(arr: any[], mapFn: (x: any) => T | null): T[] {
  if (!Array.isArray(arr) || !arr.length) return [];
  const out: T[] = [];
  for (const it of arr.slice(0, 8)) {
    const mapped = mapFn(it);
    if (mapped) out.push(mapped);
  }
  return out;
}

export function previewResultForPlanner(action: PortalAgentActionKey, result: any): any {
  try {
    if (!isPlainObject(result)) return null;
    if ((result as any).ok !== true) return null;

    // Funnel builder
    if (action === "funnel_builder.funnels.list") {
      const funnels = previewList(pickArray(result, "funnels"), (f: any) => {
        if (!isPlainObject(f)) return null;
        const id = safeStr((f as any).id, 120);
        if (!id) return null;
        const name = safeStr((f as any).name, 120);
        const slug = safeStr((f as any).slug, 120);
        const updatedAt = safeStr((f as any).updatedAt, 80);
        return { id, name: name || undefined, slug: slug || undefined, updatedAt: updatedAt || undefined };
      });
      return funnels.length ? { funnels } : null;
    }

    if (action === "funnel_builder.pages.list") {
      const pages = previewList(pickArray(result, "pages"), (p: any) => {
        if (!isPlainObject(p)) return null;
        const id = safeStr((p as any).id, 120);
        if (!id) return null;
        const title = safeStr((p as any).title, 120);
        const slug = safeStr((p as any).slug, 120);
        const funnelId = safeStr((p as any).funnelId, 120);
        const updatedAt = safeStr((p as any).updatedAt, 80);
        return {
          id,
          title: title || undefined,
          slug: slug || undefined,
          funnelId: funnelId || undefined,
          updatedAt: updatedAt || undefined,
        };
      });
      return pages.length ? { pages } : null;
    }

    if (action === "funnel_builder.forms.list") {
      const forms = previewList(pickArray(result, "forms"), (f: any) => {
        if (!isPlainObject(f)) return null;
        const id = safeStr((f as any).id, 120);
        if (!id) return null;
        const name = safeStr((f as any).name, 120);
        const slug = safeStr((f as any).slug, 120);
        const funnelId = safeStr((f as any).funnelId, 120);
        return { id, name: name || undefined, slug: slug || undefined, funnelId: funnelId || undefined };
      });
      return forms.length ? { forms } : null;
    }

    // Tasks
    if (action === "tasks.list") {
      const tasks = previewList(pickArray(result, "tasks"), (t: any) => {
        if (!isPlainObject(t)) return null;
        const id = safeStr((t as any).id, 120);
        if (!id) return null;
        const title = safeStr((t as any).title, 160);
        const status = safeStr((t as any).status, 40);
        const dueAtIso = safeStr((t as any).dueAtIso, 40);
        const assignedName = isPlainObject((t as any).assignedTo) ? safeStr((t as any).assignedTo.name, 120) : "";
        return { id, title: title || undefined, status: status || undefined, dueAtIso: dueAtIso || undefined, assignedTo: assignedName || undefined };
      });
      return tasks.length ? { tasks } : null;
    }

    if (action === "tasks.assignees.list") {
      const members = previewList(pickArray(result, "members"), (m: any) => {
        if (!isPlainObject(m)) return null;
        const userId = safeStr((m as any).userId, 120);
        if (!userId) return null;
        const role = safeStr((m as any).role, 40);
        const user = isPlainObject((m as any).user) ? (m as any).user : null;
        const name = user ? safeStr(user.name, 120) : "";
        const email = user ? safeStr(user.email, 120) : "";
        return { userId, role: role || undefined, name: name || undefined, email: email || undefined };
      });
      return members.length ? { members } : null;
    }

    // Stripe
    if (action === "funnel_builder.sales.products.list") {
      const products = previewList(pickArray(result, "products"), (p: any) => {
        if (!isPlainObject(p)) return null;
        const id = safeStr((p as any).id, 120);
        if (!id) return null;
        const name = safeStr((p as any).name, 120);
        const active = typeof (p as any).active === "boolean" ? (p as any).active : undefined;
        const dp = isPlainObject((p as any).defaultPrice) ? (p as any).defaultPrice : null;
        const defaultPrice = dp
          ? {
              unitAmount: typeof (dp as any).unitAmount === "number" ? (dp as any).unitAmount : undefined,
              currency: safeStr((dp as any).currency, 12) || undefined,
            }
          : undefined;
        return { id, name: name || undefined, active, defaultPrice };
      });
      return products.length ? { products } : null;
    }

    // Blogs
    if (action === "blogs.posts.list") {
      const posts = previewList(pickArray(result, "posts"), (p: any) => {
        if (!isPlainObject(p)) return null;
        const id = safeStr((p as any).id, 120);
        if (!id) return null;
        const title = safeStr((p as any).title, 180);
        const slug = safeStr((p as any).slug, 120);
        const status = safeStr((p as any).status, 60);
        const updatedAt = safeStr((p as any).updatedAt, 80);
        return { id, title: title || undefined, slug: slug || undefined, status: status || undefined, updatedAt: updatedAt || undefined };
      });
      return posts.length ? { posts } : null;
    }

    // Media
    if (action === "media.folders.list") {
      const folders = previewList(pickArray(result, "folders"), (f: any) => {
        if (!isPlainObject(f)) return null;
        const id = safeStr((f as any).id, 120);
        if (!id) return null;
        const name = safeStr((f as any).name, 120);
        const parentId = safeStr((f as any).parentId, 120);
        const tag = safeStr((f as any).tag, 80);
        const createdAt = safeStr((f as any).createdAt, 80);
        return { id, name: name || undefined, parentId: parentId || undefined, tag: tag || undefined, createdAt: createdAt || undefined };
      });
      return folders.length ? { folders } : null;
    }

    if (action === "media.items.list") {
      const items = previewList(pickArray(result, "items"), (it: any) => {
        if (!isPlainObject(it)) return null;
        const id = safeStr((it as any).id, 120);
        if (!id) return null;
        const fileName = safeStr((it as any).fileName, 140);
        const folderId = safeStr((it as any).folderId, 120);
        const tag = safeStr((it as any).tag, 80);
        const createdAt = safeStr((it as any).createdAt, 80);
        const openUrl = safeStr((it as any).openUrl, 200);
        return { id, fileName: fileName || undefined, folderId: folderId || undefined, tag: tag || undefined, createdAt: createdAt || undefined, openUrl: openUrl || undefined };
      });
      return items.length ? { items } : null;
    }

    // Tags
    if (action === "contacts.tags.list") {
      const tags = previewList(pickArray(result, "tags"), (t: any) => {
        if (!isPlainObject(t)) return null;
        const id = safeStr((t as any).id, 120);
        const label = pickLabel(t);
        if (!id && !label) return null;
        return { id: id || undefined, label: label || undefined };
      });
      return tags.length ? { tags } : null;
    }

    // Generic fallback: surface the first list-ish array with id + label.
    const listKeys = [
      "funnels",
      "pages",
      "forms",
      "tasks",
      "products",
      "posts",
      "folders",
      "items",
      "members",
      "tags",
      "contacts",
      "automations",
      "bookings",
      "threads",
    ];
    for (const key of listKeys) {
      const arr = pickArray(result, key);
      if (!arr.length) continue;
      const entries = previewList(arr, (x: any) => {
        if (!isPlainObject(x)) return null;
        const id = safeStr((x as any).id, 120) || safeStr((x as any).userId, 120);
        const label = pickLabel(x);
        if (!id && !label) return null;
        return { id: id || undefined, label: label || undefined };
      });
      if (entries.length) return { [key]: entries };
    }
  } catch {
    // best-effort
  }

  return null;
}
