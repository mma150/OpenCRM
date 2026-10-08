import { envelope, z } from "../../lib/openapi";

export const healthSchema = z
  .object({
    status: z.literal("ok"),
    database: z.object({ connected: z.boolean(), serverTime: z.string() }),
  })
  .openapi("Health");

export type Health = z.infer<typeof healthSchema>;

export const healthResponseSchema = envelope(healthSchema);
