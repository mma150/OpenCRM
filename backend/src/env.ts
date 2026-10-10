import { z } from "zod";

// An empty value in a .env file (SMTP_HOST=) means "not set".
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // Invite and password-reset links are built from this, never from the Host header.
  APP_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
  // Reverse proxies in front of the API; 0 means req.ip is the socket address.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SESSION_COOKIE_SECURE: optional(booleanText),
  // Outgoing mail is off while SMTP_HOST is not set.
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: optional(booleanText),
  SMTP_USER: optional(z.string()),
  SMTP_PASSWORD: optional(z.string()),
  MAIL_FROM: optional(z.string()),
});

const checkedEnvSchema = envSchema
  .superRefine((value, context) => {
    if (value.SMTP_HOST && !value.MAIL_FROM) {
      context.addIssue({
        code: "custom",
        path: ["MAIL_FROM"],
        message: "Required when SMTP_HOST is set",
      });
    }
  })
  .transform((value) => ({
    ...value,
    APP_URL: value.APP_URL.replace(/\/+$/, ""),
    SESSION_COOKIE_SECURE: value.SESSION_COOKIE_SECURE ?? value.NODE_ENV === "production",
    SMTP_SECURE: value.SMTP_SECURE ?? false,
  }));

export type Env = z.infer<typeof checkedEnvSchema>;

export interface EnvProblem {
  name: string;
  message: string;
}

export type ParseEnvResult = { ok: true; env: Env } | { ok: false; problems: EnvProblem[] };

// Pure, so the failure message can be unit tested without exiting the process.
export function parseEnv(source: NodeJS.ProcessEnv): ParseEnvResult {
  const result = checkedEnvSchema.safeParse(source);
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
