import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

// The outgoing mail server in effect. `source` says where it comes from: the settings an
// Admin saved (DATABASE), the server's SMTP_* variables (ENVIRONMENT) or nowhere (NONE).
// The password is never part of it; `hasPassword` says whether one is stored.
export type EmailSettings = Schemas["EmailSettings"];
export type EmailSource = EmailSettings["source"];
// `password` left out keeps the stored one; `null` removes it.
export type UpdateEmailSettingsInput = Schemas["UpdateEmailSettingsBody"];
export type TestEmailResult = Schemas["TestEmailResult"];
// Whether email is on at all; every signed-in user may ask.
export type EmailStatus = Schemas["EmailStatus"];

// Response bodies: { data, meta }.
export type EmailSettingsResponse =
  paths["/settings/email"]["get"]["responses"]["200"]["content"]["application/json"];
export type EmailStatusResponse =
  paths["/settings/email/status"]["get"]["responses"]["200"]["content"]["application/json"];
export type TestEmailResponse =
  paths["/settings/email/test"]["post"]["responses"]["200"]["content"]["application/json"];
