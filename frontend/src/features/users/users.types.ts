import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type User = Schemas["User"];
export type UserStatus = Schemas["UserStatus"];
// An invite or reset link. `link` is set only when it was not emailed (D-10).
export type LinkResult = Schemas["LinkResult"];

// Someone the signed-in user may assign a record to: { id, name, role }.
export type AssignableUser = Schemas["AssignableUser"];

export type InviteUserInput = Schemas["CreateUserBody"];
export type UpdateUserInput = Schemas["UpdateUserBody"];

// Response bodies: { data, meta }.
export type UsersResponse =
  paths["/users"]["get"]["responses"]["200"]["content"]["application/json"];
export type InviteUserResponse =
  paths["/users"]["post"]["responses"]["201"]["content"]["application/json"];
export type UpdateUserResponse =
  paths["/users/{id}"]["patch"]["responses"]["200"]["content"]["application/json"];
export type UserResponse =
  paths["/users/{id}/deactivate"]["post"]["responses"]["200"]["content"]["application/json"];
export type AssignableUsersResponse =
  paths["/users/assignable"]["get"]["responses"]["200"]["content"]["application/json"];
export type LinkResponse =
  paths["/users/{id}/resend-invite"]["post"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps: the users plus `meta.mailEnabled` from the list response.
export type UserList = { users: User[]; mailEnabled: boolean };
export type InviteUserResult = InviteUserResponse["data"];
export type UpdateUserResult = { user: User; reassignedReports: number };
