import { afterEach, describe, expect, it } from "vitest";

import { restoreEnv, setEnv } from "../../test/helpers";
import type { AppError } from "./app-error";
import { canEncryptSecrets, decryptSecret, encryptSecret } from "./secret-box";

// Two test-only secrets, built so that no secret scanner takes them for real ones.
const KEY = "k".repeat(40);
const OTHER_KEY = "o".repeat(40);

afterEach(() => {
  restoreEnv();
});

describe("secret box", () => {
  it("encrypts with the key from the environment and reads the value back", () => {
    const stored = encryptSecret("smtp-p@ssword ✓");

    expect(canEncryptSecrets()).toBe(true);
    expect(stored).toMatch(/^v1:[\w+/=]+:[\w+/=]+:[\w+/=]+$/);
    expect(stored).not.toContain("smtp-p@ssword");
    expect(decryptSecret(stored)).toBe("smtp-p@ssword ✓");
  });

  it("never writes the same text twice for one secret", () => {
    const first = encryptSecret("the same password", KEY);
    const second = encryptSecret("the same password", KEY);

    expect(first).not.toBe(second);
    expect(decryptSecret(first, KEY)).toBe("the same password");
    expect(decryptSecret(second, KEY)).toBe("the same password");
  });

  it("keeps an empty secret apart from no secret", () => {
    expect(decryptSecret(encryptSecret("", KEY), KEY)).toBe("");
  });

  it("answers null for another key instead of something that looks like a password", () => {
    expect(decryptSecret(encryptSecret("secret", KEY), OTHER_KEY)).toBeNull();
  });

  it("answers null for a value that was changed after it was written", () => {
    const [version, iv, tag, encrypted] = encryptSecret("secret", KEY).split(":");
    const flipped = Buffer.from(encrypted ?? "", "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;

    expect(decryptSecret([version, iv, tag, flipped.toString("base64")].join(":"), KEY)).toBeNull();
    expect(decryptSecret([version, iv, tag].join(":"), KEY)).toBeNull();
    expect(decryptSecret(["v2", iv, tag, encrypted].join(":"), KEY)).toBeNull();
    expect(decryptSecret("plain text that was never encrypted", KEY)).toBeNull();
  });

  it("refuses to encrypt without a key, with a coded error, rather than storing plain text", () => {
    setEnv({ SETTINGS_ENCRYPTION_KEY: undefined });

    expect(canEncryptSecrets()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(
      expect.objectContaining({ code: "ENCRYPTION_KEY_MISSING", status: 409 }) as AppError,
    );
  });

  it("cannot read a stored value while the key is missing", () => {
    const stored = encryptSecret("secret");
    setEnv({ SETTINGS_ENCRYPTION_KEY: undefined });

    expect(decryptSecret(stored)).toBeNull();
  });
});
