function normalizeText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(s: string): string[] {
  const n = normalizeText(s);
  if (!n) return [];
  return n.split(" ").filter(Boolean);
}

function wordOverlapScore(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0;

  const setB = new Set(wb);
  let common = 0;
  for (const w of wa) if (setB.has(w)) common++;

  return common / Math.max(wa.length, wb.length);
}

function substringScore(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 8 && nb.includes(na)) return Math.min(1, na.length / Math.max(na.length, nb.length));
  if (nb.length >= 8 && na.includes(nb)) return Math.min(1, nb.length / Math.max(na.length, nb.length));
  return 0;
}

function scoreTextMatch(a: string, b: string): number {
  // Heuristic blend: overlap dominates, substring helps for short segments.
  const o = wordOverlapScore(a, b);
  const sub = substringScore(a, b);
  return Math.max(o, sub * 0.9);
}

export type TranscriptSegment = { start: number; end: number; text: string };

export function buildSpeakerTranscriptAlignedToFull(opts: {
  full: { text: string; segments: TranscriptSegment[] };
  left: { text: string; segments: TranscriptSegment[] };
  right: { text: string; segments: TranscriptSegment[] };
  leftLabel: string;
  rightLabel: string;
  maxChars?: number;
}): string {
  const maxChars = typeof opts.maxChars === "number" && opts.maxChars > 0 ? Math.floor(opts.maxChars) : 25000;

  const fullSegs = Array.isArray(opts.full.segments) ? opts.full.segments : [];
  const leftSegs = Array.isArray(opts.left.segments) ? opts.left.segments : [];
  const rightSegs = Array.isArray(opts.right.segments) ? opts.right.segments : [];

  if (!fullSegs.length) {
    // If we don't have full segments, fall back to a simple interleave by timestamps.
    const merged: Array<{ start: number; speaker: string; text: string }> = [];
    for (const s of leftSegs) merged.push({ start: s.start, speaker: opts.leftLabel, text: s.text });
    for (const s of rightSegs) merged.push({ start: s.start, speaker: opts.rightLabel, text: s.text });
    merged.sort((a, b) => a.start - b.start);

    const out: string[] = [];
    for (const m of merged) {
      const t = String(m.text || "").trim();
      if (!t) continue;
      out.push(`${m.speaker}: ${t}`);
      if (out.join("\n").length > maxChars) break;
    }
    return out.join("\n").trim().slice(0, maxChars);
  }

  let li = 0;
  let ri = 0;
  const window = 7;
  const minScore = 0.22;

  const labeled: Array<{ speaker: string; text: string }> = [];
  let lastSpeaker: string | null = null;

  for (const seg of fullSegs) {
    const txt = String(seg.text || "").trim();
    if (!txt) continue;

    let bestLeft = { idx: -1, score: 0 };
    for (let j = li; j < Math.min(leftSegs.length, li + window); j++) {
      const s = scoreTextMatch(txt, leftSegs[j]?.text || "");
      if (s > bestLeft.score) bestLeft = { idx: j, score: s };
    }

    let bestRight = { idx: -1, score: 0 };
    for (let j = ri; j < Math.min(rightSegs.length, ri + window); j++) {
      const s = scoreTextMatch(txt, rightSegs[j]?.text || "");
      if (s > bestRight.score) bestRight = { idx: j, score: s };
    }

    let speaker: string | null = null;
    if (bestLeft.score >= minScore || bestRight.score >= minScore) {
      if (bestLeft.score > bestRight.score + 0.03) speaker = opts.leftLabel;
      else if (bestRight.score > bestLeft.score + 0.03) speaker = opts.rightLabel;
      else speaker = lastSpeaker ?? (bestLeft.score >= bestRight.score ? opts.leftLabel : opts.rightLabel);

      if (speaker === opts.leftLabel && bestLeft.idx >= 0) li = Math.max(li, bestLeft.idx + 1);
      if (speaker === opts.rightLabel && bestRight.idx >= 0) ri = Math.max(ri, bestRight.idx + 1);
    } else {
      speaker = lastSpeaker;
    }

    const finalSpeaker: string = speaker ?? opts.leftLabel;
    labeled.push({ speaker: finalSpeaker, text: txt });
    lastSpeaker = finalSpeaker;
    if (labeled.map((x) => x.text).join(" ").length > maxChars) break;
  }

  // Coalesce consecutive lines by speaker.
  const out: string[] = [];
  for (const item of labeled) {
    const t = item.text.trim();
    if (!t) continue;
    const last = out.length ? out[out.length - 1] : "";
    const prefix = `${item.speaker}: `;
    if (last.startsWith(prefix)) {
      out[out.length - 1] = `${last} ${t}`;
    } else {
      out.push(`${prefix}${t}`);
    }
    if (out.join("\n\n").length > maxChars) break;
  }

  return out.join("\n\n").trim().slice(0, maxChars);
}
