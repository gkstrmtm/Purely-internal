"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";
import { PublicReviewsClient } from "@/app/[siteSlug]/reviews/PublicReviewsClient";
import { IconSend, IconSendHover } from "@/app/portal/PortalIcons";
import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import { AiSparkIcon } from "@/components/AiSparkIcon";
import { AppModal } from "@/components/AppModal";
import { HostedBlogArchiveSection } from "@/components/hosted/HostedBlogArchiveSection";
import { HostedBlogPostArticle } from "@/components/hosted/HostedBlogPostArticle";
import { HostedNewsletterArchive } from "@/components/hosted/HostedNewsletterArchive";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { coerceBlocksJson, renderCreditFunnelBlocks, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { hostedTemplateStyleDescription, resolveHostedTemplatePageKey } from "@/lib/hostedPageTemplateIntents";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

type HostedEditorService = "BOOKING" | "NEWSLETTER" | "REVIEWS" | "BLOGS";

type HostedPageDocument = {
  id: string;
  service: HostedEditorService;
  pageKey: string;
  title: string;
  slug: string | null;
  status: "DRAFT" | "PUBLISHED";
  contentMarkdown: string;
  editorMode: "MARKDOWN" | "BLOCKS" | "CUSTOM_HTML";
  blocksJson: CreditFunnelBlock[];
  customHtml: string;
  customChatJson: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  themeJson: unknown;
  dataBindingsJson: unknown;
  updatedAt: string;
};

type HostedListResponse = {
  ok: boolean;
  documents?: HostedPageDocument[];
  error?: string;
};

type HostedPagePreviewData = {
  service: HostedEditorService;
  pageKey: string;
  businessName: string;
  siteHandle: string | null;
  primaryUrl: string | null;
  runtimeTokens: string[];
  summary: Record<string, unknown>;
};

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? [], null, 2);
  } catch {
    return "[]";
  }
}

function prettyLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function templateStyleDescription(pageKey: string) {
  return hostedTemplateStyleDescription(pageKey) || prettyLabel(pageKey);
}

function serviceQueryValue(service: HostedEditorService) {
  return service.toLowerCase();
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeHostedEditorMode(doc: Pick<HostedPageDocument, "editorMode" | "customHtml">) {
  if (doc.editorMode === "MARKDOWN") {
    return doc.customHtml.trim() ? "CUSTOM_HTML" : "BLOCKS";
  }
  return doc.editorMode;
}

const hostedPreviewThemeStyle = {
  ["--client-bg" as any]: "#f8fafc",
  ["--client-surface" as any]: "#ffffff",
  ["--client-soft" as any]: "#eef4ff",
  ["--client-border" as any]: "rgba(148, 163, 184, 0.28)",
  ["--client-text" as any]: "#0f172a",
  ["--client-muted" as any]: "#475569",
  ["--client-link" as any]: "#1d4ed8",
  ["--client-primary" as any]: "#1d4ed8",
  ["--client-on-primary" as any]: "#ffffff",
  ["--client-on-primary-muted" as any]: "rgba(255,255,255,0.78)",
} as const;

const TOPBAR_INTENT_EVENT = "pa.portal.topbar.intent";

type BlockTemplate = {
  label: string;
  build: () => CreditFunnelBlock;
  hint?: string;
};

const BASE_BLOCK_TEMPLATES: BlockTemplate[] = [
  {
    label: "Header nav",
    hint: "Add a real top navigation block.",
    build: () => ({ id: crypto.randomUUID(), type: "headerNav", props: { logoHref: "/", items: [] } }),
  },
  {
    label: "Heading",
    build: () => ({ id: crypto.randomUUID(), type: "heading", props: { text: "New headline", level: 2 } }),
  },
  {
    label: "Paragraph",
    build: () => ({ id: crypto.randomUUID(), type: "paragraph", props: { text: "Add supporting copy here." } }),
  },
  {
    label: "Button",
    build: () => ({ id: crypto.randomUUID(), type: "button", props: { text: "Call to action", href: "/", variant: "primary" } }),
  },
  {
    label: "Image",
    build: () => ({ id: crypto.randomUUID(), type: "image", props: { src: "/brand/purely-logo.svg", alt: "" } }),
  },
  {
    label: "Spacer",
    build: () => ({ id: crypto.randomUUID(), type: "spacer", props: { height: 32 } }),
  },
  {
    label: "Columns",
    build: () =>
      ({
        id: crypto.randomUUID(),
        type: "columns",
        props: {
          gapPx: 16,
          stackOnMobile: true,
          columns: [
            {
              markdown: "",
              children: [
                { id: crypto.randomUUID(), type: "heading", props: { text: "Column one", level: 3 } },
                { id: crypto.randomUUID(), type: "paragraph", props: { text: "Add details here." } },
              ],
            },
            {
              markdown: "",
              children: [
                { id: crypto.randomUUID(), type: "heading", props: { text: "Column two", level: 3 } },
                { id: crypto.randomUUID(), type: "paragraph", props: { text: "Add details here." } },
              ],
            },
          ],
        },
      }) as CreditFunnelBlock,
  },
  {
    label: "Section",
    build: () => ({ id: crypto.randomUUID(), type: "section", props: { markdown: "## Section title\nAdd your section copy here." } }),
  },
];
function serviceBlockTemplates(service: HostedEditorService): BlockTemplate[] {
  switch (service) {
    case "BOOKING":
      return [
        {
          label: "Booking calendar",
          hint: "Add the live booking calendar as a block you can move, resize, and style.",
          build: () =>
            ({
              id: crypto.randomUUID(),
              type: "hostedBookingApp",
              props: {
                style: {
                  maxWidthPx: 980,
                  paddingPx: 16,
                  borderRadiusPx: 24,
                  backgroundColor: "#ffffff",
                  borderColor: "rgba(148,163,184,0.18)",
                  borderWidthPx: 1,
                },
              },
            }) as CreditFunnelBlock,
        },
      ];
    case "REVIEWS":
      return [
        {
          label: "Reviews form and feed",
          hint: "Add the live reviews form, review feed, and Q&A module as one editable block.",
          build: () =>
            ({
              id: crypto.randomUUID(),
              type: "hostedReviewsApp",
              props: {
                style: {
                  maxWidthPx: 1080,
                  paddingPx: 16,
                  borderRadiusPx: 24,
                  backgroundColor: "#ffffff",
                  borderColor: "rgba(148,163,184,0.18)",
                  borderWidthPx: 1,
                },
              },
            }) as CreditFunnelBlock,
        },
      ];
    case "NEWSLETTER":
      return [
        {
          label: "Newsletter archive",
          hint: "Add the live newsletter archive block for your published issues.",
          build: () =>
            ({
              id: crypto.randomUUID(),
              type: "hostedNewsletterArchive",
              props: {
                style: {
                  maxWidthPx: 1080,
                  paddingPx: 16,
                  borderRadiusPx: 24,
                  backgroundColor: "#ffffff",
                  borderColor: "rgba(148,163,184,0.18)",
                  borderWidthPx: 1,
                },
              },
            }) as CreditFunnelBlock,
        },
      ];
    case "BLOGS":
      return [
        {
          label: "Blog archive",
          hint: "Add the live blog archive block so the page lists your recent posts.",
          build: () =>
            ({
              id: crypto.randomUUID(),
              type: "hostedBlogsArchive",
              props: {
                style: {
                  maxWidthPx: 1080,
                  paddingPx: 16,
                  borderRadiusPx: 24,
                  backgroundColor: "#ffffff",
                  borderColor: "rgba(148,163,184,0.18)",
                  borderWidthPx: 1,
                },
              },
            }) as CreditFunnelBlock,
        },
      ];
    default:
      return [];
  }
}

function blockTitle(block: CreditFunnelBlock) {
  switch (block.type) {
    case "heading":
      return block.props.text || "Heading";
    case "paragraph":
      return block.props.text || "Paragraph";
    case "button":
      return block.props.text || "Button";
    case "hostedBookingApp":
      return "Booking calendar";
    case "hostedReviewsApp":
      return "Reviews form and feed";
    case "hostedNewsletterArchive":
      return "Newsletter archive";
    case "hostedBlogsArchive":
      return "Blog archive";
    case "image":
      return block.props.alt || block.props.src || "Image";
    case "spacer":
      return `${Number(block.props.height || 32)}px spacer`;
    case "section":
      return block.props.anchorLabel || block.props.anchorId || block.props.markdown || "Section";
    default:
      return block.type;
  }
}

function hostedBlockNotice(block: CreditFunnelBlock): { title: string; description: string } | null {
  switch (block.type) {
    case "hostedBookingApp":
      return {
        title: "Booking calendar block",
        description: "This block renders the live booking calendar. Use the controls below to change its size, frame styling, and booking colors.",
      };
    case "hostedReviewsApp":
      return {
        title: "Reviews block",
        description: "This block renders the live reviews experience, including the submission form, review feed, and Q&A content for the selected service page.",
      };
    case "hostedNewsletterArchive":
      return {
        title: "Newsletter archive block",
        description: "This block renders the live newsletter archive so visitors can browse your published issues on the hosted page.",
      };
    case "hostedBlogsArchive":
      return {
        title: "Blog archive block",
        description: "This block renders the live blog archive so the hosted page can list your recent posts automatically.",
      };
    default:
      return null;
  }
}

function blockTypeLabel(block: CreditFunnelBlock) {
  switch (block.type) {
    case "headerNav":
      return "Header navigation";
    case "customCode":
      return "Custom code";
    case "formLink":
      return "Form link";
    case "formEmbed":
      return "Form embed";
    case "calendarEmbed":
      return "Calendar embed";
    case "hostedBookingApp":
      return "Booking calendar";
    case "hostedNewsletterArchive":
      return "Newsletter archive";
    case "hostedReviewsApp":
      return "Reviews app";
    case "hostedBlogsArchive":
      return "Blog archive";
    default:
      return prettyLabel(block.type);
  }
}

function preferredSelectedBlockId(blocks: CreditFunnelBlock[] | null) {
  if (!blocks?.length) return "";
  return (blocks.find((block) => block.type !== "page") ?? blocks[0])?.id || "";
}

function findBlockInTree(blocks: CreditFunnelBlock[], id: string): CreditFunnelBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === "section") {
      const props = block.props as Extract<CreditFunnelBlock, { type: "section" }>['props'];
      const nested = [props.children, props.leftChildren, props.rightChildren]
        .filter(Array.isArray)
        .map((items) => findBlockInTree(items as CreditFunnelBlock[], id))
        .find(Boolean);
      if (nested) return nested;
    }
    if (block.type === "columns") {
      for (const column of block.props.columns || []) {
        if (!Array.isArray(column.children)) continue;
        const nested = findBlockInTree(column.children, id);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function replaceBlockInTree(blocks: CreditFunnelBlock[], nextBlock: CreditFunnelBlock): CreditFunnelBlock[] {
  return blocks.map((block) => {
    if (block.id === nextBlock.id) return nextBlock;
    if (block.type === "section") {
      const props = block.props as Extract<CreditFunnelBlock, { type: "section" }>['props'];
      return {
        ...block,
        props: {
          ...props,
          ...(Array.isArray(props.children) ? { children: replaceBlockInTree(props.children, nextBlock) } : null),
          ...(Array.isArray(props.leftChildren) ? { leftChildren: replaceBlockInTree(props.leftChildren, nextBlock) } : null),
          ...(Array.isArray(props.rightChildren) ? { rightChildren: replaceBlockInTree(props.rightChildren, nextBlock) } : null),
        },
      } as CreditFunnelBlock;
    }
    if (block.type === "columns") {
      return {
        ...block,
        props: {
          ...block.props,
          columns: (block.props.columns || []).map((column) => ({
            ...column,
            ...(Array.isArray(column.children) ? { children: replaceBlockInTree(column.children, nextBlock) } : null),
          })),
        },
      } as CreditFunnelBlock;
    }
    return block;
  });
}

function replacePreviewTokens(value: string, previewData: HostedPagePreviewData | null, fallbackTitle: string) {
  if (!value) return value;
  const businessName = previewData?.businessName?.trim() || fallbackTitle;
  const siteHandle = previewData?.siteHandle?.trim() || "your-brand";
  const primaryUrl = previewData?.primaryUrl?.trim() || `/${siteHandle}`;
  const runtimeFrame = (src: string, label: string) =>
    `<iframe title="${label} for ${businessName}" src="${src}" style="width:100%;min-height:920px;border:0;border-radius:20px;background:#fff;display:block;" loading="lazy"></iframe>`;
  const previewFallback = `<div style="padding:24px;border:1px solid #dbe7f5;border-radius:20px;background:#f8fbff;color:#334155;font:600 14px Inter,system-ui,sans-serif;">Live preview content will render here once the page data is ready.</div>`;
  const bookingFrame = previewData?.service === "BOOKING" && primaryUrl ? runtimeFrame(primaryUrl, "Booking preview") : previewFallback;
  const newsletterFrame =
    previewData?.service === "NEWSLETTER" && primaryUrl
      ? runtimeFrame(primaryUrl, "Newsletter archive preview")
      : previewFallback;
  const reviewsFrame =
    previewData?.service === "REVIEWS" && primaryUrl
      ? runtimeFrame(primaryUrl, "Reviews preview")
      : previewFallback;
  const blogsFrame =
    previewData?.service === "BLOGS" && primaryUrl
      ? runtimeFrame(primaryUrl, "Blog archive preview")
      : previewFallback;
  return value
    .replaceAll("{{BUSINESS_NAME}}", businessName)
    .replaceAll("{{PAGE_TITLE}}", fallbackTitle)
    .replaceAll("{{PAGE_DESCRIPTION}}", "")
    .replaceAll("{{SITE_HANDLE}}", siteHandle)
    .replaceAll("{{BOOKING_APP}}", bookingFrame)
    .replaceAll("{{NEWSLETTER_ARCHIVE}}", newsletterFrame)
    .replaceAll("{{REVIEWS_APP}}", reviewsFrame)
    .replaceAll("{{BLOGS_ARCHIVE}}", blogsFrame)
    .replaceAll("{{BLOG_POST_BODY}}", previewFallback)
    .replaceAll("href=\"#back\"", `href=\"${primaryUrl}\"`);
}

export function HostedServicePageEditorClient({
  service,
  serviceLabel,
  backHref,
  defaultPageKey,
}: {
  service: HostedEditorService;
  serviceLabel: string;
  backHref: string;
  defaultPageKey?: string;
}) {
  const pathname = usePathname();
  const toast = useToast();
  const setSidebarOverride = useSetPortalSidebarOverride();
  const appBase = String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";
  const portalVariant = String(pathname || "").startsWith("/credit") ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<HostedPageDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<HostedPageDocument["status"]>("DRAFT");
  const [editorMode, setEditorMode] = useState<HostedPageDocument["editorMode"]>("BLOCKS");
  const [markdown, setMarkdown] = useState("");
  const [customHtml, setCustomHtml] = useState("");
  const [blocksText, setBlocksText] = useState("[]");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [puraPrompt, setPuraPrompt] = useState("");
  const [puraBusy, setPuraBusy] = useState(false);
  const [previewData, setPreviewData] = useState<HostedPagePreviewData | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const selectedDocument = useMemo(
    () => documents.find((entry) => entry.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  const syncFromDocument = useCallback((doc: HostedPageDocument | null) => {
    if (!doc) return;
    setTitle(doc.title || "");
    setSlug(doc.slug || "");
    setStatus(doc.status);
    setEditorMode(normalizeHostedEditorMode(doc));
    setMarkdown(doc.contentMarkdown || "");
    setCustomHtml(doc.customHtml || "");
    setBlocksText(prettyJson(doc.blocksJson));
    setSelectedBlockId(preferredSelectedBlockId(doc.blocksJson));
  }, []);

  const replaceDocument = useCallback(
    (nextDoc: HostedPageDocument, htmlOverride?: string) => {
      setDocuments((current) => current.map((entry) => (entry.id === nextDoc.id ? nextDoc : entry)));
      setSelectedDocumentId(nextDoc.id);
      syncFromDocument({
        ...nextDoc,
        customHtml: htmlOverride ?? nextDoc.customHtml,
      });
    },
    [syncFromDocument],
  );

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents?service=${serviceQueryValue(service)}`, {
        cache: "no-store",
        headers: variantHeaders,
      });
      const data = (await res.json().catch(() => null)) as HostedListResponse | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.documents)) {
        throw new Error(data?.error || `Failed to load ${serviceLabel.toLowerCase()} hosted page documents`);
      }

      const nextDocuments = data.documents;
      const preferred =
        (defaultPageKey ? nextDocuments.find((entry) => entry.pageKey === defaultPageKey) : null) ?? nextDocuments[0] ?? null;

      setDocuments(nextDocuments);
      if (!preferred) throw new Error(`No ${serviceLabel.toLowerCase()} hosted page document found`);
      setSelectedDocumentId(preferred.id);
      syncFromDocument(preferred);
    } catch (error) {
      toast.error(`Could not load ${serviceLabel.toLowerCase()} page editor\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setLoading(false);
    }
  }, [defaultPageKey, service, serviceLabel, syncFromDocument, toast, variantHeaders]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setPreviewData(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocumentId)}/preview-data`, {
      cache: "no-store",
      headers: variantHeaders,
    })
      .then((res) => res.json().catch(() => null).then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.ok || !data.previewData) throw new Error(data?.error || "Failed to load preview data");
        setPreviewData(data.previewData as HostedPagePreviewData);
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId, variantHeaders]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(TOPBAR_INTENT_EVENT, { detail: { hidden: true } }));

    const root = document.documentElement;
    root.setAttribute("data-pa-hide-floating-tools", "1");

    return () => {
      root.removeAttribute("data-pa-hide-floating-tools");
      window.dispatchEvent(new CustomEvent(TOPBAR_INTENT_EVENT, { detail: { hidden: false } }));
    };
  }, []);

  const parsedBlocks = useMemo(() => {
    try {
      return coerceBlocksJson(JSON.parse(blocksText));
    } catch {
      return null;
    }
  }, [blocksText]);

  useEffect(() => {
    if (!parsedBlocks?.length) {
      setSelectedBlockId("");
      return;
    }
    if (!selectedBlockId || !findBlockInTree(parsedBlocks, selectedBlockId)) {
      setSelectedBlockId(preferredSelectedBlockId(parsedBlocks));
    }
  }, [parsedBlocks, selectedBlockId]);

  const updateBlocks = useCallback((nextBlocks: CreditFunnelBlock[]) => {
    setBlocksText(prettyJson(nextBlocks));
  }, []);

  const selectedBlock = useMemo(() => {
    if (!parsedBlocks || !selectedBlockId) return null;
    return findBlockInTree(parsedBlocks, selectedBlockId);
  }, [parsedBlocks, selectedBlockId]);

  const upsertBlock = useCallback(
    (nextBlock: CreditFunnelBlock) => {
      if (!parsedBlocks) return;
      updateBlocks(replaceBlockInTree(parsedBlocks, nextBlock));
    },
    [parsedBlocks, updateBlocks],
  );

  const updateSelectedBlock = useCallback(
    (mutate: (block: CreditFunnelBlock) => CreditFunnelBlock) => {
      if (!selectedBlock) return;
      upsertBlock(mutate(selectedBlock));
    },
    [selectedBlock, upsertBlock],
  );

  const updateSelectedBlockStyle = useCallback(
    (patch: Record<string, unknown>) => {
      updateSelectedBlock((block) => ({
        ...block,
        props: {
          ...block.props,
          style: {
            ...((block.props as any)?.style || {}),
            ...patch,
          },
        } as any,
      }));
    },
    [updateSelectedBlock],
  );

  const resetToDefault = useCallback(async () => {
    if (!selectedDocument) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocument.id)}/reset-to-default`, {
        method: "POST",
        headers: variantHeaders,
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; document?: HostedPageDocument; error?: string } | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || `Failed to reset ${serviceLabel.toLowerCase()} page`);
      }
      replaceDocument(data.document);
      setTemplatesOpen(false);
      toast.success(`${serviceLabel} template restored`);
    } catch (error) {
      toast.error(`Reset failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
  }, [replaceDocument, selectedDocument, serviceLabel, toast, variantHeaders]);

  const addBlock = useCallback(
    (template: BlockTemplate) => {
      const nextBlock = template.build();
      const nextBlocks = [...(parsedBlocks || []), nextBlock];
      updateBlocks(nextBlocks);
      setEditorMode("BLOCKS");
      setSelectedBlockId(nextBlock.id);
    },
    [parsedBlocks, updateBlocks],
  );

  const saveDocument = useCallback(async () => {
    if (!selectedDocument) return;

    let nextBlocks: CreditFunnelBlock[] | undefined;
    if (editorMode === "BLOCKS") {
      if (!parsedBlocks) {
        toast.error("Blocks are invalid\nFix the block content before saving.");
        return;
      }
      nextBlocks = parsedBlocks;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocument.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...variantHeaders },
        body: JSON.stringify({
          title,
          slug: slug.trim() || null,
          status,
          editorMode,
          contentMarkdown: markdown,
          customHtml,
          ...(nextBlocks ? { blocksJson: nextBlocks } : null),
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; document?: HostedPageDocument; error?: string } | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || `Failed to save ${serviceLabel.toLowerCase()} page`);
      }
      replaceDocument(data.document);
      toast.success(`${serviceLabel} page saved`);
    } catch (error) {
      toast.error(`Save failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
  }, [customHtml, editorMode, markdown, parsedBlocks, replaceDocument, selectedDocument, serviceLabel, slug, status, title, toast, variantHeaders]);

  const exportBlocksToHtml = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!selectedDocument) return null;
      if (!parsedBlocks) {
        toast.error("Blocks are invalid\nFix the block content before exporting HTML.");
        return null;
      }

      setBusy(true);
      try {
        const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(selectedDocument.id)}/export-custom-html`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...variantHeaders },
          body: JSON.stringify({ title, blocksJson: parsedBlocks, setEditorMode: "CUSTOM_HTML" }),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; html?: string; document?: HostedPageDocument; error?: string } | null;
        if (!res.ok || !data?.ok || !data.document) {
          throw new Error(data?.error || "Failed to export custom HTML");
        }
        const html = data.html || data.document.customHtml || "";
        replaceDocument(data.document, html);
        if (!opts?.silent) toast.success("Custom HTML refreshed");
        return { document: data.document, html };
      } catch (error) {
        toast.error(`Export failed\n${error instanceof Error ? error.message : "Please try again."}`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [parsedBlocks, replaceDocument, selectedDocument, title, toast, variantHeaders],
  );

  const runPura = useCallback(async () => {
    const cleanPrompt = puraPrompt.trim();
    if (!cleanPrompt) {
      toast.error("Add a prompt first\nTell Pura what to change on this page.");
      return;
    }

    const targetPageKey = resolveHostedTemplatePageKey(service, cleanPrompt);
    const targetDocument = (targetPageKey ? documents.find((entry) => entry.pageKey === targetPageKey) : null) ?? selectedDocument;
    if (!targetDocument) return;

    setPuraBusy(true);
    try {
      let currentHtml = targetDocument.id === selectedDocument?.id ? customHtml || selectedDocument.customHtml || "" : targetDocument.customHtml || "";

      if (targetDocument.editorMode === "BLOCKS") {
        const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(targetDocument.id)}/export-custom-html`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...variantHeaders },
          body: JSON.stringify({ title: targetDocument.title, blocksJson: targetDocument.blocksJson, setEditorMode: "CUSTOM_HTML" }),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; html?: string; document?: HostedPageDocument; error?: string } | null;
        if (!res.ok || !data?.ok || !data.document) {
          throw new Error(data?.error || "Failed to prepare the page for Pura");
        }
        currentHtml = data.html || data.document.customHtml || "";
        setDocuments((current) => current.map((entry) => (entry.id === data.document?.id ? data.document : entry)));
      }

      const res = await fetch(`/api/portal/hosted-pages/documents/${encodeURIComponent(targetDocument.id)}/generate-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...variantHeaders },
        body: JSON.stringify({ prompt: cleanPrompt, currentHtml }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; document?: HostedPageDocument; html?: string; question?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.document) {
        throw new Error(data?.error || `Failed to update the ${serviceLabel.toLowerCase()} page with Pura`);
      }

      replaceDocument(data.document, data.html || data.document.customHtml || currentHtml);
      setPuraPrompt("");
      if (data.question) {
        toast.info(`Pura needs one detail\n${data.question}`);
      } else {
        toast.success("Pura updated the page");
      }
    } catch (error) {
      toast.error(`Pura update failed\n${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setPuraBusy(false);
    }
  }, [customHtml, documents, puraPrompt, replaceDocument, selectedDocument, service, serviceLabel, toast, variantHeaders]);

  const serviceTemplates = useMemo(() => serviceBlockTemplates(service), [service]);
  const livePageHref = previewData?.primaryUrl?.trim() || "";
  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => a.title.localeCompare(b.title) || a.pageKey.localeCompare(b.pageKey)),
    [documents],
  );

  const sidebarContent = useMemo(
    () => {
      const selectedStyle = ((selectedBlock?.props as any)?.style || {}) as Record<string, unknown>;
      const selectedHostedBlockNotice = selectedBlock ? hostedBlockNotice(selectedBlock) : null;
      const inspectorInputClassName = "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-(--color-brand-blue)";
      const pageBlock = parsedBlocks?.find((block) => block.type === "page") ?? null;
      const prioritizeInspector = true;

      const blockLibrary = (
        <div className="rounded-[28px] border border-[rgba(37,99,235,0.10)] bg-[rgba(255,255,255,0.78)] p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] supports-backdrop-filter:bg-[rgba(255,255,255,0.6)] supports-backdrop-filter:backdrop-blur-xl">
          <div className="text-sm font-semibold text-zinc-900">Block library</div>
          <div className={classNames("mt-3 space-y-4 overflow-y-auto pr-1", prioritizeInspector ? "max-h-56" : "max-h-72")}>
            {serviceTemplates.length ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{serviceLabel} block</div>
                <div className="mt-2 grid gap-2">
                  {serviceTemplates.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      onClick={() => addBlock(template)}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-[rgba(37,99,235,0.10)] bg-[rgba(29,78,216,0.08)] px-3 py-3 text-left transition hover:border-[rgba(37,99,235,0.18)] hover:bg-[rgba(29,78,216,0.12)]"
                    >
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{template.label}</div>
                        {template.hint ? <div className="mt-1 text-xs leading-5 text-zinc-600">{template.hint}</div> : null}
                      </div>
                      <div className="text-sm font-semibold text-(--color-brand-blue)">+</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Basic blocks</div>
              <div className="mt-2 grid gap-2">
                {BASE_BLOCK_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => addBlock(template)}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-[rgba(37,99,235,0.08)] bg-white/65 px-3 py-3 text-left transition hover:border-[rgba(37,99,235,0.16)] hover:bg-white/90 supports-backdrop-filter:bg-white/45 supports-backdrop-filter:backdrop-blur-xl"
                  >
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{template.label}</div>
                      {template.hint ? <div className="mt-1 text-xs leading-5 text-zinc-500">{template.hint}</div> : null}
                    </div>
                    <div className="text-sm font-semibold text-(--color-brand-blue)">+</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      const pageStructure = (
        <div className="rounded-[28px] border border-[rgba(37,99,235,0.10)] bg-[rgba(255,255,255,0.78)] p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] supports-backdrop-filter:bg-[rgba(255,255,255,0.6)] supports-backdrop-filter:backdrop-blur-xl">
          <div className="text-sm font-semibold text-zinc-900">Page structure</div>
          <div className={classNames("mt-3 space-y-2 overflow-y-auto pr-1", prioritizeInspector ? "max-h-48" : "max-h-64")}>
            {(parsedBlocks || []).map((block, index) => {
              const active = block.id === selectedBlockId;
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedBlockId(block.id)}
                  data-hosted-page-structure-block-id={block.id}
                  data-selected={active ? "true" : "false"}
                  className={classNames(
                    "flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left transition",
                    active ? "bg-brand-blue text-white shadow-sm" : "bg-white/85 text-zinc-900 hover:bg-white",
                  )}
                >
                  <div className="min-w-0">
                    <div className={classNames("text-xs font-medium", active ? "text-white/75" : "text-zinc-500")}>{blockTypeLabel(block)}</div>
                    <div className="truncate text-sm font-semibold">{blockTitle(block)}</div>
                  </div>
                  <div className={classNames("shrink-0 text-xs font-semibold", active ? "text-white/80" : "text-zinc-500")}>{index + 1}</div>
                </button>
              );
            })}
            {!parsedBlocks?.length ? <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-zinc-500">No blocks yet. Add one to start building this page.</div> : null}
            {!parsedBlocks ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">Blocks are invalid.</div> : null}
          </div>
        </div>
      );

      const selectedBlockInspector = (
        <div
          data-hosted-selected-block-id={selectedBlock?.id || ""}
          data-hosted-selected-block-type={selectedBlock?.type || ""}
          className={classNames(
            "min-h-0 overflow-y-auto rounded-[28px] border border-[rgba(37,99,235,0.10)] bg-[rgba(255,255,255,0.78)] p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] supports-backdrop-filter:bg-[rgba(255,255,255,0.6)] supports-backdrop-filter:backdrop-blur-xl",
            prioritizeInspector ? "flex-[2_1_30rem] min-h-120" : "flex-1",
          )}
        >
          <div className="text-sm font-semibold text-zinc-900">Selected block</div>
          {selectedBlock ? (
            <div className="mt-3 space-y-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Type</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{blockTypeLabel(selectedBlock)}</div>
              </div>

              {selectedBlock.type === "page" ? null : (
                <button
                  type="button"
                  onClick={() => pageBlock && setSelectedBlockId(pageBlock.id)}
                  className="text-sm font-semibold text-(--color-brand-blue) hover:underline"
                >
                  Edit page colors and fonts
                </button>
              )}

              {selectedHostedBlockNotice ? (
                <div className="rounded-2xl border border-[rgba(37,99,235,0.10)] bg-blue-50/60 px-4 py-4 text-sm text-zinc-700">
                  <div className="font-semibold text-zinc-900">{selectedHostedBlockNotice.title}</div>
                  <div className="mt-2 leading-6 text-zinc-600">{selectedHostedBlockNotice.description}</div>
                </div>
              ) : null}

              {selectedBlock.type === "heading" ? (
                <>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Text
                    <textarea
                      value={selectedBlock.props.text}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, text: event.target.value } as any }))}
                      className={`${inspectorInputClassName} min-h-24 resize-y`}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Level
                    <select
                      value={selectedBlock.props.level ?? 2}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, level: Number(event.target.value) as 1 | 2 | 3 } as any }))}
                      className={inspectorInputClassName}
                    >
                      <option value={1}>H1</option>
                      <option value={2}>H2</option>
                      <option value={3}>H3</option>
                    </select>
                  </label>
                </>
              ) : null}

              {selectedBlock.type === "paragraph" ? (
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Text
                  <textarea
                    value={selectedBlock.props.text}
                    onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, text: event.target.value } as any }))}
                    className={`${inspectorInputClassName} min-h-28 resize-y`}
                  />
                </label>
              ) : null}

              {selectedBlock.type === "button" ? (
                <>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Label
                    <input
                      value={selectedBlock.props.text}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, text: event.target.value } as any }))}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Link
                    <input
                      value={selectedBlock.props.href}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, href: event.target.value } as any }))}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Variant
                    <select
                      value={selectedBlock.props.variant ?? "primary"}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, variant: event.target.value as "primary" | "secondary" } as any }))}
                      className={inspectorInputClassName}
                    >
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                    </select>
                  </label>
                </>
              ) : null}

              {selectedBlock.type === "image" ? (
                <>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Image URL
                    <input
                      value={selectedBlock.props.src}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, src: event.target.value } as any }))}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Alt text
                    <input
                      value={selectedBlock.props.alt ?? ""}
                      onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, alt: event.target.value } as any }))}
                      className={inspectorInputClassName}
                    />
                  </label>
                </>
              ) : null}

              {selectedBlock.type === "spacer" ? (
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Height
                  <input
                    type="number"
                    value={selectedBlock.props.height ?? 32}
                    onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, height: Number(event.target.value || 0) || 0 } as any }))}
                    className={inspectorInputClassName}
                  />
                </label>
              ) : null}

              {selectedBlock.type === "section" ? (
                <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Anchor ID
                  <input
                    value={selectedBlock.props.anchorId ?? ""}
                    onChange={(event) => updateSelectedBlock((block) => ({ ...block, props: { ...block.props, anchorId: event.target.value } as any }))}
                    className={inspectorInputClassName}
                  />
                </label>
              ) : null}

              <div className="border-t border-zinc-200 pt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Style</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Align
                      <select
                        value={typeof selectedStyle.align === "string" ? selectedStyle.align : "left"}
                        onChange={(event) => updateSelectedBlockStyle({ align: event.target.value as "left" | "center" | "right" })}
                        className={inspectorInputClassName}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Text color
                    <input
                      value={typeof selectedStyle.textColor === "string" ? selectedStyle.textColor : ""}
                      onChange={(event) => updateSelectedBlockStyle({ textColor: event.target.value || undefined })}
                      className={inspectorInputClassName}
                      placeholder="#0f172a"
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Background
                    <input
                      value={typeof selectedStyle.backgroundColor === "string" ? selectedStyle.backgroundColor : ""}
                      onChange={(event) => updateSelectedBlockStyle({ backgroundColor: event.target.value || undefined })}
                      className={inspectorInputClassName}
                      placeholder="#ffffff"
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Font family
                    <input
                      value={typeof selectedStyle.fontFamily === "string" ? selectedStyle.fontFamily : ""}
                      onChange={(event) => updateSelectedBlockStyle({ fontFamily: event.target.value || undefined })}
                      className={inspectorInputClassName}
                      placeholder="Inter, sans-serif"
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Google font
                    <input
                      value={typeof selectedStyle.fontGoogleFamily === "string" ? selectedStyle.fontGoogleFamily : ""}
                      onChange={(event) => updateSelectedBlockStyle({ fontGoogleFamily: event.target.value || undefined })}
                      className={inspectorInputClassName}
                      placeholder="Inter"
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Font size
                    <input
                      type="number"
                      value={typeof selectedStyle.fontSizePx === "number" ? selectedStyle.fontSizePx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ fontSizePx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Max width
                    <input
                      type="number"
                      value={typeof selectedStyle.maxWidthPx === "number" ? selectedStyle.maxWidthPx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ maxWidthPx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Top margin
                    <input
                      type="number"
                      value={typeof selectedStyle.marginTopPx === "number" ? selectedStyle.marginTopPx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ marginTopPx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Bottom margin
                    <input
                      type="number"
                      value={typeof selectedStyle.marginBottomPx === "number" ? selectedStyle.marginBottomPx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ marginBottomPx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Padding
                    <input
                      type="number"
                      value={typeof selectedStyle.paddingPx === "number" ? selectedStyle.paddingPx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ paddingPx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Radius
                    <input
                      type="number"
                      value={typeof selectedStyle.borderRadiusPx === "number" ? selectedStyle.borderRadiusPx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ borderRadiusPx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Border width
                    <input
                      type="number"
                      value={typeof selectedStyle.borderWidthPx === "number" ? selectedStyle.borderWidthPx : ""}
                      onChange={(event) => updateSelectedBlockStyle({ borderWidthPx: event.target.value ? Number(event.target.value) : undefined })}
                      className={inspectorInputClassName}
                    />
                  </label>
                  {selectedBlock.type === "hostedBookingApp" ? (
                    <>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Calendar background
                        <input
                          value={typeof (selectedStyle as any).bookingBgHex === "string" ? (selectedStyle as any).bookingBgHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingBgHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#ffffff"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Surface
                        <input
                          value={typeof (selectedStyle as any).bookingSurfaceHex === "string" ? (selectedStyle as any).bookingSurfaceHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingSurfaceHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#ffffff"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Soft background
                        <input
                          value={typeof (selectedStyle as any).bookingSoftHex === "string" ? (selectedStyle as any).bookingSoftHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingSoftHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#f8fafc"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Calendar border
                        <input
                          value={typeof (selectedStyle as any).bookingBorderHex === "string" ? (selectedStyle as any).bookingBorderHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingBorderHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#cbd5e1"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Calendar text
                        <input
                          value={typeof (selectedStyle as any).bookingTextHex === "string" ? (selectedStyle as any).bookingTextHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingTextHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#0f172a"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Muted text
                        <input
                          value={typeof (selectedStyle as any).bookingMutedTextHex === "string" ? (selectedStyle as any).bookingMutedTextHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingMutedTextHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#64748b"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Button color
                        <input
                          value={typeof (selectedStyle as any).bookingPrimaryHex === "string" ? (selectedStyle as any).bookingPrimaryHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingPrimaryHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#2563eb"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Link color
                        <input
                          value={typeof (selectedStyle as any).bookingLinkHex === "string" ? (selectedStyle as any).bookingLinkHex : ""}
                          onChange={(event) => updateSelectedBlockStyle({ bookingLinkHex: event.target.value || undefined })}
                          className={inspectorInputClassName}
                          placeholder="#1d4ed8"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl bg-white/80 px-4 py-5 text-sm text-zinc-500">Select a block from the preview or page structure to edit its content and style.</div>
          )}
        </div>
      );

      return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-3 text-zinc-900">
          {editorMode === "BLOCKS" ? (
            <>
              {prioritizeInspector ? selectedBlockInspector : blockLibrary}
              {pageStructure}
              {prioritizeInspector ? blockLibrary : selectedBlockInspector}
            </>
          ) : (
          <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-[rgba(37,99,235,0.10)] bg-[rgba(255,255,255,0.78)] p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] supports-backdrop-filter:bg-[rgba(255,255,255,0.6)] supports-backdrop-filter:backdrop-blur-xl">
            <div className="text-sm font-semibold text-zinc-900">HTML mode</div>
            <textarea
              value={customHtml}
              onChange={(event) => setCustomHtml(event.target.value)}
              className="mt-3 min-h-88 flex-1 rounded-3xl border border-[rgba(37,99,235,0.10)] bg-white/72 px-4 py-3 font-mono text-[13px] leading-6 text-zinc-900 outline-none transition hover:bg-white/85 supports-backdrop-filter:bg-white/52 supports-backdrop-filter:backdrop-blur-xl focus:border-(--color-brand-blue)"
              spellCheck={false}
            />
          </div>
          )}
        </div>
      );
    },
    [addBlock, customHtml, editorMode, parsedBlocks, selectedBlock, selectedBlockId, serviceLabel, serviceTemplates, updateSelectedBlock, updateSelectedBlockStyle],
  );

  const topActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="#hosted-page-preview"
          className="inline-flex h-10 items-center justify-center rounded-2xl border border-[rgba(37,99,235,0.12)] bg-white/80 px-4 text-sm font-semibold text-zinc-900 shadow-[0_10px_24px_rgba(37,99,235,0.08)] transition hover:bg-white"
        >
          Preview
        </a>
        {livePageHref ? (
          <Link
            href={livePageHref}
            target="_blank"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[rgba(37,99,235,0.12)] bg-white/80 px-4 text-sm font-semibold text-zinc-900 shadow-[0_10px_24px_rgba(37,99,235,0.08)] transition hover:bg-white"
          >
            View live
          </Link>
        ) : null}
        <button type="button" onClick={() => setTemplatesOpen(true)} disabled={busy || puraBusy} className="inline-flex h-10 items-center justify-center rounded-2xl border border-[rgba(37,99,235,0.12)] bg-white/80 px-4 text-sm font-semibold text-zinc-900 shadow-[0_10px_24px_rgba(37,99,235,0.08)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
          Templates
        </button>
      </div>
    ),
    [busy, livePageHref, puraBusy],
  );

  useEffect(() => {
    setSidebarOverride({
      desktopTopRight: topActions,
      mobileHeaderActions: topActions,
      desktopSidebarContent: sidebarContent,
      mobileSidebarContent: sidebarContent,
    });

    return () => setSidebarOverride(null);
  }, [setSidebarOverride, sidebarContent, topActions]);

  const previewBusinessName = previewData?.businessName?.trim() || title.trim() || serviceLabel;
  const previewRuntimeBlocks = useMemo(() => {
    const siteHandle = previewData?.siteHandle?.trim() || "";
    const bookingPreviewFrame = siteHandle ? <PublicBookingClient target={{ kind: "slug", slug: siteHandle }} showBranding={false} embedded /> : undefined;
    const newsletterLatest = Array.isArray(previewData?.summary?.latest)
      ? (previewData?.summary?.latest as Array<Record<string, unknown>>)
          .map((item) => ({
            slug: typeof item.slug === "string" ? item.slug : "",
            title: typeof item.title === "string" ? item.title : "Untitled newsletter",
            excerpt: typeof item.excerpt === "string" ? item.excerpt : null,
            sentAt: typeof item.sentAt === "string" || typeof item.sentAt === "number" ? new Date(item.sentAt) : null,
            updatedAt: typeof item.updatedAt === "string" || typeof item.updatedAt === "number" ? new Date(item.updatedAt) : new Date(),
          }))
          .filter((item) => item.slug)
      : [];
    const reviewLatest = Array.isArray(previewData?.summary?.latestReviews)
      ? (previewData?.summary?.latestReviews as Array<Record<string, unknown>>)
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
            rating: typeof item.rating === "number" ? item.rating : 5,
            name: typeof item.name === "string" ? item.name : "Guest",
            body: typeof item.body === "string" ? item.body : null,
            photoUrls: item.photoUrls,
            businessReply: typeof item.businessReply === "string" ? item.businessReply : null,
            businessReplyAt: typeof item.businessReplyAt === "string" ? item.businessReplyAt : null,
            createdAt:
              typeof item.createdAt === "string" || typeof item.createdAt === "number"
                ? new Date(item.createdAt).toISOString()
                : new Date().toISOString(),
          }))
      : [];
    const reviewQuestions = Array.isArray(previewData?.summary?.latestQuestions)
      ? (previewData?.summary?.latestQuestions as Array<Record<string, unknown>>).map((item) => ({
          id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
          name: typeof item.name === "string" ? item.name : "",
          question: typeof item.question === "string" ? item.question : "",
          answer: typeof item.answer === "string" ? item.answer : "",
          answeredAt: typeof item.answeredAt === "string" ? item.answeredAt : null,
        }))
      : [];
    const blogLatest = Array.isArray(previewData?.summary?.latestPosts)
      ? (previewData?.summary?.latestPosts as Array<Record<string, unknown>>)
          .map((item) => ({
            slug: typeof item.slug === "string" ? item.slug : "",
            title: typeof item.title === "string" ? item.title : "Untitled post",
            excerpt: typeof item.excerpt === "string" ? item.excerpt : null,
            publishedAt: typeof item.publishedAt === "string" || typeof item.publishedAt === "number" ? new Date(item.publishedAt) : null,
            updatedAt: typeof item.updatedAt === "string" || typeof item.updatedAt === "number" ? new Date(item.updatedAt) : new Date(),
          }))
          .filter((item) => item.slug)
      : [];
    const previewPost =
      previewData?.summary && typeof previewData.summary === "object" && previewData.summary.previewPost && typeof previewData.summary.previewPost === "object"
        ? (previewData.summary.previewPost as Record<string, unknown>)
        : null;
    const themedWrap = (node: React.ReactNode) => <div style={hostedPreviewThemeStyle}>{node}</div>;
    const previewCard = (heading: string, description: string, detailLines: string[] = []) =>
      themedWrap(
        <div className="rounded-3xl border border-[rgba(37,99,235,0.14)] bg-white px-6 py-5 shadow-[0_12px_30px_rgba(37,99,235,0.08)]">
          <div className="text-sm font-semibold text-zinc-900">{heading}</div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
          {detailLines.length ? (
            <div className="mt-4 grid gap-2">
              {detailLines.slice(0, 4).map((line) => (
                <div key={line} className="rounded-2xl bg-[rgba(37,99,235,0.06)] px-3 py-2 text-sm text-zinc-700">
                  {line}
                </div>
              ))}
            </div>
          ) : null}
        </div>,
      );
    const bookingSummaryLines = [
      typeof previewData?.summary?.title === "string" && previewData.summary.title.trim() ? `Calendar: ${previewData.summary.title.trim()}` : "Calendar details load from your booking setup.",
      Number.isFinite(Number(previewData?.summary?.durationMinutes)) ? `Duration: ${Number(previewData?.summary?.durationMinutes)} minutes` : "Duration will appear here when set.",
      typeof previewData?.summary?.timeZone === "string" && previewData.summary.timeZone.trim() ? `Time zone: ${previewData.summary.timeZone.trim()}` : "Time zone will appear here when available.",
    ].filter(Boolean) as string[];
    const newsletterSummaryLines = newsletterLatest.length
      ? newsletterLatest.slice(0, 4).map((item) => item.title)
      : ["Your latest newsletter issues will appear in this preview."];
    const reviewSummaryLines = reviewLatest.length
      ? reviewLatest.slice(0, 3).map((item) => `${item.name || "Guest"}: ${item.body || `${item.rating}/5 review`}`)
      : reviewQuestions.length
        ? reviewQuestions.slice(0, 3).map((item) => `${item.name || "Guest"}: ${item.question}`)
        : ["Recent reviews and answered questions will appear in this preview."];
    const blogSummaryLines = blogLatest.length
      ? blogLatest.slice(0, 4).map((item) => item.title)
      : ["Published posts will appear in this preview once they are available."];

    return {
      bookingApp: bookingPreviewFrame ?? previewCard("Booking preview", "Live booking availability will render here once the interactive calendar is ready.", bookingSummaryLines),
      newsletterArchive:
        newsletterLatest.length
          ? themedWrap(
              <HostedNewsletterArchive
                newsletters={newsletterLatest}
                basePath={siteHandle ? `/${siteHandle}/newsletters` : "#"}
                emptyTitle="No newsletters yet."
                emptyDescription="Send your first issue to populate the archive preview."
              />,
            )
          : previewCard("Recent editions", "Published issues will appear here once you have newsletter content ready to browse.", newsletterSummaryLines),
      reviewsApp:
        siteHandle ? (
          themedWrap(
            <PublicReviewsClient
              siteHandle={siteHandle}
              businessName={previewBusinessName}
              brandPrimary="#2563eb"
              destinations={Array.isArray(previewData?.summary?.destinations) ? (previewData?.summary?.destinations as any[]) : []}
              galleryEnabled={Boolean(previewData?.summary?.galleryEnabled ?? true)}
              thankYouMessage={typeof previewData?.summary?.thankYouMessage === "string" ? previewData.summary.thankYouMessage : "Thanks! Your review was submitted."}
              formConfig={previewData?.summary?.formConfig}
              initialReviews={reviewLatest}
              initialQuestions={reviewQuestions}
            />,
          )
        ) : previewCard("Reviews preview", "Public reviews will render here once the public reviews page is connected.", reviewSummaryLines),
      blogsArchive:
        blogLatest.length
          ? themedWrap(
              <HostedBlogArchiveSection brandName={previewBusinessName} posts={blogLatest} page={1} pageSize={50} basePath={siteHandle ? `/${siteHandle}/blogs` : "#"} />,
            )
          : previewCard("Latest posts", "Published posts will appear here once your blog has content to browse.", blogSummaryLines),
      blogPostBody:
        siteHandle && previewPost && typeof previewPost.title === "string" && typeof previewPost.content === "string"
          ? themedWrap(
              <HostedBlogPostArticle
                post={{
                  title: previewPost.title,
                  excerpt: typeof previewPost.excerpt === "string" ? previewPost.excerpt : null,
                  content: previewPost.content,
                  publishedAt:
                    typeof previewPost.publishedAt === "string" || typeof previewPost.publishedAt === "number"
                      ? new Date(previewPost.publishedAt)
                      : null,
                  updatedAt:
                    typeof previewPost.updatedAt === "string" || typeof previewPost.updatedAt === "number"
                      ? new Date(previewPost.updatedAt)
                      : new Date(),
                }}
                blogsHref={`/${siteHandle}/blogs`}
                learnMoreHref={`/${siteHandle}/blogs`}
              />,
            )
          : previewCard("Article preview", "The selected article body will render here once a published post is available.", blogSummaryLines),
    };
  }, [previewBusinessName, previewData?.siteHandle, previewData?.summary]);

  if (loading) {
    return (
      <div data-hosted-page-editor-root={service.toLowerCase()} className="min-h-screen bg-[#f5f7fb] p-3 sm:p-4">
        <div className="px-6 py-10 text-sm text-zinc-600">Loading {serviceLabel.toLowerCase()} page editor…</div>
      </div>
    );
  }

  if (!selectedDocument) {
    return (
      <div data-hosted-page-editor-root={service.toLowerCase()} className="min-h-screen bg-[#f5f7fb] p-3 sm:p-4">
        <div className="px-6 py-10 text-sm text-red-600">Could not load the {serviceLabel.toLowerCase()} hosted page document.</div>
      </div>
    );
  }

  const modeOptions: Array<{ value: HostedPageDocument["editorMode"]; label: string }> = [
    { value: "BLOCKS", label: "Blocks" },
    { value: "CUSTOM_HTML", label: "Custom HTML" },
  ];

  const previewEmptyClassName = "flex min-h-[34rem] items-center justify-center px-8 text-center text-sm text-zinc-500";
  const surfaceClassName = "rounded-[28px] border border-[rgba(37,99,235,0.10)] bg-[rgba(255,255,255,0.78)] shadow-[0_18px_45px_rgba(37,99,235,0.08)] supports-backdrop-filter:bg-[rgba(255,255,255,0.6)] supports-backdrop-filter:backdrop-blur-xl";
  const toolbarButtonClassName =
    "inline-flex h-11 items-center justify-center rounded-2xl border border-[rgba(37,99,235,0.12)] bg-white/80 px-4 text-sm font-semibold text-zinc-900 shadow-[0_10px_24px_rgba(37,99,235,0.08)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50";
  const blueButtonClassName =
    "inline-flex h-11 items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
  const previewContext = {
    bookingSiteSlug: service === "BOOKING" ? previewData?.siteHandle || undefined : undefined,
    previewDevice: "desktop" as const,
    hostedRuntimeBlocks: previewRuntimeBlocks,
  };
  const resolvedCustomHtml = replacePreviewTokens(customHtml, previewData, title || serviceLabel);

  return (
    <div data-hosted-page-editor-root={service.toLowerCase()} className="min-h-screen bg-[#f5f7fb] p-3 sm:p-4">
      <div className="mx-auto max-w-450 space-y-3">
        <div className={`${surfaceClassName} p-3`}>
          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
            <Link href={`${appBase}${backHref}`} className={toolbarButtonClassName}>
              ← Back
            </Link>

            <PortalListboxDropdown
              value={status}
              onChange={(value) => setStatus(String(value || "DRAFT") as HostedPageDocument["status"])}
              options={[
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
              ]}
              placeholder="Select status"
              buttonClassName="flex h-11 min-w-[9rem] items-center justify-between gap-2 rounded-2xl border border-[rgba(37,99,235,0.12)] bg-white/80 px-3 text-sm font-semibold text-zinc-900 shadow-[0_10px_24px_rgba(37,99,235,0.08)] hover:bg-white"
            />

            <button type="button" onClick={() => void exportBlocksToHtml()} disabled={busy || puraBusy || editorMode !== "BLOCKS"} className={toolbarButtonClassName}>
              Export blocks to HTML
            </button>

            <button type="button" onClick={() => setTemplatesOpen(true)} disabled={busy || puraBusy} className={toolbarButtonClassName}>
              Templates
            </button>

            <button type="button" onClick={() => void saveDocument()} disabled={busy || puraBusy} className={`${blueButtonClassName} ml-auto`}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {modeOptions.map((option) => {
              const active = editorMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEditorMode(option.value)}
                  className={classNames(
                    "inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition",
                    active ? "bg-(--color-brand-blue) text-white shadow-sm" : "bg-white text-zinc-900 hover:bg-zinc-50",
                  )}
                >
                  {option.label}
                </button>
              );
            })}

            <div className="ml-auto flex min-w-[20rem] flex-1 items-center gap-2 rounded-2xl border border-[rgba(37,99,235,0.12)] bg-white/80 px-3 py-2 shadow-[0_10px_24px_rgba(37,99,235,0.08)] supports-backdrop-filter:bg-white/60 supports-backdrop-filter:backdrop-blur-xl">
              <AiSparkIcon className="h-4 w-4 shrink-0 text-(--color-brand-blue)" />
              <input
                value={puraPrompt}
                onChange={(event) => setPuraPrompt(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                placeholder="Ask Pura to update this page"
              />
              <button
                type="button"
                className={classNames(
                  "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white transition-all duration-100 hover:opacity-95 disabled:opacity-60",
                  puraBusy ? "animate-pulse" : "",
                )}
                onClick={() => void runPura()}
                disabled={busy || puraBusy || !puraPrompt.trim()}
                aria-label="Send to Pura"
                title="Send to Pura"
              >
                <span className="group-hover:hidden">
                  <IconSend />
                </span>
                <span className="hidden group-hover:inline">
                  <IconSendHover />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1">
          <aside id="hosted-page-preview" className={`${surfaceClassName} overflow-hidden p-3`}>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              {editorMode === "CUSTOM_HTML" ? (
                <iframe
                  title={`${serviceLabel} page preview`}
                  className="h-[78vh] min-h-128 w-full bg-white"
                  sandbox="allow-same-origin"
                  srcDoc={resolvedCustomHtml || `<div style='padding:24px;font-family:Inter,system-ui,sans-serif;color:#64748b'>No custom HTML yet for ${previewBusinessName}.</div>`}
                />
              ) : editorMode === "BLOCKS" ? (
                parsedBlocks ? (
                  <div className="h-[78vh] min-h-128 overflow-y-auto overflow-x-hidden bg-white p-6">
                    {renderCreditFunnelBlocks({
                      blocks: parsedBlocks,
                      basePath: "",
                      context: previewContext,
                      editor: {
                        enabled: true,
                        selectedBlockId,
                        onSelectBlockId: (id) => setSelectedBlockId(id),
                        onUpsertBlock: (next) => upsertBlock(next),
                      },
                    })}
                  </div>
                ) : (
                  <div className={previewEmptyClassName}>Fix the blocks JSON to render the page preview.</div>
                )
              ) : (
                <div className={previewEmptyClassName}>Choose blocks or custom HTML to preview this page draft.</div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <AppModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="Templates"
        description="Choose a hosted page template to view, then restore the selected page to its default version whenever you need a clean reset."
        widthClassName="w-[min(920px,calc(100vw-32px))]"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void resetToDefault()}
              disabled={busy || !selectedDocument}
            >
              {busy ? "Restoring…" : "Restore selected template"}
            </button>
          </div>
        }
      >
        <div data-hosted-templates-modal={service.toLowerCase()} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedDocuments.map((doc) => {
              const active = doc.id === selectedDocumentId;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocumentId(doc.id);
                    syncFromDocument(doc);
                  }}
                  className={classNames(
                    "rounded-3xl border p-4 text-left transition",
                    active
                      ? "border-[rgba(37,99,235,0.10)] bg-blue-50/90 shadow-sm"
                      : "border-[rgba(37,99,235,0.10)] bg-white/70 hover:bg-white",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{doc.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">{templateStyleDescription(doc.pageKey)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </AppModal>
    </div>
  );
}
