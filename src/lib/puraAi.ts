import { AsyncLocalStorage } from "node:async_hooks";

import { generateText, generateTextWithImages, transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { normalizePuraAiProfile, type PuraAiProfile } from "@/lib/puraAiProfile";

const puraAiProfileStorage = new AsyncLocalStorage<{ profile: PuraAiProfile }>();

function getSharedAiBaseUrl(): string {
  return String(process.env.AI_BASE_URL || "").trim();
}

function getPuraAiBaseUrl(): string {
  return String(process.env.PURA_AI_BASE_URL || process.env.AI_BASE_URL || "").trim();
}

function getSharedAiApiKey(): string {
  return String(process.env.AI_API_KEY || "").trim();
}

function getPuraAiApiKey(): string {
  return String(process.env.PURA_AI_API_KEY || "").trim();
}

function getPuraAiProviderConfig(profileRaw?: unknown): { baseUrl: string; apiKey: string; source: "shared" | "pura"; profile: PuraAiProfile } {
  const profile = normalizePuraAiProfile(profileRaw ?? getCurrentPuraAiProfile());
  if (profile === "fast") {
    return {
      baseUrl: getSharedAiBaseUrl(),
      apiKey: getSharedAiApiKey(),
      source: "shared",
      profile,
    };
  }

  return {
    baseUrl: getPuraAiBaseUrl(),
    apiKey: getPuraAiApiKey(),
    source: "pura",
    profile,
  };
}

export function isPuraAiConfigured(profileRaw?: unknown): boolean {
  const provider = getPuraAiProviderConfig(profileRaw);
  return Boolean(provider.baseUrl && provider.apiKey);
}

export function getCurrentPuraAiProfile(): PuraAiProfile {
  return normalizePuraAiProfile(puraAiProfileStorage.getStore()?.profile);
}

export function runWithPuraAiProfile<T>(profileRaw: unknown, work: () => T): T {
  const profile = normalizePuraAiProfile(profileRaw);
  return puraAiProfileStorage.run({ profile }, work);
}

export function resolvePuraAiModel(profileRaw?: unknown): string {
  const profile = normalizePuraAiProfile(profileRaw ?? getCurrentPuraAiProfile());
  const fallback = String(process.env.PURA_AI_MODEL || process.env.AI_MODEL || "gpt-5.4").trim() || "gpt-5.4";
  if (profile === "fast") {
    return String(process.env.PURA_AI_MODEL_FAST || fallback).trim() || fallback;
  }
  if (profile === "deep") {
    return String(process.env.PURA_AI_MODEL_DEEP || process.env.PURA_AI_MODEL_BALANCED || fallback).trim() || fallback;
  }
  return String(process.env.PURA_AI_MODEL_BALANCED || fallback).trim() || fallback;
}

function assertPuraAiConfigured(profileRaw?: unknown) {
  const provider = getPuraAiProviderConfig(profileRaw);
  if (provider.baseUrl && provider.apiKey) return provider;
  if (provider.source === "shared") {
    throw new Error("Fast Pura mode is not configured. Set AI_API_KEY and AI_BASE_URL.");
  }
  throw new Error("Deep Pura mode is not configured. Set PURA_AI_API_KEY and AI_BASE_URL (or PURA_AI_BASE_URL).");
}

export async function generatePuraText(opts: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
  profile?: PuraAiProfile;
}): Promise<string> {
  const provider = assertPuraAiConfigured(opts.profile);
  return await generateText({
    ...opts,
    model: opts.model ?? resolvePuraAiModel(opts.profile),
    baseUrlOverride: provider.baseUrl,
    apiKeyOverride: provider.apiKey,
  });
}

export async function generatePuraTextWithImages(opts: {
  system?: string;
  user: string;
  imageUrls: string[];
  model?: string;
  temperature?: number;
  profile?: PuraAiProfile;
}): Promise<string> {
  const provider = assertPuraAiConfigured(opts.profile);
  return await generateTextWithImages({
    ...opts,
    model: opts.model ?? resolvePuraAiModel(opts.profile),
    baseUrlOverride: provider.baseUrl,
    apiKeyOverride: provider.apiKey,
  });
}

export async function transcribePuraAudio(opts: {
  bytes: ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  model?: string;
}): Promise<string> {
  assertPuraAiConfigured();
  return await transcribeAudio({
    ...opts,
    baseUrlOverride: getPuraAiBaseUrl(),
    apiKeyOverride: getPuraAiApiKey(),
  });
}

export async function transcribePuraAudioVerbose(opts: {
  bytes: ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  model?: string;
}): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  assertPuraAiConfigured();
  return await transcribeAudioVerbose({
    ...opts,
    baseUrlOverride: getPuraAiBaseUrl(),
    apiKeyOverride: getPuraAiApiKey(),
  });
}