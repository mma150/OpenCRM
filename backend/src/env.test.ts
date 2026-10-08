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
      },
    });
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
