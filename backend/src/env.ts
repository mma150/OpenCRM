import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export interface EnvProblem {
  name: string;
  message: string;
}

export type ParseEnvResult = { ok: true; env: Env } | { ok: false; problems: EnvProblem[] };

// Pure, so the failure message can be unit tested without exiting the process.
export function parseEnv(source: NodeJS.ProcessEnv): ParseEnvResult {
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
  const result = parseEnv(process.env);
  if (!result.ok) {
    console.error("Invalid environment configuration:");
    for (const problem of result.problems) {
      console.error(`  - ${problem.name}: ${problem.message}`);
    }
    process.exit(1);
  }
  return result.env;
}

// Parsed once, when this module is first imported (server.ts imports it first).
export const env = loadEnv();
