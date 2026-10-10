import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps a path inside the app, with its query string", () => {
    expect(safeNextPath("/profile")).toBe("/profile");
    expect(safeNextPath("/settings/users?tab=1")).toBe("/settings/users?tab=1");
  });

  it("goes Home when there is no next", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it.each([
    "//evil.example",
    "//evil.example/path",
    "https://evil.example",
    "javascript:alert(1)",
    "/\\evil.example",
    "/\t/evil.example",
    "evil.example",
  ])("rejects %s, which would leave the app", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});
