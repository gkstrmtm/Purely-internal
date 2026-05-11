const REQUIRED_DESIGN_TOKENS = ["primary", "background", "text", "muted", "accent"] as const;

type RequiredDesignToken = (typeof REQUIRED_DESIGN_TOKENS)[number];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stripNonStyleNoise(value: string) {
  return String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/data:image\/[^"')\s]+/gi, "data:image/...")
    .replace(/url\(([^)]*)\)/gi, "url(...)");
}

export function buildDesignTokenContractBlock(heading = "DESIGN_TOKEN_CONTRACT:") {
  return [
    heading,
    "- Use exactly five semantic color tokens named --color-primary, --color-background, --color-text, --color-muted, and --color-accent.",
    "- Define those five tokens once, then route every color, background, border, fill, and emphasis choice through var(...) references to those tokens.",
    "- Do not introduce extra semantic color slots, raw hex values, rgb/hsl values, gradients, or unrelated palette branches outside the five token definitions.",
    "- Buttons must reuse one CTA system: one dominant primary treatment and one visibly subordinate secondary treatment.",
    "- Cards must share one structure for radius, border, spacing, and surface treatment instead of mixing unrelated shells.",
    "- Typography must follow one clear hierarchy for display, section heading, body, and muted support copy.",
    "- If the page or fragment contains mismatched styles, inconsistent components, or mixed visual systems, normalize it before returning.",
  ].join("\n");
}

export function assessDesignTokenDiscipline(opts: { html: string; css?: string }) {
  const blob = stripNonStyleNoise(`${String(opts.html || "")}\n${String(opts.css || "")}`);
  const issues: string[] = [];

  const declaredTokens = uniqueStrings(
    Array.from(blob.matchAll(/--color-([a-z-]+)\s*:/gi), (match) => String(match[1] || "").toLowerCase()),
  );
  const referencedTokens = uniqueStrings(
    Array.from(blob.matchAll(/var\(--color-([a-z-]+)\b/gi), (match) => String(match[1] || "").toLowerCase()),
  );
  const unknownTokens = uniqueStrings(
    [...declaredTokens, ...referencedTokens].filter(
      (token): token is string => !REQUIRED_DESIGN_TOKENS.includes(token as RequiredDesignToken),
    ),
  );

  if (unknownTokens.length) {
    issues.push(
      `Use only the defined design tokens (primary, background, text, muted, accent); found unsupported tokens: ${unknownTokens.join(", ")}.`,
    );
  }

  const hasStyleMarkup = /<style\b|style\s*=|\b(color|background(?:-color)?|border(?:-color)?|outline-color|fill|stroke|box-shadow|text-shadow)\s*:/i.test(
    blob,
  );

  if (hasStyleMarkup) {
    const missingTokens = REQUIRED_DESIGN_TOKENS.filter((token) => !new RegExp(`--color-${token}\\s*:`, "i").test(blob));
    if (missingTokens.length) {
      issues.push(`Define the full five-token palette before styling output; missing token declarations: ${missingTokens.join(", ")}.`);
    }
  }

  const tokenlessBlob = blob
    .replace(/--color-(primary|background|text|muted|accent)\s*:\s*[^;]+;/gi, " ")
    .replace(/var\(--color-(primary|background|text|muted|accent)\b[^)]*\)/gi, "var(--color-token)");

  const rawColorDeclarationPattern =
    /(?:color|background(?:-color)?|border(?:-color)?|outline-color|fill|stroke|box-shadow|text-shadow)\s*:\s*[^;]*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b)/gi;
  if (rawColorDeclarationPattern.test(tokenlessBlob)) {
    issues.push("Use only the five design tokens for component color declarations; do not leave raw hex, rgb, hsl, black, or white values in styles.");
  }

  if (/gradient\(/i.test(tokenlessBlob)) {
    issues.push("Do not introduce a separate gradient-driven visual system; normalize surfaces through the shared token palette instead.");
  }

  return uniqueStrings(issues).slice(0, 4);
}
