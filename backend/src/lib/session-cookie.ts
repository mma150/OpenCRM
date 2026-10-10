import type { CookieOptions, Request, Response } from "express";

import { env } from "../env";
import { SESSION_TTL_MS } from "./sessions";

// The __Host- prefix makes the browser refuse the cookie unless it is Secure, has Path=/
// and no Domain, so it is used whenever the cookie is Secure (production).
export const SESSION_COOKIE_NAME = env.SESSION_COOKIE_SECURE
  ? "__Host-opencrm_session"
  : "opencrm_session";

// httpOnly keeps the token away from page scripts; SameSite=Lax keeps it off cross-site
// POSTs. Setting and clearing must use the same options or the browser keeps the cookie.
const baseOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.SESSION_COOKIE_SECURE,
  path: "/",
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, { ...baseOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseOptions);
}

export function readSessionCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[SESSION_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : null;
}
