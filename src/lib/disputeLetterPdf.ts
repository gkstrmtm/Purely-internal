import { PDFDocument, StandardFonts } from "pdf-lib";

const CONTACT_SIGNATURE_MARKDOWN_REGEX = /!\[[^\]]*signature[^\]]*\]\(pa-signature:\/\/contact\)/i;

type DisputeLetterPdfMeta = {
  dateIso?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  recipientName?: string | null;
  recipientAddress?: string | null;
};

function sanitizePdfText(text: string) {
  // Keep tabs/newlines/carriage returns and printable ASCII.
  return String(text || "").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

function toPdfLines(value: string) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, "    ").trimEnd());
}

function formatLetterDate(dateIso: string) {
  const iso = String(dateIso || "").trim();
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
    }
  }
  return iso;
}

function equalsLoose(a: string, b: string) {
  return String(a || "")
    .trim()
    .toLowerCase() ===
    String(b || "")
      .trim()
      .toLowerCase();
}

function stripHeaderFooterForPdf(text: string, meta: DisputeLetterPdfMeta, options?: { preserveClosing?: boolean }) {
  const value = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!value) return "";

  // Drop everything after a closing line so we don't duplicate the signature/name in the PDF.
  const rawLines = value.split("\n");
  const closingRegex = /^\s*(sincerely|regards|respectfully|thank you)\s*[,]*\s*$/i;
  let end = rawLines.length;
  if (!options?.preserveClosing) {
    for (let i = rawLines.length - 1; i >= 0; i -= 1) {
      if (closingRegex.test(rawLines[i] || "")) {
        end = i;
        break;
      }
    }
  }
  const lines = rawLines.slice(0, end);

  // Remove obvious metadata/placeholder lines that sometimes leak into the drafted text.
  const headerLabelRegex = /^\s*(date|recipient|recipient address|consumer\/contact name|consumer address|consumer email|consumer phone)\s*:/i;
  const placeholderRegex = /^\s*\[(date|signature|recipient address|address|city,\s*state,\s*zip(?:\s*code)?)\]\s*$/i;
  const cityZipRegex = /^\s*city\s*,\s*state\s*,\s*zip(?:\s*code)?\s*$/i;

  const senderLines = [String(meta.senderName || "").trim(), ...toPdfLines(String(meta.senderAddress || ""))].filter(Boolean);
  const recipientLines = [String(meta.recipientName || "").trim(), ...toPdfLines(String(meta.recipientAddress || ""))].filter(Boolean);
  const dateLong = meta.dateIso ? formatLetterDate(meta.dateIso) : "";
  const dateIso = String(meta.dateIso || "").trim();

  const cleaned: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "");
    const trimmed = line.trim();

    if (!trimmed) {
      cleaned.push("");
      continue;
    }

    // Strip leaked labels and placeholders.
    if (headerLabelRegex.test(trimmed)) continue;
    if (placeholderRegex.test(trimmed)) continue;
    if (cityZipRegex.test(trimmed)) continue;

    // Strip any repeated header lines in the top portion.
    if (i < 30) {
      if (dateIso && /^\s*date\s*:/i.test(trimmed)) continue;
      if (dateIso && equalsLoose(trimmed.replace(/^date\s*:\s*/i, ""), dateIso)) continue;
      if (dateLong && equalsLoose(trimmed, dateLong)) continue;
      if (senderLines.some((entry) => entry && equalsLoose(trimmed, entry))) continue;
      if (recipientLines.some((entry) => entry && equalsLoose(trimmed, entry))) continue;
    }

    // Drop explicit signature placeholders.
    if (/^\s*\[\s*signature\s*\]\s*$/i.test(trimmed)) continue;
    if (/^\s*signature\s*:?\s*$/i.test(trimmed)) continue;

    cleaned.push(line.trimEnd());
  }

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function tryEmbedSignatureImage(pdf: PDFDocument, signatureDataUrl: string) {
  const trimmed = String(signatureDataUrl || "").trim();
  if (!trimmed) return null;

  try {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const mimeType = match?.[1] || "";
    const base64 = match?.[2] || "";
    if (!mimeType || !base64) return null;

    const bytes = Buffer.from(base64, "base64");
    const image = mimeType.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

    const maxWidth = 180;
    const maxHeight = 72;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    return { image, width: image.width * scale, height: image.height * scale };
  } catch {
    return null;
  }
}

type InlineSegment = {
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  signature?: boolean;
};

function parseInlineMarkdownSegments(line: string): InlineSegment[] {
  const value = String(line || "");
  const segments: InlineSegment[] = [];
  let cursor = 0;

  const pushText = (text: string, style?: Omit<InlineSegment, "text" | "signature">) => {
    if (!text) return;
    segments.push({ text, ...style });
  };

  while (cursor < value.length) {
    const rest = value.slice(cursor);
    const signatureMatch = rest.match(/^!\[[^\]]*signature[^\]]*\]\(pa-signature:\/\/contact\)/i);
    if (signatureMatch?.[0]) {
      segments.push({ signature: true });
      cursor += signatureMatch[0].length;
      continue;
    }

    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch?.[1]) {
      pushText(boldMatch[1], { bold: true });
      cursor += boldMatch[0].length;
      continue;
    }

    const underlineMatch = rest.match(/^__([^_]+)__/);
    if (underlineMatch?.[1]) {
      pushText(underlineMatch[1], { underline: true });
      cursor += underlineMatch[0].length;
      continue;
    }

    const italicMatch = rest.match(/^\*([^*]+)\*/);
    if (italicMatch?.[1]) {
      pushText(italicMatch[1], { italic: true });
      cursor += italicMatch[0].length;
      continue;
    }

    pushText(rest[0] || "");
    cursor += 1;
  }

  return segments;
}

export async function renderDisputeLetterPdfBytes(opts: {
  text: string;
  meta?: DisputeLetterPdfMeta;
  signatureDataUrl?: string | null;
  signatureText?: string | null;
  printedName?: string | null;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalicFont = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

  const margin = 54;
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const bodyWidth = pageWidth - margin * 2;

  const lineHeight = 14;
  const bodyFontSize = 11;

  const printedName = String(opts.printedName || "").trim();
  const signatureText = String(opts.signatureText || "").trim();
  const signatureImage = await tryEmbedSignatureImage(pdf, String(opts.signatureDataUrl || ""));

  const meta = opts.meta || {};
  const dateLine = meta.dateIso ? formatLetterDate(meta.dateIso) : "";
  const senderName = String(meta.senderName || printedName || "").trim();
  const senderAddressLines = toPdfLines(String(meta.senderAddress || "")).filter(Boolean);
  const recipientName = String(meta.recipientName || "").trim();
  const recipientAddressLines = toPdfLines(String(meta.recipientAddress || "")).filter(Boolean);

  let cursorY = pageHeight - margin;

  // Date top-right.
  if (dateLine) {
    const w = bodyFont.widthOfTextAtSize(dateLine, bodyFontSize);
    page.drawText(sanitizePdfText(dateLine), {
      x: Math.max(margin, pageWidth - margin - w),
      y: cursorY,
      size: bodyFontSize,
      font: bodyFont,
    });
  }

  // Sender block (top-left).
  const headerLines: string[] = [];
  if (senderName) headerLines.push(senderName);
  headerLines.push(...senderAddressLines);
  for (const line of headerLines) {
    page.drawText(sanitizePdfText(line), {
      x: margin,
      y: cursorY,
      size: bodyFontSize,
      font: bodyFont,
      maxWidth: bodyWidth,
    });
    cursorY -= lineHeight;
  }

  cursorY -= lineHeight;

  // Recipient block.
  const recipientLines: string[] = [];
  if (recipientName) recipientLines.push(recipientName);
  recipientLines.push(...recipientAddressLines);
  for (const line of recipientLines) {
    page.drawText(sanitizePdfText(line), {
      x: margin,
      y: cursorY,
      size: bodyFontSize,
      font: bodyFont,
      maxWidth: bodyWidth,
    });
    cursorY -= lineHeight;
  }

  cursorY -= lineHeight;

  const hasInlineSignature = CONTACT_SIGNATURE_MARKDOWN_REGEX.test(String(opts.text || ""));
  const bodyText = stripHeaderFooterForPdf(String(opts.text || ""), {
    dateIso: meta.dateIso,
    senderName: senderName,
    senderAddress: meta.senderAddress,
    recipientName: recipientName,
    recipientAddress: meta.recipientAddress,
  }, { preserveClosing: hasInlineSignature });

  // Draw body with basic paging.
  const selectFont = (segment: InlineSegment) => {
    if (segment.bold && segment.italic) return boldItalicFont;
    if (segment.bold) return boldFont;
    if (segment.italic) return italicFont;
    return bodyFont;
  };

  const ensureSpace = (height: number) => {
    if (cursorY >= margin + height) return;
    page = pdf.addPage([612, 792]);
    cursorY = page.getHeight() - margin;
  };

  const drawInlineSignature = () => {
    const blockHeight = signatureImage
      ? signatureImage.height + (printedName ? lineHeight * 2 : lineHeight)
      : lineHeight * (signatureText || printedName ? 2 : 1);
    ensureSpace(blockHeight + lineHeight);
    if (signatureImage) {
      const signatureY = Math.max(margin + 24, cursorY - signatureImage.height);
      page.drawImage(signatureImage.image, {
        x: margin,
        y: signatureY,
        width: signatureImage.width,
        height: signatureImage.height,
      });
      cursorY = signatureY - lineHeight;
      if (printedName) {
        page.drawText(sanitizePdfText(printedName), {
          x: margin,
          y: cursorY,
          size: bodyFontSize,
          font: bodyFont,
          maxWidth: bodyWidth,
        });
        cursorY -= lineHeight;
      }
      return;
    }
    const textValue = signatureText || printedName;
    if (textValue) {
      page.drawText(sanitizePdfText(textValue), {
        x: margin,
        y: cursorY,
        size: bodyFontSize,
        font: italicFont,
        maxWidth: bodyWidth,
      });
      cursorY -= lineHeight;
    }
  };

  const drawWrappedSegments = (segments: InlineSegment[]) => {
    const flushLine = (lineSegments: InlineSegment[]) => {
      ensureSpace(lineHeight * 2);
      let x = margin;
      for (const segment of lineSegments) {
        const textValue = String(segment.text || "");
        if (!textValue) continue;
        const font = selectFont(segment);
        page.drawText(sanitizePdfText(textValue), {
          x,
          y: cursorY,
          size: bodyFontSize,
          font,
        });
        const width = font.widthOfTextAtSize(textValue, bodyFontSize);
        if (segment.underline && textValue.trim()) {
          page.drawLine({
            start: { x, y: cursorY - 1.5 },
            end: { x: x + width, y: cursorY - 1.5 },
            thickness: 0.75,
          });
        }
        x += width;
      }
      cursorY -= lineHeight;
    };

    let currentLine: InlineSegment[] = [];
    let currentWidth = 0;

    const pushText = (textValue: string, style: InlineSegment) => {
      const parts = textValue.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        const font = selectFont(style);
        const tokenWidth = font.widthOfTextAtSize(part, bodyFontSize);
        if (!part.trim() && currentWidth === 0) continue;
        if (currentWidth > 0 && currentWidth + tokenWidth > bodyWidth) {
          flushLine(currentLine);
          currentLine = [];
          currentWidth = 0;
          if (!part.trim()) continue;
        }
        currentLine.push({ ...style, text: part });
        currentWidth += tokenWidth;
      }
    };

    for (const segment of segments) {
      if (segment.signature) {
        if (currentLine.length) {
          flushLine(currentLine);
          currentLine = [];
          currentWidth = 0;
        }
        drawInlineSignature();
        continue;
      }
      pushText(String(segment.text || ""), segment);
    }

    if (currentLine.length) flushLine(currentLine);
  };

  const wrappedBodyLines = String(bodyText || "").replace(/\r\n?/g, "\n").split("\n");
  const drawLine = (line: string, font = bodyFont) => {
    if (cursorY < margin + lineHeight) {
      page = pdf.addPage([612, 792]);
      cursorY = page.getHeight() - margin;
    }
    page.drawText(sanitizePdfText(line), {
      x: margin,
      y: cursorY,
      size: bodyFontSize,
      font,
      maxWidth: bodyWidth,
    });
    cursorY -= lineHeight;
  };

  for (const line of wrappedBodyLines) {
    if (!String(line || "").trim()) {
      cursorY -= lineHeight;
      continue;
    }
    drawWrappedSegments(parseInlineMarkdownSegments(line));
  }

  // Closing + signature block. Keep them together.
  if (hasInlineSignature) {
    return Buffer.from(await pdf.save());
  }

  const signatureBlockHeight =
    lineHeight * 2 +
    (signatureImage ? signatureImage.height + lineHeight * (printedName ? 2 : 1) : printedName ? lineHeight * 2 : 0);
  if (cursorY < margin + signatureBlockHeight) {
    page = pdf.addPage([612, 792]);
    cursorY = page.getHeight() - margin;
  }

  cursorY -= lineHeight;
  drawLine("Sincerely,", boldFont);
  cursorY -= lineHeight;

  if (signatureImage) {
    const signatureY = Math.max(margin + 24, cursorY - signatureImage.height);
    page.drawImage(signatureImage.image, {
      x: margin,
      y: signatureY,
      width: signatureImage.width,
      height: signatureImage.height,
    });
    cursorY = signatureY - lineHeight;
    if (printedName) {
      drawLine(printedName);
    }
  } else if (printedName) {
    drawLine(printedName);
  }

  return Buffer.from(await pdf.save());
}
