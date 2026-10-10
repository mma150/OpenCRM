import type { components } from "@/lib/api/schema";

export type Role = components["schemas"]["Role"];
export type UserStatus = components["schemas"]["UserStatus"];

// The words shown for a role or a status, everywhere in the app.
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  SALES_MANAGER: "Sales Manager",
  SALES_REP: "Sales Rep",
  READ_ONLY: "Read-only",
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DEACTIVATED: "Deactivated",
};

// "Priya Shah" -> "PS", for the avatar.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}
