"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "pa.portal.ui-preview";

function isPrivateIpv4Host(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isLocalPreviewHost(host: string): boolean {
  const normalized = String(host || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "localhost") return true;
  return isPrivateIpv4Host(normalized);
}

function isEnabledValue(raw: string | null): boolean | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "1" || value === "true" || value === "ui" || value === "on") return true;
  if (value === "0" || value === "false" || value === "off") return false;
  return null;
}

export function usePortalUiPreview(): boolean {
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isLocalPreviewHost(window.location.hostname)) {
      setEnabled(false);
      return;
    }

    const explicit = isEnabledValue(searchParams?.get("pa_preview"));
    if (explicit === true) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      setEnabled(true);
      return;
    }

    if (explicit === false) {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setEnabled(false);
      return;
    }

    try {
      setEnabled(window.sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setEnabled(false);
    }
  }, [searchParams]);

  return enabled;
}