import { z } from "zod";

// Only NEXT_PUBLIC_ variables belong here: they are inlined into the browser bundle.
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

export interface EnvProblem {
  name: string;
  message: string;
}

export type ParseEnvResult = { ok: true; env: Env } | { ok: false; problems: EnvProblem[] };

// Pure, so the failure message can be unit tested without exiting the process.
export function parseEnv(source: Record<string, string | undefined>): ParseEnvResult {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return { ok: true, env: result.data };
  }
  const problems = result.error.issues.map((issue) => ({
    name: issue.path.join(".") || "(environment)",
    message: issue.message,
  }));
  return { ok: false, problems };
}

function loadEnv(): Env {
  // Each variable is read literally: Next only inlines `process.env.NAME` written out in full
  // into browser code, so never pass `process.env` as a whole.
  const result = parseEnv({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });
  if (result.ok) {
    return result.env;
  }

  const lines = result.problems.map((problem) => `  - ${problem.name}: ${problem.message}`);
  const report = ["Invalid environment configuration:", ...lines].join("\n");
  console.error(report);
  if (typeof window === "undefined") {
    process.exit(1);
  }
  throw new Error(report);
}

// Parsed once, when this module is first imported (next.config.ts imports it first).
export const env = loadEnv();
