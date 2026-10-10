import { describe, expect, it } from "vitest";

import { type EnvProblem, parseEnv } from "./env";

const validSource = {
  DATABASE_URL: "postgresql://user:secret@localhost:5432/opencrm",
};

function problemsFor(source: NodeJS.ProcessEnv): EnvProblem[] {
  const result = parseEnv(source);
  if (result.ok) {
    throw new Error("Expected parseEnv to report problems, but it accepted the source");
  }
  return result.problems;
}

describe("parseEnv", () => {
  it("returns the parsed environment with defaults applied", () => {
    const result = parseEnv({ ...validSource, PORT: "4100" });

    expect(result).toEqual({
      ok: true,
      env: {
        NODE_ENV: "development",
        PORT: 4100,
        DATABASE_URL: validSource.DATABASE_URL,
        CORS_ORIGINS: "http://localhost:3000",
        APP_URL: "http://localhost:3000",
        TRUST_PROXY: 0,
        SESSION_COOKIE_SECURE: false,
        SMTP_PORT: 587,
        SMTP_SECURE: false,
      },
    });
  });

  it("treats empty values as not set, as an untouched .env.example leaves them", () => {
    const result = parseEnv({
      ...validSource,
      SESSION_COOKIE_SECURE: "",
      SMTP_HOST: "",
      SMTP_SECURE: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "",
    });

    expect(result.ok && result.env.SMTP_HOST).toBeUndefined();
    expect(result.ok && result.env.SESSION_COOKIE_SECURE).toBe(false);
  });

  it("sends the session cookie over HTTPS only in production unless told otherwise", () => {
    const production = parseEnv({ ...validSource, NODE_ENV: "production" });
    const overridden = parseEnv({
      ...validSource,
      NODE_ENV: "production",
      SESSION_COOKIE_SECURE: "false",
    });

    expect(production.ok && production.env.SESSION_COOKIE_SECURE).toBe(true);
    expect(overridden.ok && overridden.env.SESSION_COOKIE_SECURE).toBe(false);
  });

  it("removes a trailing slash from APP_URL so links are built cleanly", () => {
    const result = parseEnv({ ...validSource, APP_URL: "https://crm.example.com/" });

    expect(result.ok && result.env.APP_URL).toBe("https://crm.example.com");
  });

  it("accepts SMTP settings together with MAIL_FROM", () => {
    const result = parseEnv({
      ...validSource,
      SMTP_HOST: "mailpit",
      SMTP_PORT: "1025",
      MAIL_FROM: "OpenCRM <no-reply@opencrm.local>",
    });

    expect(result.ok && result.env.SMTP_HOST).toBe("mailpit");
    expect(result.ok && result.env.SMTP_PORT).toBe(1025);
  });

  it("takes SETTINGS_ENCRYPTION_KEY when it is long enough, and does without it", () => {
    const key = "a-secret-of-at-least-32-characters!";
    const withKey = parseEnv({ ...validSource, SETTINGS_ENCRYPTION_KEY: key });
    const without = parseEnv({ ...validSource, SETTINGS_ENCRYPTION_KEY: "" });

    expect(withKey.ok && withKey.env.SETTINGS_ENCRYPTION_KEY).toBe(key);
    expect(without.ok && without.env.SETTINGS_ENCRYPTION_KEY).toBeUndefined();
  });

  it("names SETTINGS_ENCRYPTION_KEY when it is shorter than 32 characters", () => {
    const problems = problemsFor({ ...validSource, SETTINGS_ENCRYPTION_KEY: "too-short" });

    expect(problems).toEqual([
      { name: "SETTINGS_ENCRYPTION_KEY", message: "Use at least 32 characters" },
    ]);
  });

  it("names MAIL_FROM when SMTP_HOST is set without it", () => {
    const problems = problemsFor({ ...validSource, SMTP_HOST: "smtp.example.com" });

    expect(problems.map((problem) => problem.name)).toEqual(["MAIL_FROM"]);
  });

  it("uses the default port when PORT is not set", () => {
    const result = parseEnv(validSource);

    expect(result.ok && result.env.PORT).toBe(4000);
  });

  it("names DATABASE_URL when it is missing", () => {
    const problems = problemsFor({});

    expect(problems.map((problem) => problem.name)).toEqual(["DATABASE_URL"]);
  });

  it("names PORT when it is not a number", () => {
    const problems = problemsFor({ ...validSource, PORT: "not-a-number" });

    expect(problems.map((problem) => problem.name)).toEqual(["PORT"]);
  });

  it("names NODE_ENV when it is an unknown value", () => {
    const problems = problemsFor({ ...validSource, NODE_ENV: "staging" });

    expect(problems.map((problem) => problem.name)).toEqual(["NODE_ENV"]);
  });
});
