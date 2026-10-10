import { createHash, randomBytes } from "node:crypto";

// Session, invite and password-reset tokens are 256 random bits. Only the SHA-256 hash is
// stored, so a copy of the database does not hand out usable sessions or links. A fast hash
// is right here (unlike for passwords) because the token cannot be guessed.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}
