"use client";
export function SuggestedSetupModalLauncher(opts: {
  buttonLabel?: string;
  title?: string;
  description?: string;
  canEdit?: boolean;
  serviceSlugs?: string[];
  kinds?: string[];
  autoOpen?: boolean;
  buttonClassName?: string;
}) {
  // Suggested Setup is intentionally hidden from users.
  // (Backend systems can remain, but UI should not render.)
  void opts;
  return null;
}
