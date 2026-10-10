import { listEnvelope, pageQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import {
  conversationTypeSchema,
  timelineEntrySchema,
  timelineKindFilterSchema,
} from "../../lib/timeline";

// A conversation may be logged late, but not ahead of time. The few minutes allow for a
// clock that runs a little fast on the user's device.
const FUTURE_ALLOWANCE_MS = 5 * 60 * 1000;

const entryTextSchema = z.string().trim().min(1).max(5000);

// The author and the time of writing come from the session and the server, never from here.
export const logConversationBodySchema = z
  .strictObject({
    type: conversationTypeSchema,
    // When the conversation took place.
    occurredAt: z.iso
      .datetime({ offset: true })
      // Text that is not a time at all is already reported by the line above, so it passes here.
      .refine((value) => {
        const time = new Date(value).getTime();
        return Number.isNaN(time) || time <= Date.now() + FUTURE_ALLOWANCE_MS;
      }, "A conversation cannot be in the future"),
    // What was discussed.
    summary: entryTextSchema,
  })
  .openapi("LogConversationBody");

export type LogConversationBody = z.infer<typeof logConversationBodySchema>;

export const addNoteBodySchema = z.strictObject({ body: entryTextSchema }).openapi("AddNoteBody");

export type AddNoteBody = z.infer<typeof addNoteBodySchema>;

export const timelineQuerySchema = pageQuerySchema.extend({
  kind: timelineKindFilterSchema.optional(),
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const timelineEntryResponseSchema = envelope(timelineEntrySchema);
export const timelineResponseSchema = listEnvelope(timelineEntrySchema);
