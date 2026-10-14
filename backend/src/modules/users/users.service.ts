import { type AuthTokenType, Prisma, type Role, type User } from "../../generated/prisma/client";
import { createAccountLink, inviteMessage, passwordResetMessage } from "../../lib/account-links";
import { AppError } from "../../lib/app-error";
import {
  buildCsvExport,
  type CsvExport,
  enumLabel,
  type ExportColumn,
  exportWindow,
  momentFormatter,
} from "../../lib/csv-export";
import { sendMail } from "../../lib/mailer";
import { lockUserAdministration, prisma } from "../../lib/prisma";
import { type Actor, assignableUsers } from "../../lib/record-access";
import type {
  ApiUser,
  AssignableUser,
  CreateUserBody,
  LinkResult,
  UpdateUserBody,
  UserExportQuery,
  UserStatus,
} from "./users.schema";

type UserWithManager = User & { manager: User | null };

const withManager = { manager: true } as const;

function statusOf(user: User): UserStatus {
  if (!user.isActive) {
    return "DEACTIVATED";
  }
  return user.passwordHash ? "ACTIVE" : "INVITED";
}

function toApiUser(user: UserWithManager): ApiUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: statusOf(user),
    managerId: user.managerId,
    manager: user.manager
      ? { id: user.manager.id, name: user.manager.name, status: statusOf(user.manager) }
      : null,
    createdAt: user.createdAt.toISOString(),
  };
}

function notFound(): AppError {
  return new AppError("NOT_FOUND", 404, "User not found");
}

function emailInUse(): AppError {
  return new AppError("EMAIL_IN_USE", 409, "Another user already has this email");
}

// Same shape as a Zod failure, so the form shows the message beside the field.
function fieldError(path: string, message: string): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed", [{ path, message }]);
}

// The database refuses a second row with the same email even when two requests race
// past the check that comes first.
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Teams (D-17): only a Sales Rep has a manager, and it must be a Sales Manager who has
// not been deactivated. A manager who is still "invited" is allowed.
async function assertValidManager(
  tx: Prisma.TransactionClient,
  managerId: string,
  role: Role,
): Promise<void> {
  if (role !== "SALES_REP") {
    throw fieldError("managerId", "Only a Sales Rep can have a manager");
  }
  const manager = await tx.user.findUnique({ where: { id: managerId } });
  if (manager?.role !== "SALES_MANAGER" || !manager.isActive) {
    throw fieldError("managerId", "Choose an active Sales Manager");
  }
}

// D-18: at least one Admin must be able to sign in. An Admin who is deactivated, or
// invited and without a password, does not count. Call inside lockUserAdministration.
async function assertNotLastAdmin(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const others = await tx.user.count({
    where: { role: "ADMIN", isActive: true, passwordHash: { not: null }, id: { not: userId } },
  });
  if (others === 0) {
    throw new AppError(
      "LAST_ADMIN",
      409,
      "This is the only Admin who can sign in. Make another user an Admin first.",
    );
  }
}

// Emails the link when email works; otherwise hands it back for the Admin to pass on (D-10).
async function deliverLink(user: User, type: AuthTokenType): Promise<LinkResult> {
  const link = await createAccountLink(user.id, type);
  const message = type === "INVITE" ? inviteMessage(user, link) : passwordResetMessage(user, link);
  const emailed = await sendMail(message);
  return { emailed, link: emailed ? null : link };
}

async function findUser(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw notFound();
  }
  return user;
}

const byName = [{ name: "asc" }, { createdAt: "asc" }] as const;

// Everyone, deactivated users included. Not paged: an installation has tens of users.
export async function listUsers(): Promise<ApiUser[]> {
  const users = await prisma.user.findMany({ include: withManager, orderBy: [...byName] });
  return users.map((user) => toApiUser(user));
}

// How a role is written in the app: "Sales Manager", "Read-only".
const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  SALES_MANAGER: "Sales Manager",
  SALES_REP: "Sales Rep",
  READ_ONLY: "Read-only",
};

// DATA-03: the users list as a CSV file, for Admins. Only what the list shows: no password
// hash, token, session or sign-in lock data ever goes in the file. The last sign-in is not
// stored (sessions are deleted when they end), so there is no column for it.
export async function exportUsers(query: UserExportQuery): Promise<CsvExport> {
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiUser>[] = [
    { header: "Name", value: (user) => user.name },
    { header: "Email", value: (user) => user.email },
    { header: "Role", value: (user) => ROLE_LABELS[user.role] },
    { header: "Status", value: (user) => enumLabel(user.status) },
    { header: "Manager", value: (user) => user.manager?.name ?? null },
    { header: "Created", value: (user) => moment(user.createdAt) },
  ];
  const [users, total] = await Promise.all([
    prisma.user.findMany({ include: withManager, orderBy: [...byName], ...exportWindow }),
    prisma.user.count(),
  ]);
  return buildCsvExport(columns, { items: users.map((user) => toApiUser(user)), total });
}

// The people the caller may make the owner of a record; the rule is in lib/record-access.ts.
export async function listAssignableUsers(actor: Actor): Promise<AssignableUser[]> {
  return prisma.user.findMany({
    where: assignableUsers(actor),
    select: { id: true, name: true, role: true },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}

// Creates the user without a password ("invited") and sends them a link to choose one (D-09).
export async function inviteUser(
  input: CreateUserBody,
): Promise<{ user: ApiUser; invite: LinkResult }> {
  const managerId = input.managerId ?? null;
  if (managerId) {
    await assertValidManager(prisma, managerId, input.role);
  }
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw emailInUse();
  }

  let user: UserWithManager;
  try {
    user = await prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, managerId },
      include: withManager,
    });
  } catch (error) {
    throw isUniqueViolation(error) ? emailInUse() : error;
  }
  return { user: toApiUser(user), invite: await deliverLink(user, "INVITE") };
}

export async function updateUser(
  id: string,
  input: UpdateUserBody,
): Promise<{ user: ApiUser; reassignedReports: number }> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUserAdministration(tx);
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) {
        throw notFound();
      }

      const role = input.role ?? user.role;
      if (user.role === "ADMIN" && role !== "ADMIN") {
        await assertNotLastAdmin(tx, id);
      }

      // A user who stops being a Sales Rep loses their manager.
      let managerId = role === "SALES_REP" ? user.managerId : null;
      if (input.managerId !== undefined) {
        if (input.managerId) {
          await assertValidManager(tx, input.managerId, role);
        }
        managerId = input.managerId;
      }

      const email = input.email ?? user.email;
      if (email !== user.email) {
        if (await tx.user.findUnique({ where: { email } })) {
          throw emailInUse();
        }
        // Links already sent went to the old address. An invited user needs a new invite.
        await tx.authToken.deleteMany({ where: { userId: id } });
      }

      // A user who stops being a Sales Manager no longer has a team.
      let reassignedReports = 0;
      if (user.role === "SALES_MANAGER" && role !== "SALES_MANAGER") {
        const result = await tx.user.updateMany({
          where: { managerId: id },
          data: { managerId: null },
        });
        reassignedReports = result.count;
      }

      const updated = await tx.user.update({
        where: { id },
        data: { name: input.name ?? user.name, email, role, managerId },
        include: withManager,
      });
      return { user: toApiUser(updated), reassignedReports };
    });
  } catch (error) {
    throw isUniqueViolation(error) ? emailInUse() : error;
  }
}

// Ends the user's sessions at once and blocks sign-in and password reset. Nothing is
// deleted, and their reps keep them as manager so reactivating restores the team (D-19).
export async function deactivateUser(id: string, actorId: string): Promise<ApiUser> {
  if (id === actorId) {
    throw new AppError("FORBIDDEN", 403, "You cannot deactivate your own account");
  }
  return prisma.$transaction(async (tx) => {
    await lockUserAdministration(tx);
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) {
      throw notFound();
    }
    if (user.role === "ADMIN" && user.isActive) {
      await assertNotLastAdmin(tx, id);
    }
    await tx.session.deleteMany({ where: { userId: id } });
    const updated = await tx.user.update({
      where: { id },
      data: { isActive: false },
      include: withManager,
    });
    return toApiUser(updated);
  });
}

// Same role and manager as before. A user who never accepted their invite is "invited" again.
export async function reactivateUser(id: string): Promise<ApiUser> {
  await findUser(id);
  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: true },
    include: withManager,
  });
  return toApiUser(updated);
}

// A new invite link; the earlier one stops working (D-11).
export async function resendInvite(id: string): Promise<LinkResult> {
  const user = await findUser(id);
  if (statusOf(user) !== "INVITED") {
    throw new AppError(
      "VALIDATION_FAILED",
      400,
      "Only a user who has not accepted their invite yet can be sent a new one",
    );
  }
  return deliverLink(user, "INVITE");
}

// Lets an Admin help someone who cannot get the reset email (D-10).
export async function createPasswordResetLink(id: string): Promise<LinkResult> {
  const user = await findUser(id);
  if (statusOf(user) !== "ACTIVE") {
    throw new AppError(
      "VALIDATION_FAILED",
      400,
      "A reset link can be made only for an active user who has set a password",
    );
  }
  return deliverLink(user, "PASSWORD_RESET");
}
