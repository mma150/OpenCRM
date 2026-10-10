import { adminUser } from "@/test/render-with-store";

import type { User } from "./users.types";

// Users shared by the users tests: the signed-in Admin, a manager, their rep, an invited
// person and a deactivated one.
export const admin: User = {
  ...adminUser,
  status: "ACTIVE",
  managerId: null,
  manager: null,
  createdAt: "2026-10-01T09:00:00.000Z",
};

export const manager: User = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Mia Manager",
  email: "mia@example.com",
  role: "SALES_MANAGER",
  status: "ACTIVE",
  managerId: null,
  manager: null,
  createdAt: "2026-10-02T09:00:00.000Z",
};

export const rep: User = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Rob Rep",
  email: "rob@example.com",
  role: "SALES_REP",
  status: "ACTIVE",
  managerId: manager.id,
  manager: { id: manager.id, name: manager.name, status: "ACTIVE" },
  createdAt: "2026-10-03T09:00:00.000Z",
};

export const invited: User = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Ina Invited",
  email: "ina@example.com",
  role: "READ_ONLY",
  status: "INVITED",
  managerId: null,
  manager: null,
  createdAt: "2026-10-04T09:00:00.000Z",
};

export const deactivated: User = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Dan Deactivated",
  email: "dan@example.com",
  role: "SALES_REP",
  status: "DEACTIVATED",
  managerId: null,
  manager: null,
  createdAt: "2026-10-05T09:00:00.000Z",
};

export const allUsers: User[] = [admin, manager, rep, invited, deactivated];
