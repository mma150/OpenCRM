import type { Role } from "../generated/prisma/client";
import { AppError } from "./app-error";

// Who may see and change an owned record (ROLE-04 to ROLE-08). Every model that has an owner
// (leads, contacts, companies, opportunities; tasks later) names the column `ownerId` and the
// relation `owner`, and its service uses these helpers instead of writing its own rules.
//
//   Admin          sees and changes every record
//   Sales Manager  sees and changes records owned by themselves or by a rep on their team
//   Sales Rep      sees and changes only records they own
//   Read-only      sees every record and changes nothing

// The signed-in user, as far as these rules care. A Prisma `User` fits.
export interface Actor {
  id: string;
  role: Role;
}

// Roles that can own a record. A Read-only user cannot work a record, so cannot own one.
export const OWNER_ROLES: Role[] = ["ADMIN", "SALES_MANAGER", "SALES_REP"];

// The Prisma `where` fragment for "records this user may see". Spread it into every query on
// an owned model, lists and single reads alike: a record outside it is then simply not found,
// which is what the API must answer (NOT_FOUND, never FORBIDDEN, so its existence stays hidden).
export function visibleRecords(actor: Actor) {
  switch (actor.role) {
    case "ADMIN":
    case "READ_ONLY": {
      return {};
    }
    case "SALES_MANAGER": {
      return { OR: [{ ownerId: actor.id }, { owner: { managerId: actor.id } }] };
    }
    case "SALES_REP": {
      return { ownerId: actor.id };
    }
  }
}

// The same fragment for a model with a soft delete: what this user may see, never a deleted
// row. A record's own service builds its "visible" function from this rule; use this one to
// show a record inside another (an opportunity's contact, the lead a contact came from)
// without importing the other record's service.
export function visibleLiveRecords(actor: Actor) {
  return { deletedAt: null, ...visibleRecords(actor) };
}

// Call first in every service function that creates, changes or deletes an owned record.
// Read-only is the one role that sees records it may not change; for everyone else,
// "may change" is the same set as "may see", so looking the record up with
// visibleRecords() afterwards completes the check.
export function assertCanWrite(actor: Actor): void {
  if (actor.role === "READ_ONLY") {
    throw new AppError("FORBIDDEN", 403, "Your role can view records but not change them");
  }
}

// Handing a record to someone else is for Admins and Sales Managers (LEAD-02).
export function assertCanReassign(actor: Actor): void {
  if (actor.role !== "ADMIN" && actor.role !== "SALES_MANAGER") {
    throw new AppError("FORBIDDEN", 403, "Only an Admin or a Sales Manager can reassign records");
  }
}

// The Prisma `where` fragment on User for "people this user may make the owner of a record":
// active users who can own one, narrowed to the caller's own reach. A user who has not
// accepted their invite yet counts, so work can be waiting for them when they first sign in.
export function assignableUsers(actor: Actor) {
  const canOwn = { isActive: true, role: { in: OWNER_ROLES } };
  switch (actor.role) {
    case "ADMIN": {
      return canOwn;
    }
    case "SALES_MANAGER": {
      return { ...canOwn, OR: [{ id: actor.id }, { managerId: actor.id }] };
    }
    case "SALES_REP": {
      return { ...canOwn, id: actor.id };
    }
    case "READ_ONLY": {
      // An empty list matches nobody.
      return { id: { in: [] } };
    }
  }
}
