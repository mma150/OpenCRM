import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Role = Schemas["Role"];
export type Me = Schemas["Me"];
export type SetupStatus = Schemas["SetupStatus"];
export type InviteInfo = Schemas["InviteInfo"];

export type LoginInput = Schemas["LoginBody"];
export type SetupInput = Schemas["SetupBody"];
// Reset password and accept invite send the same body: { token, password }.
export type TokenPasswordInput = Schemas["ResetPasswordBody"];
export type UpdateProfileInput = Schemas["UpdateProfileBody"];
export type ChangePasswordInput = Schemas["ChangePasswordBody"];

// Response bodies: { data, meta }.
export type MeResponse =
  paths["/auth/me"]["get"]["responses"]["200"]["content"]["application/json"];
export type SetupStatusResponse =
  paths["/auth/setup-status"]["get"]["responses"]["200"]["content"]["application/json"];
export type InviteInfoResponse =
  paths["/auth/invite-info"]["post"]["responses"]["200"]["content"]["application/json"];
