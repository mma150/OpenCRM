import type { Role } from "@/lib/user-labels";

// What a role may do with the records it can see: leads, contacts, companies and
// opportunities follow the same rule. The API decides which records those are (everyone's,
// the team's or only one's own) and enforces all of this; the UI only avoids offering what
// would be refused.
export function recordAccess(role: Role): { canWrite: boolean; canReassign: boolean } {
  return {
    // Read-only sees every record but changes nothing.
    canWrite: role !== "READ_ONLY",
    canReassign: role === "ADMIN" || role === "SALES_MANAGER",
  };
}
