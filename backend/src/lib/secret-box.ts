import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { env } from "../env";
import { AppError } from "./app-error";

// Secrets the app itself has to store and read back (today: the SMTP password an Admin
// saves) are encrypted at rest with AES-256-GCM. The key is derived from the environment
// variable SETTINGS_ENCRYPTION_KEY, which is never stored in the database, so a copy of the
// database alone does not reveal them.
//
// A stored value is "v1:<iv>:<auth tag>:<ciphertext>", each part base64. GCM authenticates
// the ciphertext: a value that was changed, or written with another key, fails to decrypt
// instead of decrypting to something else.

const VERSION = "v1";
const IV_BYTES = 12;

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "opencrm:settings:v1", 32));
}

export function canEncryptSecrets(secret = env.SETTINGS_ENCRYPTION_KEY): boolean {
  return secret !== undefined;
}

// Refuses, rather than storing plain text, when the installation has no key.
export function encryptSecret(plain: string, secret = env.SETTINGS_ENCRYPTION_KEY): string {
  if (secret === undefined) {
    throw new AppError(
      "ENCRYPTION_KEY_MISSING",
      409,
      "Set SETTINGS_ENCRYPTION_KEY in the server's environment before saving a password",
    );
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(":");
}

// null when the value cannot be read: the key is missing or was changed, or the value was
// tampered with. The caller decides what that means; nothing about the reason is revealed.
export function decryptSecret(stored: string, secret = env.SETTINGS_ENCRYPTION_KEY): string | null {
  const [version, iv, tag, encrypted] = stored.split(":");
  if (secret === undefined || version !== VERSION || !iv || !tag || encrypted === undefined) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
