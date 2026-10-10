import type { User } from "../generated/prisma/client";
import { prisma } from "./prisma";
import { hashToken, newToken } from "./tokens";

// A session lasts 30 days from its last use (D-02).
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// The expiry is pushed forward at most once an hour, so most requests only read.
const RENEW_AFTER_MS = 60 * 60 * 1000;

export interface ResolvedSession {
  sessionId: string;
  user: User;
  // True when the expiry was just pushed forward, so the cookie should be sent again.
  renewed: boolean;
}

// Always a new random token: a session is never reused across sign-ins.
// Returns the token; only its hash is stored.
export async function createSession(userId: string): Promise<string> {
  const { token, tokenHash } = newToken();
  const now = new Date();
  // Housekeeping: this user's expired sessions go when they sign in again.
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: now } } });
  await prisma.session.create({
    data: { userId, tokenHash, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
  return token;
}

// Looked up in the database on every request, so signing out and deactivating
// take effect at once (D-01).
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  const now = new Date();
  if (!session || session.expiresAt <= now || !session.user.isActive) {
    return null;
  }

  const renewed = now.getTime() - session.lastUsedAt.getTime() > RENEW_AFTER_MS;
  if (renewed) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
    });
  }
  return { sessionId: session.id, user: session.user, renewed };
}
