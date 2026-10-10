import { fieldError } from "./app-error";
import { prisma } from "./prisma";
import { type Actor, assignableUsers } from "./record-access";

// The owner of an owned record, shared by the leads, contacts and companies services.

// Include this in every query whose rows are sent with their `owner`.
export const withOwner = { owner: { select: { id: true, name: true } } } as const;

// A type alias, not an interface, so it can be written into a timeline entry's JSON details.
export type RecordOwner = { id: string; name: string };

// The new owner of a record must be someone the caller may assign records to (see
// assignableUsers); anyone else is a validation failure on `ownerId`, on create and on assign.
// `records` names the kind in the message: "leads", "contacts", "companies".
export async function assertAssignable(
  actor: Actor,
  ownerId: string,
  records: string,
): Promise<void> {
  const owner = await prisma.user.findFirst({
    where: { AND: [{ id: ownerId }, assignableUsers(actor)] },
  });
  if (!owner) {
    throw fieldError("ownerId", `Choose a user you can assign ${records} to`);
  }
}
