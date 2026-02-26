export function formatSavedTime(hours: number): string {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  if (h < 1) {
    const minutes = Math.round(h * 60);
    return `${minutes}m`;
  }
  return `${Math.round(h)}h`;
}
