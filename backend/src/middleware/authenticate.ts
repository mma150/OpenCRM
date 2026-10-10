import type { NextFunction, Request, Response } from "express";

import type { User } from "../generated/prisma/client";
import { AppError } from "../lib/app-error";
import { readSessionCookie, setSessionCookie } from "../lib/session-cookie";
import { resolveSession } from "../lib/sessions";

export interface AuthContext {
  user: User;
  sessionId: string;
}

// Who is signed in on each request. A WeakMap keeps this typed without changing
// the Express Request type, and forgets the entry when the request is done.
const contexts = new WeakMap<Request, AuthContext>();

function unauthenticated(): AppError {
  return new AppError("UNAUTHENTICATED", 401, "Sign in to continue");
}

// The same token works as a cookie (browser) or as "Authorization: Bearer" (mobile app).
function readBearerToken(req: Request): string | null {
  const match = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "");
  return match?.[1] ?? null;
}

// Put on every route that needs a signed-in user. Anything else gets UNAUTHENTICATED.
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const cookieToken = readSessionCookie(req);
  const token = cookieToken ?? readBearerToken(req);
  const session = token ? await resolveSession(token) : null;
  if (!session) {
    throw unauthenticated();
  }
  if (session.renewed && cookieToken) {
    // Sliding expiry (D-02): the lifetime of the cookie follows the session.
    setSessionCookie(res, cookieToken);
  }
  contexts.set(req, { user: session.user, sessionId: session.sessionId });
  next();
}

// For controllers and middleware that run after `authenticate`.
export function getAuth(req: Request): AuthContext {
  const context = contexts.get(req);
  if (!context) {
    throw unauthenticated();
  }
  return context;
}
