import type { ReactNode } from "react";

export function replaceHostedTextTokens(html: string, values: Record<string, string>) {
  let out = String(html || "");
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    out = out.replace(pattern, value);
  }
  return out;
}

export function extractHostedCustomHtmlParts(html: string) {
  const raw = String(html || "").trim();
  if (!raw) return { styles: "", bodyHtml: "" };

  const styles = Array.from(raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean)
    .join("\n");

  const bodyMatch = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] ? String(bodyMatch[1]).trim() : raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").trim();

  return {
    styles,
    bodyHtml: bodyHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
  };
}

export function renderHostedCustomHtmlTemplate(opts: {
  html: string;
  textTokens?: Record<string, string>;
  runtimeTokens?: Record<string, ReactNode>;
  fallback?: ReactNode;
}) {
  const replaced = replaceHostedTextTokens(opts.html, opts.textTokens ?? {});
  const { styles, bodyHtml } = extractHostedCustomHtmlParts(replaced);
  if (!bodyHtml) return opts.fallback ?? null;

  const segments = bodyHtml.split(/(\{\{[A-Z0-9_]+\}\})/g).filter(Boolean);
  let usedRuntimeToken = false;

  return (
    <>
      {styles ? <style dangerouslySetInnerHTML={{ __html: styles }} /> : null}
      {segments.map((segment, index) => {
        const runtimeNode = opts.runtimeTokens?.[segment];
        if (runtimeNode !== undefined) {
          usedRuntimeToken = true;
          return <div key={`hosted_runtime_${index}`}>{runtimeNode}</div>;
        }

        const cleanSegment = String(segment || "").trim();
        if (!cleanSegment) return null;
        return <div key={`hosted_segment_${index}`} dangerouslySetInnerHTML={{ __html: cleanSegment }} />;
      })}
      {!usedRuntimeToken ? opts.fallback ?? null : null}
    </>
  );
}
