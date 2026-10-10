import { describe, expect, it } from "vitest";

import { describeApiError } from "./error-messages";
import type { ApiError } from "./http";

const error = (code: ApiError["code"], details: unknown = null): ApiError => ({
  code,
  message: "Server text",
  details,
});

describe("describeApiError", () => {
  it("uses one message for a wrong email and a wrong password (D-08)", () => {
    expect(describeApiError(error("INVALID_CREDENTIALS"))).toBe("Email or password is incorrect.");
  });

  it("says when a locked account can be tried again, in minutes", () => {
    expect(describeApiError(error("ACCOUNT_LOCKED", { retryAfterSeconds: 840 }))).toBe(
      "This account is locked after too many wrong passwords. Try again in 14 minutes.",
    );
  });

  it("rounds a rate limit up to whole minutes and handles one minute", () => {
    expect(describeApiError(error("RATE_LIMITED", { retryAfterSeconds: 61 }))).toBe(
      "Too many attempts. Try again in 2 minutes.",
    );
    expect(describeApiError(error("RATE_LIMITED", { retryAfterSeconds: 30 }))).toBe(
      "Too many attempts. Try again in 1 minute.",
    );
  });

  it("falls back to a general wait when the server sends no retry time", () => {
    expect(describeApiError(error("RATE_LIMITED"))).toBe(
      "Too many attempts. Try again in a few minutes.",
    );
  });

  it.each([
    ["ACCOUNT_DEACTIVATED", "This account has been deactivated. Ask an Admin to reactivate it."],
    ["INVALID_TOKEN", "This link is invalid or has expired."],
    ["EMAIL_IN_USE", "Another user already has this email address."],
    ["LAST_ADMIN", "This is the last active Admin. Make someone else an Admin first."],
    ["FORBIDDEN", "You do not have permission to do that."],
    ["NETWORK_ERROR", "The server cannot be reached. Check your connection and try again."],
  ] as const)("describes %s in words, not with the server text", (code, message) => {
    expect(describeApiError(error(code))).toBe(message);
  });

  it("shows the code and the server message for any other code", () => {
    expect(describeApiError(error("INTERNAL_ERROR"))).toBe("INTERNAL_ERROR: Server text");
  });
});
