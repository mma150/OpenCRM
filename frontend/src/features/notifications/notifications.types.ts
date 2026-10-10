import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Notification = Schemas["Notification"];
export type NotificationKind = Schemas["NotificationKind"];

// Page and `unread` of GET /notifications.
export type NotificationListQuery = NonNullable<
  paths["/notifications"]["get"]["parameters"]["query"]
>;

// Response bodies: { data, meta }.
export type NotificationsResponse =
  paths["/notifications"]["get"]["responses"]["200"]["content"]["application/json"];
export type NotificationResponse =
  paths["/notifications/{id}/read"]["post"]["responses"]["200"]["content"]["application/json"];
export type UnreadCountResponse =
  paths["/notifications/unread-count"]["get"]["responses"]["200"]["content"]["application/json"];
export type MarkedReadResponse =
  paths["/notifications/read-all"]["post"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for the list: the notifications loaded so far (newest first) plus the
// `meta` of the last page that was loaded (page, pageSize, total).
export type NotificationList = { notifications: Notification[] } & Schemas["ListMeta"];
