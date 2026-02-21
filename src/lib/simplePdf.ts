function escapePdfString(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

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
    let buf = "";
    for (const part of words) {
      if (buf.length + part.length <= maxChars) {
        buf += part;
        continue;
      }
      if (buf.trim().length) lines.push(buf.trimEnd());
      buf = part.trimStart();
      if (buf.length > maxChars) {
        // Hard-break very long tokens.
        while (buf.length > maxChars) {
          lines.push(buf.slice(0, maxChars));
          buf = buf.slice(maxChars);
        }
      }
    }
    if (buf.trim().length) lines.push(buf.trimEnd());
  }

  return lines;
}

function buildPdf(objects: string[]): Buffer {
  const header = "%PDF-1.4\n";
  const chunks: string[] = [header];
  const offsets: number[] = [0]; // dummy for object 0

  let byteLen = Buffer.byteLength(header, "utf8");
  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteLen);
    const objNum = i + 1;
    const obj = `${objNum} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(obj);
    byteLen += Buffer.byteLength(obj, "utf8");
  }

  const xrefOffset = byteLen;
  let xref = "xref\n";
  xref += `0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    "trailer\n" +
    `<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    "startxref\n" +
    `${xrefOffset}\n` +
    "%%EOF\n";

  chunks.push(xref);
  chunks.push(trailer);
  return Buffer.from(chunks.join(""), "utf8");
}

export function renderTextToPdfBytes(opts: {
  title?: string;
  text: string;
  maxLines?: number;
}): Buffer {
  const title = (opts.title || "Document").slice(0, 120);
  const maxLines = Math.max(10, Math.min(4000, opts.maxLines ?? 800));

  // Page: US Letter 8.5x11" => 612 x 792 points.
  const pageW = 612;
  const pageH = 792;
  const margin = 54;
  const startX = margin;
  const startY = pageH - margin;
  const fontSize = 10;
  const leading = 13;

  // Rough wrapping heuristic for Helvetica at 10pt.
  const wrapped = wrapLines(`${title}\n\n${opts.text}`, 95).slice(0, maxLines);

  const textOps: string[] = [];
  textOps.push("BT");
  textOps.push(`/F1 ${fontSize} Tf`);
  textOps.push(`${leading} TL`);
  textOps.push(`${startX} ${startY} Td`);

  for (const line of wrapped) {
    // Keep content printable; PDF text operators are sensitive.
    const clean = escapePdfString(line.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " "));
    textOps.push(`(${clean}) Tj`);
    textOps.push("T*");
  }

  textOps.push("ET");

  const contentStream = textOps.join("\n") + "\n";
  const contentLen = Buffer.byteLength(contentStream, "utf8");

  const objects: string[] = [];
  // 1: Catalog
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  // 2: Pages
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  // 3: Page
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
  );
  // 4: Font
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  // 5: Contents
  objects.push(`<< /Length ${contentLen} >>\nstream\n${contentStream}endstream`);

  return buildPdf(objects);
}
