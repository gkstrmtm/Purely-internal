export function getScheduledRecurrenceTimeZone(attachmentsJson: unknown): string {
  const attachments = attachmentsJson && typeof attachmentsJson === "object" && !Array.isArray(attachmentsJson)
    ? (attachmentsJson as Record<string, unknown>)
    : null;
  const recurrence = attachments?.recurrence && typeof attachments.recurrence === "object" && !Array.isArray(attachments.recurrence)
    ? (attachments.recurrence as Record<string, unknown>)
    : null;
  return recurrence && typeof recurrence.timeZone === "string"
    ? String(recurrence.timeZone).trim().slice(0, 80)
    : "";
}

export function withScheduledRecurrenceMetadata(opts: {
  attachmentsJson: unknown;
  repeatEveryMinutes: number;
  recurrenceTimeZone?: string | null;
}): unknown {
  const repeatEveryMinutes = Number.isFinite(opts.repeatEveryMinutes)
    ? Math.max(0, Math.floor(opts.repeatEveryMinutes))
    : 0;
  const recurrenceTimeZone = String(opts.recurrenceTimeZone || "").trim().slice(0, 80);
  const currentTimeZone = getScheduledRecurrenceTimeZone(opts.attachmentsJson);

  if (!repeatEveryMinutes) {
    const current = opts.attachmentsJson;
    if (!current || typeof current !== "object" || Array.isArray(current)) return current ?? null;
    const base = { ...(current as Record<string, unknown>) };
    if (!("recurrence" in base)) return current;
    delete base.recurrence;
    return Object.keys(base).length ? base : null;
  }

  if (!recurrenceTimeZone) return opts.attachmentsJson ?? null;
  if (currentTimeZone === recurrenceTimeZone) return opts.attachmentsJson ?? null;

  if (opts.attachmentsJson && typeof opts.attachmentsJson === "object" && !Array.isArray(opts.attachmentsJson)) {
    const base = { ...(opts.attachmentsJson as Record<string, unknown>) };
    const recurrence = base.recurrence && typeof base.recurrence === "object" && !Array.isArray(base.recurrence)
      ? { ...(base.recurrence as Record<string, unknown>) }
      : {};
    return {
      ...base,
      recurrence: {
        ...recurrence,
        timeZone: recurrenceTimeZone,
        mode: "wall_clock",
      },
    };
  }

  if (Array.isArray(opts.attachmentsJson)) return opts.attachmentsJson;

  return {
    recurrence: {
      timeZone: recurrenceTimeZone,
      mode: "wall_clock",
    },
  };
}