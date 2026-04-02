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

export async function renderDisputeLetterPdfBytes(opts: {
  title?: string;
  text: string;
  signatureDataUrl?: string | null;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 54;
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const lineHeight = 13;
  const bodyFontSize = 10;
  const titleFontSize = 14;
  const bodyWidth = pageWidth - margin * 2;

  let signatureImage:
    | { image: Awaited<ReturnType<PDFDocument["embedPng"]>> | Awaited<ReturnType<PDFDocument["embedJpg"]>>; width: number; height: number }
    | null = null;

  const signatureDataUrl = String(opts.signatureDataUrl || "").trim();
  if (signatureDataUrl) {
    try {
      const [, mimeType = "", base64 = ""] = signatureDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/) || [];
      if (mimeType && base64) {
        const bytes = Buffer.from(base64, "base64");
        const image = mimeType.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const maxWidth = 180;
        const maxHeight = 72;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        signatureImage = { image, width: image.width * scale, height: image.height * scale };
      }
    } catch {
      signatureImage = null;
    }
  }

  const title = String(opts.title || "Document").trim().slice(0, 120) || "Document";
  page.drawText(title, { x: margin, y: pageHeight - margin, size: titleFontSize, font: titleFont });

  const startY = pageHeight - margin - 28;
  const reservedSignatureHeight = signatureImage ? signatureImage.height + 42 : 0;
  const maxBodyLines = Math.max(10, Math.floor((startY - margin - reservedSignatureHeight) / lineHeight));
  const wrapped = wrapLines(String(opts.text || ""), 95).slice(0, maxBodyLines);

  let cursorY = startY;
  for (const line of wrapped) {
    page.drawText(line.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " "), {
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
    page.drawText("Signature on file", {
      x: margin,
      y: signatureY + signatureImage.height + 8,
      size: 9,
      font: titleFont,
    });
    page.drawImage(signatureImage.image, {
      x: margin,
      y: signatureY,
      width: signatureImage.width,
      height: signatureImage.height,
    });
  }

  return Buffer.from(await pdf.save());
}
