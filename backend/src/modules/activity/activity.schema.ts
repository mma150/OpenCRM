import { listMetaSchema, pageQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import { timelineEntrySchema, timelineKindFilterSchema } from "../../lib/timeline";

// A timeline entry plus the record it belongs to, so the feed can name and link it.
// `name` is a person's full name, or the name of a company or an opportunity.
export const activityEntrySchema = timelineEntrySchema
  .extend({
    record: z.object({
      type: z.enum(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"]),
      id: z.string(),
      name: z.string(),
    }),
  })
  .openapi("ActivityEntry");

export type ActivityEntry = z.infer<typeof activityEntrySchema>;

// A day ("2026-10-09") or an exact moment ("2026-10-09T08:30:00+05:30"). A day means the
// whole day in UTC; send a moment to follow the user's own time zone.
const dayOrMomentSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const activityQuerySchema = pageQuerySchema.extend({
  // Only what this person wrote.
  userId: z.uuid().optional(),
  // Both ends are inclusive and compare with `occurredAt`.
  from: dayOrMomentSchema.optional(),
  to: dayOrMomentSchema.optional(),
  kind: timelineKindFilterSchema.optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

// Counts over everything the filters match, not only the page that was asked for.
export const activitySummarySchema = z
  .object({
    conversations: z.number().int(),
    notes: z.number().int(),
    statusChanges: z.number().int(),
  })
  .openapi("ActivitySummary");

export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityMetaSchema = listMetaSchema
  .extend({ summary: activitySummarySchema })
  .openapi("ActivityMeta");

export type ActivityMeta = z.infer<typeof activityMetaSchema>;

export const activityAuthorSchema = z
  .object({ id: z.string(), name: z.string() })
  .openapi("ActivityAuthor");

export type ActivityAuthor = z.infer<typeof activityAuthorSchema>;

export const activityResponseSchema = z.object({
  data: z.array(activityEntrySchema),
  meta: activityMetaSchema,
});
export const activityAuthorsResponseSchema = envelope(z.array(activityAuthorSchema));
