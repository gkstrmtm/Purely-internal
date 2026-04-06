import { slugify } from "@/lib/slugify";

export type PortalAiChatThreadRefInput = {
  id: string;
  title?: string | null;
};

export function buildPortalAiChatThreadRef(thread: PortalAiChatThreadRefInput): string {
  const id = String(thread.id || "").trim();
  if (!id) return "";
  const slug = slugify(String(thread.title || "").trim()).slice(0, 60);
  return slug ? `${slug}--${id}` : id;
}

export function parsePortalAiChatThreadRef(threadRefRaw: string | null | undefined): string | null {
  const threadRef = String(threadRefRaw || "").trim();
  if (!threadRef) return null;
  const splitToken = "--";
  const splitIndex = threadRef.lastIndexOf(splitToken);
  const candidate = splitIndex >= 0 ? threadRef.slice(splitIndex + splitToken.length).trim() : threadRef;
  return candidate || null;
}

export function buildPortalAiChatThreadHref(opts: {
  basePath?: string;
  thread?: PortalAiChatThreadRefInput | null;
}): string {
  const basePath = String(opts.basePath || "/portal").trim() || "/portal";
  const baseHref = `${basePath}/app/ai-chat`;
  if (!opts.thread?.id) return baseHref;
  const ref = buildPortalAiChatThreadRef(opts.thread);
  return ref ? `${baseHref}/${encodeURIComponent(ref)}` : baseHref;
}
