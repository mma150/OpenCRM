import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import {
  daySchema,
  moneySchema,
  optionalText,
  recordLinkSchema,
  recordOwnerSchema,
} from "../../lib/record-fields";
import { stageKindSchema } from "../pipeline-stages/pipeline-stages.schema";

export const opportunitySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    // Money as a number with at most two decimals; 0 when no value was given.
    value: z.number(),
    // A day such as "2026-11-15", without a time.
    expectedCloseDate: z.string().nullable(),
    stage: z.object({ id: z.string(), name: z.string(), kind: stageKindSchema }),
    // Always the kind of the stage: OPEN until the opportunity is closed as WON or LOST.
    status: stageKindSchema,
    // Why it was won or lost. Always set on a lost one, optional on a won one, null while open.
    closeReason: z.string().nullable(),
    closedAt: z.string().nullable(),
    // Each is null when there is none, or it is one the caller may not see.
    contact: recordLinkSchema.nullable(),
    company: recordLinkSchema.nullable(),
    notes: z.string().nullable(),
    owner: recordOwnerSchema,
    // The lead this opportunity was made from by converting it, if the caller may see it.
    convertedFromLead: recordLinkSchema.nullable(),
    // When the latest logged conversation happened; null until the first one.
    lastContactAt: z.string().nullable(),
    // The follow-up reminder for the owner (PUT /opportunities/:id/follow-up); null when
    // none is set.
    followUpAt: z.string().nullable(),
    followUpNote: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Opportunity");

// Named ApiOpportunity in code because `Opportunity` is the Prisma row.
export type ApiOpportunity = z.infer<typeof opportunitySchema>;

// Exported for converting a lead, which can name the new opportunity.
export const opportunityNameSchema = z.string().trim().min(1, "Enter a name").max(200);

const opportunityFields = {
  expectedCloseDate: daySchema.nullable().optional(),
  // Each must be a record the caller may see. null means none.
  contactId: z.uuid().nullable().optional(),
  companyId: z.uuid().nullable().optional(),
  notes: optionalText(10_000),
};

export const createOpportunityBodySchema = z
  .strictObject({
    name: opportunityNameSchema,
    // Defaults to 0.
    value: moneySchema.optional(),
    ...opportunityFields,
    // An open stage. Defaults to the first one.
    stageId: z.uuid().optional(),
    // Defaults to the caller. Must be someone the caller may assign records to.
    ownerId: z.uuid().optional(),
  })
  .openapi("CreateOpportunityBody");

export type CreateOpportunityBody = z.infer<typeof createOpportunityBodySchema>;

// Only the keys that are sent are changed; null clears a field that can be empty. The stage
// is changed with the stage, close and reopen routes, the owner with the assign route.
export const updateOpportunityBodySchema = z
  .strictObject({
    name: opportunityNameSchema.optional(),
    value: moneySchema.optional(),
    ...opportunityFields,
  })
  .openapi("UpdateOpportunityBody");

export type UpdateOpportunityBody = z.infer<typeof updateOpportunityBodySchema>;

export const assignOpportunityBodySchema = z
  .strictObject({ ownerId: z.uuid() })
  .openapi("AssignOpportunityBody");

// An open stage. Won and Lost are reached by closing.
export const moveOpportunityBodySchema = z
  .strictObject({ stageId: z.uuid() })
  .openapi("MoveOpportunityBody");

export const closeOpportunityBodySchema = z
  .strictObject({
    outcome: z.enum(["WON", "LOST"]),
    // Needed for LOST, optional for WON.
    reason: optionalText(1000),
  })
  .refine((body) => body.outcome === "WON" || Boolean(body.reason), {
    path: ["reason"],
    message: "Say why the opportunity was lost",
  })
  .openapi("CloseOpportunityBody");

export type CloseOpportunityBody = z.infer<typeof closeOpportunityBodySchema>;

// The body may be left out: the opportunity then goes back to the first open stage.
export const reopenOpportunityBodySchema = z
  .strictObject({ stageId: z.uuid().optional() })
  .openapi("ReopenOpportunityBody");

export const opportunityListQuerySchema = listQuerySchema(
  ["name", "value", "expectedCloseDate", "createdAt", "stage", "followUpAt"],
  "createdAt",
).extend({
  stageId: z.uuid().optional(),
  status: stageKindSchema.optional(),
  ownerId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  contactId: z.uuid().optional(),
});

export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;

// The board takes the same search and owner filter as the list.
export const boardQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  ownerId: z.uuid().optional(),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

// The most cards one column of the board carries. `count` and `totalValue` still cover
// every opportunity in the stage; the list shows the rest.
export const BOARD_CARD_LIMIT = 50;

export const boardColumnSchema = z
  .object({
    stage: z.object({
      id: z.string(),
      name: z.string(),
      position: z.number().int(),
      kind: stageKindSchema,
    }),
    // Every opportunity in the stage that matches and that the caller may see.
    count: z.number().int(),
    totalValue: z.number(),
    // The ones changed most recently, at most 50.
    opportunities: z.array(opportunitySchema),
  })
  .openapi("PipelineBoardColumn");

export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const opportunityResponseSchema = envelope(opportunitySchema);
export const opportunityListResponseSchema = listEnvelope(opportunitySchema);
export const boardResponseSchema = envelope(z.array(boardColumnSchema));
