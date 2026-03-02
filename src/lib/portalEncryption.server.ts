import crypto from "node:crypto";

type EncryptedPayloadV1 = {
  version: 1;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
};

function masterSecretRaw(): string {
  return String(process.env.PORTAL_ENCRYPTION_MASTER_KEY || process.env.STRIPE_KEY_ENCRYPTION_SECRET || "").trim();
}

function deriveKey32(masterSecret: string): Buffer {
  // Derive a stable 32-byte key from an arbitrary-length secret.
  return crypto.createHash("sha256").update(masterSecret, "utf8").digest();
}

export function isPortalEncryptionConfigured(): boolean {
  return masterSecretRaw().length >= 16;
}

function requireKey(): Buffer {
  const raw = masterSecretRaw();
  if (!raw || raw.length < 16) {
    throw new Error(
      "Missing PORTAL_ENCRYPTION_MASTER_KEY (or STRIPE_KEY_ENCRYPTION_SECRET). Set it to a long random secret.",
    );
  }
  return deriveKey32(raw);
}

export function encryptStringV1(plaintext: string): EncryptedPayloadV1 {
  const text = String(plaintext ?? "");
  if (!text.trim()) throw new Error("Nothing to encrypt");

  const key = requireKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    ciphertextB64: ciphertext.toString("base64"),
    ivB64: iv.toString("base64"),
    authTagB64: authTag.toString("base64"),
  };
}

export function decryptStringV1(payload: EncryptedPayloadV1): string {
  if (!payload || payload.version !== 1) throw new Error("Unsupported encrypted payload version");

  const key = requireKey();
  const iv = Buffer.from(payload.ivB64, "base64");
  const authTag = Buffer.from(payload.authTagB64, "base64");
  const ciphertext = Buffer.from(payload.ciphertextB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return plaintext;
}
