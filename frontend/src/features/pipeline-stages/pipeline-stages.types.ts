import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type PipelineStage = Schemas["PipelineStage"];
// OPEN stages are the steps of the pipeline; there is exactly one WON and one LOST stage.
export type StageKind = Schemas["StageKind"];

// Every stage route answers with the whole pipeline in order: { data, meta }.
export type PipelineStagesResponse =
  paths["/pipeline-stages"]["get"]["responses"]["200"]["content"]["application/json"];
