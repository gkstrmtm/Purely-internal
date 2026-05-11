"use client";

import { AppCrashFallback } from "@/components/AppCrashFallback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppCrashFallback error={error} reset={reset} scope="route" />;
}