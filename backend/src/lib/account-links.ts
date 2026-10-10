import { env } from "../env";
import type { AuthTokenType, Prisma } from "../generated/prisma/client";
import { AppError } from "./app-error";
import type { MailMessage } from "./mailer";
import { prisma } from "./prisma";
import { hashToken, newToken } from "./tokens";

// Invite links last 7 days, password-reset links 1 hour; both work once (D-11).
const LINKS = {
  INVITE: { ttlMs: 7 * 24 * 60 * 60 * 1000, page: "accept-invite" },
  PASSWORD_RESET: { ttlMs: 60 * 60 * 1000, page: "reset-password" },
} as const;

function invalidToken(): AppError {
  return new AppError("INVALID_TOKEN", 400, "This link is not valid any more. Ask for a new one.");
}

// Creates the link and cancels any earlier link of the same kind for this user.
// The address comes from APP_URL, never from the request's Host header.
export async function createAccountLink(userId: string, type: AuthTokenType): Promise<string> {
  const { token, tokenHash } = newToken();
  const { ttlMs, page } = LINKS[type];
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type } }),
    prisma.authToken.create({
      data: { userId, type, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ]);
  return `${env.APP_URL}/${page}?token=${token}`;
}

// The token row and its user, or INVALID_TOKEN when the link is unknown, of the other
// kind, used, expired, or belongs to a deactivated user (D-19).
export async function findUsableToken(token: string, type: AuthTokenType) {
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (
    !record ||
    record.type !== type ||
    record.usedAt !== null ||
    record.expiresAt <= new Date() ||
    !record.user.isActive
  ) {
    throw invalidToken();
  }
  return record;
}

// Marks the token used in one statement, so two requests cannot both redeem a link.
export async function claimToken(tx: Prisma.TransactionClient, tokenId: string): Promise<void> {
  const now = new Date();
  const { count } = await tx.authToken.updateMany({
    where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) {
    throw invalidToken();
  }
}

interface Recipient {
  name: string;
  email: string;
}

export function inviteMessage(user: Recipient, link: string): MailMessage {
  return {
    to: user.email,
    subject: "You have been invited to OpenCRM",
    text: [
      `Hello ${user.name},`,
      "You have been invited to OpenCRM. Open this link to choose your password and sign in:",
      link,
      "The link works once and expires in 7 days.",
    ].join("\n\n"),
  };
}

export function passwordResetMessage(user: Recipient, link: string): MailMessage {
  return {
    to: user.email,
    subject: "Reset your OpenCRM password",
    text: [
      `Hello ${user.name},`,
      "Open this link to choose a new OpenCRM password:",
      link,
      "The link works once and expires in 1 hour. If you did not ask for it, you can ignore this email.",
    ].join("\n\n"),
  };
}
