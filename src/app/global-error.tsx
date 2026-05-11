"use client";

import { AppCrashFallback } from "@/components/AppCrashFallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <AppCrashFallback error={error} reset={reset} scope="global" />
      </body>
    </html>
  );
}