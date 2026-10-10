import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ipKeyGenerator, type Options, rateLimit } from "express-rate-limit";

import { AppError } from "../lib/app-error";
import { getAuth } from "./authenticate";

// Defaults for the public auth routes (D-04). Tests pass their own numbers.
export interface RateLimitOptions {
  // Requests per window from one address to the routes that take a password or a link.
  ipLimit?: number;
  // Requests per window for one email address (login, forgot password).
  emailLimit?: number;
  // Requests per window from one address to the cheap first-run check.
  statusLimit?: number;
  // Emails per window one signed-in user may send (from a record, a quote, a test message).
  sendLimit?: number;
  windowMs?: number;
}

export interface AuthLimiters {
  status: RequestHandler;
  publicIp: RequestHandler;
  loginIp: RequestHandler;
  loginEmail: RequestHandler;
  forgotEmail: RequestHandler;
  // Not an auth route: put it after `authenticate` on a route that sends an email for a user.
  sendEmail: RequestHandler;
}

// Answers through the error handler, so a refusal has the same envelope as every other
// error. The library has already set the Retry-After header by the time this runs.
function refuse(_req: Request, res: Response, next: NextFunction) {
  const retryAfterSeconds = Number(res.getHeader("Retry-After")) || 60;
  next(
    new AppError("RATE_LIMITED", 429, "Too many attempts. Wait a few minutes and try again.", {
      retryAfterSeconds,
    }),
  );
}

// One bucket per email address, so guesses against one account are limited wherever they
// come from. Lowercased and cut to the maximum length of an email; without an email it
// falls back to the address (through ipKeyGenerator, which groups an IPv6 network).
function emailKey(req: Request): string {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  return email ? `email:${email.slice(0, 254)}` : ipKeyGenerator(req.ip ?? "");
}

// Counters live in memory: they reset on restart and are per process. The account lock
// is in the database, so it does not depend on them.
export function createAuthLimiters(options: RateLimitOptions = {}): AuthLimiters {
  const {
    ipLimit = 30,
    emailLimit = 8,
    statusLimit = 300,
    sendLimit = 30,
    windowMs = 5 * 60 * 1000,
  } = options;

  const build = (extra: Partial<Options>) =>
    rateLimit({
      windowMs,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: refuse,
      ...extra,
    });

  return {
    status: build({ limit: statusLimit }),
    publicIp: build({ limit: ipLimit }),
    // A successful sign-in does not count, so only wrong passwords use up the allowance.
    loginIp: build({ limit: ipLimit, skipSuccessfulRequests: true }),
    loginEmail: build({ limit: emailLimit, skipSuccessfulRequests: true, keyGenerator: emailKey }),
    forgotEmail: build({ limit: emailLimit, keyGenerator: emailKey }),
    // One bucket per signed-in user, so a stolen session or a runaway script cannot use the
    // organisation's mail server to send in bulk.
    sendEmail: build({ limit: sendLimit, keyGenerator: (req) => `user:${getAuth(req).user.id}` }),
  };
}
