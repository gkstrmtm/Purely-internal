export function deriveInterestedServiceFromNotes(notes: unknown): string | null {
  if (typeof notes !== "string") return null;
  const text = notes.trim();
  if (!text) return null;

  // Common pattern used by marketing demo-request handler.
  const goalsMatch = /\nGoals:\s*(.+)$/im.exec(text);
  if (goalsMatch?.[1]?.trim()) return goalsMatch[1].trim();

  // More generic fallback.
  const interestedMatch = /Interested\s*(?:in|service)\s*:\s*(.+)$/im.exec(text);
  if (interestedMatch?.[1]?.trim()) return interestedMatch[1].trim();

  return null;
}
