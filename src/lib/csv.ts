export type ParsedCsv = {

  delimiter: string;
  headers: string[];
  rows: string[][];
};

function stripBom(s: string) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function guessCsvDelimiter(sampleRaw: string): "," | "\t" | ";" | "|" {
  const sample = stripBom(String(sampleRaw ?? ""));
  const line = sample.split(/\r\n|\n|\r/)[0] ?? "";
  const candidates: Array<"," | "\t" | ";" | "|"> = [",", "\t", ";", "|"];

  let best: { d: "," | "\t" | ";" | "|"; count: number } = { d: ",", count: -1 };
  for (const d of candidates) {
    const c = line.split(d).length - 1;
    if (c > best.count) best = { d, count: c };
  }

  return best.d;
}

/**
 * RFC4180-ish CSV parser.
 * - Supports quoted fields with escaped quotes (""").
 * - Supports \n, \r\n, and \r newlines.
 * - Skips completely empty rows.
 */
export function parseCsv(textRaw: string, opts?: { delimiter?: string; maxRows?: number }): ParsedCsv {

  const text = stripBom(String(textRaw ?? ""));
  const delimiter = (opts?.delimiter || guessCsvDelimiter(text)) as string;
  const maxRows = Math.max(1, Math.min(20000, Number(opts?.maxRows ?? 20000) || 20000));

  const allRows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }

  function pushRow() {
    if (row.some((c) => String(c).trim() !== "")) allRows.push(row);
    row = [];
  }

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }

      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      if (allRows.length >= maxRows) break;
      i += 1;
      continue;
    }

    if (ch === "\r") {
      const next = text[i + 1];
      pushField();
      pushRow();
      if (allRows.length >= maxRows) break;
      i += next === "\n" ? 2 : 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Flush trailing field/row.
  if (field.length || row.length) {
    pushField();
    pushRow();
  }

  const headers = (allRows[0] || []).map((h) => String(h ?? "").trim());
  const dataRows = allRows.length > 1 ? allRows.slice(1) : [];
  return { delimiter, headers, rows: dataRows };
}