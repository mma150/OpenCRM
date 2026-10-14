import type { User } from "../../generated/prisma/client";
import {
  claimToken,
  createAccountLink,
  findUsableToken,
  passwordResetMessage,
} from "../../lib/account-links";
import { AppError } from "../../lib/app-error";
import { sendMail } from "../../lib/mailer";
import {
  assertPasswordAllowed,
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from "../../lib/password";
import { lockUserAdministration, prisma } from "../../lib/prisma";
import { startSession } from "../../lib/sessions";
import type { InviteInfo, Me, SetupStatus, TokenSession } from "./auth.schema";

// Ten wrong passwords in a row lock the account for 15 minutes (D-04).
// The lock clears on its own, and a password reset clears it too.
export const LOCK_AFTER_FAILURES = 10;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

interface SignedIn {
  user: Me;
  // The session token. The controller puts it in the cookie (the web app) or in the body
  // (POST /auth/token, the mobile app); it is never stored.
  token: string;
  expiresAt: Date;
}

export function toMe(user: User): Me {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function signIn(user: User): Promise<SignedIn> {
  const { token, expiresAt } = await startSession(user.id);
  return { user: toMe(user), token, expiresAt };
}

// What POST /auth/token answers with: the one place a session token is in a response body.
export function toTokenSession(signedIn: SignedIn): TokenSession {
  return {
    user: signedIn.user,
    token: signedIn.token,
    expiresAt: signedIn.expiresAt.toISOString(),
  };
}

function invalidCredentials(): AppError {
  // One message for a wrong email and a wrong password (D-08).
  return new AppError("INVALID_CREDENTIALS", 401, "Email or password is incorrect");
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return { setupRequired: (await prisma.user.count()) === 0 };
}

// First run (D-07): the first visitor creates the Admin. Once any user exists this is
// closed for good. The lock makes two simultaneous first visitors take turns.
export async function setupAdmin(input: {
  name: string;
  email: string;
  password: string;
}): Promise<SignedIn> {
  assertPasswordAllowed(input.password);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    await lockUserAdministration(tx);
    if ((await tx.user.count()) > 0) {
      throw new AppError("SETUP_CLOSED", 409, "Setup is already complete. Sign in instead.");
    }
    return tx.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "ADMIN" },
    });
  });
  return signIn(user);
}

export async function login(email: string, password: string): Promise<SignedIn> {
  const user = await prisma.user.findUnique({ where: { email } });

  // 1. No account, or invited and no password yet: spend the same time as a real check.
  if (!user?.passwordHash) {
    await verifyDummyPassword(password);
    throw invalidCredentials();
  }

  // 2. Locked: refuse before looking at the password, and do not extend the lock.
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(
      "ACCOUNT_LOCKED",
      423,
      "Too many wrong passwords. This account is locked for a few minutes.",
      { retryAfterSeconds },
    );
  }
  // 3. A lock that has run out starts a fresh count, or one wrong guess would lock again.
  const failedBefore = user.lockedUntil ? 0 : user.failedLoginCount;

  // 4. Check the password.
  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = failedBefore + 1;
    await prisma.user.update({
      where: { id: user.id },
      data:
        failed >= LOCK_AFTER_FAILURES
          ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) }
          : { failedLoginCount: failed, lockedUntil: null },
    });
    throw invalidCredentials();
  }

  // 5. Only someone who knows the password learns that the account is deactivated (D-08).
  if (!user.isActive) {
    throw new AppError("ACCOUNT_DEACTIVATED", 403, "This account has been deactivated");
  }

  // 6. Success: clear the count and start a new session.
  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
  return signIn(user);
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

// Sends a reset link when the email belongs to an active account that has a password.
// The caller answers the same way in every case, and the email goes out in the background,
// so neither the answer nor its timing says whether the account exists (D-08).
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.isActive || !user.passwordHash) {
    return;
  }
  const link = await createAccountLink(user.id, "PASSWORD_RESET");
  // Not awaited on purpose. sendMail never rejects; a failure is logged there.
  void sendMail(passwordResetMessage(user, link));
}

// Ends every session of the user and clears any lock: they sign in fresh with the
// new password (D-06).
export async function resetPassword(token: string, password: string): Promise<void> {
  const record = await findUsableToken(token, "PASSWORD_RESET");
  assertPasswordAllowed(password);
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    await claimToken(tx, record.id);
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });
}

// Lets the invite page greet the person before they choose a password.
export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const { user } = await findUsableToken(token, "INVITE");
  return { name: user.name, email: user.email, role: user.role };
}

export async function acceptInvite(token: string, password: string): Promise<SignedIn> {
  const record = await findUsableToken(token, "INVITE");
  assertPasswordAllowed(password);
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    await claimToken(tx, record.id);
    return tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
  });
  return signIn(user);
}

export async function updateProfile(userId: string, name: string): Promise<Me> {
  return toMe(await prisma.user.update({ where: { id: userId }, data: { name } }));
}

// Keeps the session that made the change and ends the others of the user (D-06).
export async function changePassword(
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    // Not a 401: the session is fine, one field of the form is wrong.
    throw new AppError("VALIDATION_FAILED", 400, "Request validation failed", [
      { path: "currentPassword", message: "Current password is incorrect" },
    ]);
  }
  assertPasswordAllowed(newPassword, "newPassword");
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId, NOT: { id: sessionId } } }),
  ]);
}
