import { describe, expect, it } from "vitest";

import { addRecipients, isEmailAddress, MAX_RECIPIENTS } from "./recipients";

describe("isEmailAddress", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com", "o'neil@example.ie"])("accepts %s", (v) => {
    expect(isEmailAddress(v)).toBe(true);
  });

  it.each(["", "plain", "a@b", "@b.co", "a@", "a b@c.de", "<a@b.co>", "a@b.co,"])(
    "refuses '%s'",
    (value) => {
      expect(isEmailAddress(value)).toBe(false);
    },
  );
});

describe("addRecipients", () => {
  it("adds one address, in lower case and trimmed", () => {
    expect(addRecipients([], "  Elena.Rostova@Northwind.Example ")).toEqual({
      value: ["elena.rostova@northwind.example"],
      rest: "",
      problem: null,
    });
  });

  it("adds several at once: commas, semicolons, spaces and line breaks all separate", () => {
    expect(addRecipients(["a@x.co"], "b@x.co, c@x.co;d@x.co\ne@x.co").value).toEqual([
      "a@x.co",
      "b@x.co",
      "c@x.co",
      "d@x.co",
      "e@x.co",
    ]);
  });

  it("drops an address that is already there, whatever its case, without a word", () => {
    expect(addRecipients(["a@x.co"], "A@X.co, b@x.co, B@x.co")).toEqual({
      value: ["a@x.co", "b@x.co"],
      rest: "",
      problem: null,
    });
  });

  it("keeps what is not an address for the user to correct, and adds the rest", () => {
    expect(addRecipients([], "a@x.co, elena@, b@x.co")).toEqual({
      value: ["a@x.co", "b@x.co"],
      rest: "elena@",
      problem: '"elena@" is not a valid email address. Correct it or clear it.',
    });
  });

  it("stops at the limit and keeps what did not fit", () => {
    const full = Array.from({ length: MAX_RECIPIENTS }, (_, index) => `p${String(index)}@x.co`);
    expect(addRecipients(full, "late@x.co")).toEqual({
      value: full,
      rest: "late@x.co",
      problem: "Use 10 addresses or fewer.",
    });
    expect(addRecipients(["a@x.co"], "b@x.co c@x.co", 2)).toEqual({
      value: ["a@x.co", "b@x.co"],
      rest: "c@x.co",
      problem: "Use 2 addresses or fewer.",
    });
  });

  it("does nothing for empty text", () => {
    expect(addRecipients(["a@x.co"], "  , ; ")).toEqual({
      value: ["a@x.co"],
      rest: "",
      problem: null,
    });
  });
});
