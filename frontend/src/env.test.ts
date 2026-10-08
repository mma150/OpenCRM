import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a valid API URL", () => {
    const result = parseEnv({ NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1" });

    expect(result).toEqual({
      ok: true,
      env: { NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1" },
    });
  });

  it("names the variable when it is missing", () => {
    const result = parseEnv({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((problem) => problem.name)).toEqual(["NEXT_PUBLIC_API_URL"]);
    }
  });

  it("names the variable when it is not a URL", () => {
    const result = parseEnv({ NEXT_PUBLIC_API_URL: "not-a-url" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0]?.name).toBe("NEXT_PUBLIC_API_URL");
    }
  });
});
