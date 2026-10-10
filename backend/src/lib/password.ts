import { readFileSync } from "node:fs";

import { hash, verify } from "@node-rs/argon2";

import { AppError } from "./app-error";

// The password rule (D-05): length only, plus a list of very common passwords.
// The same rule applies at setup, invite acceptance, reset and change.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// Source: SecLists, Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt
// (github.com/danielmiessler/SecLists, MIT licence), reduced to the entries of 10 or
// more characters and lowercased. The build copies the file beside dist/server.js.
const commonPasswords = new Set(
  readFileSync(new URL("./common-passwords.txt", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.length > 0),
);

export function isCommonPassword(password: string): boolean {
  return commonPasswords.has(password.toLowerCase());
}

// The length is checked by the Zod schema; this adds the common-password check.
// `path` names the request field, so the form can show the message beside it.
export function assertPasswordAllowed(password: string, path = "password"): void {
  if (isCommonPassword(password)) {
    throw new AppError("VALIDATION_FAILED", 400, "Request validation failed", [
      { path, message: "That password is too common. Choose a different one." },
    ]);
  }
}

// Argon2id with the library defaults, which are the OWASP minimum (m=19456, t=2, p=1).
// The result is a PHC string that carries its own salt and parameters.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A stored value that is not a valid hash never matches.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Spends the same time as a real check when there is no account to check against,
// so the response time does not reveal whether an email has an account (D-08).
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hash("a password nobody has");
  await verifyPassword(await dummyHash, password);
}
