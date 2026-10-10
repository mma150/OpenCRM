import { describe, expect, it } from "vitest";

import { AppError } from "./app-error";
import {
  assertPasswordAllowed,
  hashPassword,
  isCommonPassword,
  verifyDummyPassword,
  verifyPassword,
} from "./password";
import { hashToken, newToken } from "./tokens";
import { passwordSchema } from "./user-fields";

describe("password length rule", () => {
  it("refuses 9 characters and accepts 10", () => {
    expect(passwordSchema.safeParse("a".repeat(9)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(10)).success).toBe(true);
  });

  it("accepts 128 characters and refuses 129", () => {
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("forces no character classes and leaves the password unchanged", () => {
    expect(passwordSchema.parse("  all lower case  ")).toBe("  all lower case  ");
  });
});

describe("common passwords", () => {
  it.each(["1234567890", "qwertyuiop", "1q2w3e4r5t"])("knows %s is common", (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it("ignores letter case", () => {
    expect(isCommonPassword("QwertyUiop")).toBe(true);
  });

  it("accepts a password that is not on the list", () => {
    expect(isCommonPassword("plum-harbour-41-kettle")).toBe(false);
  });

  it("reports a common password as VALIDATION_FAILED on the named field", () => {
    let caught: unknown;
    try {
      assertPasswordAllowed("qwertyuiop", "newPassword");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    const error = caught as AppError;
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.status).toBe(400);
    expect(error.details).toEqual([{ path: "newPassword", message: expect.any(String) as string }]);
  });

  it("lets an uncommon password through", () => {
    expect(() => {
      assertPasswordAllowed("plum-harbour-41-kettle");
    }).not.toThrow();
  });
});

describe("password hashing", () => {
  it("produces a salted Argon2id hash that verifies only the right password", async () => {
    const first = await hashPassword("plum-harbour-41-kettle");
    const second = await hashPassword("plum-harbour-41-kettle");

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(await verifyPassword(first, "plum-harbour-41-kettle")).toBe(true);
    expect(await verifyPassword(first, "plum-harbour-41-kettlf")).toBe(false);
  });

  it("treats a stored value that is not a hash as no match", async () => {
    expect(await verifyPassword("not-a-hash", "anything at all")).toBe(false);
  });

  it("does a dummy check without failing", async () => {
    await expect(verifyDummyPassword("anything at all")).resolves.toBeUndefined();
  });
});

describe("tokens", () => {
  it("makes a different 256-bit token every time and stores only its SHA-256 hash", () => {
    const first = newToken();
    const second = newToken();

    expect(first.token).not.toBe(second.token);
    expect(Buffer.from(first.token, "base64url")).toHaveLength(32);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHash).toBe(hashToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
  });
});
