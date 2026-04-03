import { PDFDocument, StandardFonts } from "pdf-lib";

function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  const rawLines = String(text || "").replace(/\r\n/g, "\n").split("\n");

  for (const raw of rawLines) {
    const line = raw.replace(/\t/g, "    ");
    if (line.length <= maxChars) {
      lines.push(line);
      continue;
    }

    const words = line.split(/(\s+)/);
    let buffer = "";
    for (const part of words) {
      if (buffer.length + part.length <= maxChars) {
        buffer += part;
        continue;
      }
      if (buffer.trim().length) lines.push(buffer.trimEnd());
      buffer = part.trimStart();
      if (buffer.length > maxChars) {
        while (buffer.length > maxChars) {
          lines.push(buffer.slice(0, maxChars));
          buffer = buffer.slice(maxChars);
        }
      }
    }
    if (buffer.trim().length) lines.push(buffer.trimEnd());
  }

  return lines;
}

function sanitizePdfText(text: string) {
  // Keep tabs/newlines/carriage returns and printable ASCII.
  return String(text || "").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
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

export async function renderDisputeLetterPdfBytes(opts: {
  title?: string;
  text: string;
  signatureDataUrl?: string | null;
  printedName?: string | null;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 54;
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const bodyWidth = pageWidth - margin * 2;

  const lineHeight = 13;
  const bodyFontSize = 10;
  const titleFontSize = 14;

  const title = String(opts.title || "Dispute Letter").trim().slice(0, 120) || "Dispute Letter";
  page.drawText(sanitizePdfText(title), {
    x: margin,
    y: pageHeight - margin,
    size: titleFontSize,
    font: titleFont,
  });

  const printedName = String(opts.printedName || "").trim();
  const signatureImage = await tryEmbedSignatureImage(pdf, String(opts.signatureDataUrl || ""));

  const startY = pageHeight - margin - 28;
  const reservedSignatureHeight = signatureImage
    ? signatureImage.height + (printedName ? 54 : 42)
    : printedName
      ? 42
      : 0;

  const maxBodyLines = Math.max(10, Math.floor((startY - margin - reservedSignatureHeight) / lineHeight));
  const wrapped = wrapLines(String(opts.text || ""), 95).slice(0, maxBodyLines);

  let cursorY = startY;
  for (const line of wrapped) {
    page.drawText(sanitizePdfText(line), {
      x: margin,
      y: cursorY,
      size: bodyFontSize,
      font: bodyFont,
      maxWidth: bodyWidth,
      lineHeight,
    });
    cursorY -= lineHeight;
  }

  if (signatureImage) {
    const signatureY = Math.max(margin + 12, cursorY - 24);
    page.drawImage(signatureImage.image, {
      x: margin,
      y: signatureY,
      width: signatureImage.width,
      height: signatureImage.height,
    });

    if (printedName) {
      page.drawText(sanitizePdfText(printedName), {
        x: margin,
        y: Math.max(margin, signatureY - 14),
        size: 10,
        font: bodyFont,
        maxWidth: bodyWidth,
      });
    }
  } else if (printedName) {
    const nameY = Math.max(margin, cursorY - 24);
    page.drawText(sanitizePdfText(printedName), {
      x: margin,
      y: nameY,
      size: 10,
      font: bodyFont,
      maxWidth: bodyWidth,
    });
  }

  return Buffer.from(await pdf.save());
}
