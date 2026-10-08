import { http } from "@/lib/api/http";

import type { Health, HealthResponse } from "./health.types";

// Returns the unwrapped `data` of the { data, meta } envelope.
export async function getHealth(): Promise<Health> {
  const response = await http.get<HealthResponse>("/health");
  return response.data.data;
}
