import { http } from "@/lib/api/http";

export type Health = {
  status: "ok";
  database: { connected: boolean; serverTime: string };
};

// Returns the unwrapped `data` of the { data, meta } envelope.
export async function getHealth(): Promise<Health> {
  const response = await http.get<{ data: Health }>("/health");
  return response.data.data;
}
