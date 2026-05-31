import { prisma } from "@/lib/db";
import {
  getPortalMetaConnectionForPublishing,
  getPortalMetaProviderReadiness,
} from "@/lib/portalMetaIntegration.server";
import { normalizeMimeType } from "@/lib/portalMedia";
import {
  getPortalMediaGrowthProfile,
  type PortalMediaGrowthProfile,
} from "@/lib/portalMediaGrowth";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

import {
  inspectMetaInstagramFeedPublishDryRun,
  type MetaConnectionState,
  type MetaInstagramFeedDryRunResult,
} from "./portalMetaPublishingContract";

type PortalMediaItemProbeRow = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bytes: Uint8Array | Buffer | null;
  storageUrl: string | null;
  publicToken: string | null;
};

type ImageProbe = {
  format: "jpeg" | "png" | "gif" | "webp" | "unknown" | null;
  width: number | null;
  height: number | null;
  probeError: string | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeConnectionState(value: string | null | undefined): MetaConnectionState {
  switch (String(value || "")) {
    case "connected":
      return "connected";
    case "needs_permissions":
      return "needs_permissions";
    case "reconnect_required":
      return "reconnect_required";
    case "disabled":
      return "disabled";
    case "not_connected":
      return "not_connected";
    default:
      return "coming_soon";
  }
}

function isAbsoluteHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value) && /^https?:\/\//i.test(String(value));
}

function resolvePublicAssetUrl(row: PortalMediaItemProbeRow): string | null {
  const storageUrl = normalizeString(row.storageUrl);
  if (storageUrl && isAbsoluteHttpUrl(storageUrl)) return storageUrl;
  const publicToken = normalizeString(row.publicToken);
  if (publicToken) return toPurelyHostedUrl(`/api/public/media/item/${row.id}/${publicToken}`);
  if (storageUrl) return toPurelyHostedUrl(storageUrl);
  return null;
}

async function readProbeBuffer(row: PortalMediaItemProbeRow): Promise<Buffer | null> {
  if (row.bytes && (row.bytes as Uint8Array).byteLength > 0) {
    return Buffer.from(row.bytes as Uint8Array);
  }

  const storageUrl = normalizeString(row.storageUrl);
  if (!storageUrl || !isAbsoluteHttpUrl(storageUrl)) return null;

  const response = await fetch(storageUrl, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const arrayBuffer = await response.arrayBuffer().catch(() => null);
  return arrayBuffer ? Buffer.from(arrayBuffer) : null;
}

function probePng(buffer: Buffer): ImageProbe {
  if (buffer.length < 24) {
    return { format: "png", width: null, height: null, probeError: "PNG header is incomplete." };
  }

  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!signature.equals(expected)) {
    return { format: "png", width: null, height: null, probeError: "PNG signature is invalid." };
  }

  return {
    format: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    probeError: null,
  };
}

function probeGif(buffer: Buffer): ImageProbe {
  if (buffer.length < 10) {
    return { format: "gif", width: null, height: null, probeError: "GIF header is incomplete." };
  }
  return {
    format: "gif",
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    probeError: null,
  };
}

function probeJpeg(buffer: Buffer): ImageProbe {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { format: "jpeg", width: null, height: null, probeError: "JPEG signature is invalid." };
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 1 >= buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return { format: "jpeg", width: null, height: null, probeError: "JPEG segment length is invalid." };
    }

    const isStartOfFrame = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );

    if (isStartOfFrame) {
      if (offset + 7 >= buffer.length) {
        return { format: "jpeg", width: null, height: null, probeError: "JPEG frame header is incomplete." };
      }
      return {
        format: "jpeg",
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        probeError: null,
      };
    }

    offset += segmentLength;
  }

  return { format: "jpeg", width: null, height: null, probeError: "JPEG dimensions were not found in the file headers." };
}

function probeImage(buffer: Buffer, mimeType: string, fileName: string): ImageProbe {
  const normalized = normalizeMimeType(mimeType, fileName).toLowerCase();
  if (normalized === "image/jpeg") return probeJpeg(buffer);
  if (normalized === "image/png") return probePng(buffer);
  if (normalized === "image/gif") return probeGif(buffer);
  if (normalized === "image/webp") return { format: "webp", width: null, height: null, probeError: null };
  return { format: "unknown", width: null, height: null, probeError: null };
}

function inferImageFormat(mimeType: string, fileName: string): ImageProbe["format"] {
  const normalized = normalizeMimeType(mimeType, fileName).toLowerCase();
  if (normalized === "image/jpeg") return "jpeg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  return "unknown";
}

export async function validateMetaInstagramFeedPublishDryRun(args: {
  ownerId: string;
  mediaItemId: string;
  profile?: PortalMediaGrowthProfile;
  portalVariant?: "portal" | "credit";
  isOwnerSession?: boolean;
}): Promise<MetaInstagramFeedDryRunResult> {
  const profile = args.profile || await getPortalMediaGrowthProfile(args.ownerId, args.mediaItemId);
  const readiness = await getPortalMetaProviderReadiness(args.ownerId, {
    portalVariant: args.portalVariant || "portal",
    isOwnerSession: args.isOwnerSession ?? true,
  });
  const connection = await getPortalMetaConnectionForPublishing(args.ownerId);

  const row = await (prisma as any).portalMediaItem.findFirst({
    where: { ownerId: args.ownerId, id: args.mediaItemId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      bytes: true,
      storageUrl: true,
      publicToken: true,
    },
  }).catch(() => null) as PortalMediaItemProbeRow | null;

  const probeBuffer = row ? await readProbeBuffer(row).catch(() => null) : null;
  const imageProbe = row
    ? (probeBuffer ? probeImage(probeBuffer, row.mimeType, row.fileName) : {
      format: inferImageFormat(row.mimeType, row.fileName),
      width: null,
      height: null,
      probeError: inferImageFormat(row.mimeType, row.fileName) === "jpeg"
        ? "Purely could not read JPEG dimensions from the stored asset bytes or blob URL."
        : null,
    })
    : { format: null, width: null, height: null, probeError: "Media item not found." };

  return inspectMetaInstagramFeedPublishDryRun({
    connection: {
      state: normalizeConnectionState(readiness.status),
      mode: readiness.integrationMode,
      connectedAccountLabel: normalizeString(readiness.connectedAccountLabel),
      connectedMetaUserId: normalizeString(readiness.connectedMetaUserId),
      hasAccessToken: Boolean(connection.secret?.accessToken),
      accessTokenExpiresAtIso: normalizeString(connection.bundle?.accessTokenExpiresAtIso || connection.secret?.accessTokenExpiresAtIso),
      grantedScopes: Array.isArray(connection.secret?.grantedScopes) ? connection.secret.grantedScopes : [],
      permissionGaps: Array.isArray(connection.bundle?.permissionGaps) ? connection.bundle.permissionGaps : [],
      primaryDiagnostic: readiness.primaryDiagnostic,
    },
    profile: {
      distributionProvider: profile.distributionProvider,
      targetPlatform: profile.targetPlatform,
      captionDraft: profile.captionDraft,
      providerDestinationType: profile.providerDestinationType,
      providerDestinationId: profile.providerDestinationId,
      providerDestinationLabel: profile.providerDestinationLabel,
      providerScheduledForIso: profile.providerScheduledForIso,
    },
    asset: {
      mediaItemId: row?.id || args.mediaItemId,
      fileName: row?.fileName || "",
      mimeType: row?.mimeType || "application/octet-stream",
      fileSize: typeof row?.fileSize === "number" ? row.fileSize : null,
      resolvedPublicUrl: row ? resolvePublicAssetUrl(row) : null,
      format: imageProbe.format,
      width: imageProbe.width,
      height: imageProbe.height,
      probeError: imageProbe.probeError,
    },
    livePublishApproved: false,
  });
}