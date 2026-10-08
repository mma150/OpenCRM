import type { components, paths } from "@/lib/api/schema";

// Both types come from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
export type Health = components["schemas"]["Health"];

// The body of a successful GET /health: { data, meta }.
export type HealthResponse =
  paths["/health"]["get"]["responses"]["200"]["content"]["application/json"];
