import { describe, expect, it } from "vitest";

import { insertAtCursor } from "./insert-at-cursor";

const TOKEN = "{{contact.firstName}}";

describe("insertAtCursor", () => {
  it.each([
    ["at the start", "Hello", 0, 0, `${TOKEN}Hello`, TOKEN.length],
    ["in the middle", "Hi , welcome", 3, 3, `Hi ${TOKEN}, welcome`, 3 + TOKEN.length],
    ["at the end", "Hi ", 3, 3, `Hi ${TOKEN}`, 3 + TOKEN.length],
    ["into empty text", "", 0, 0, TOKEN, TOKEN.length],
    ["over a selection", "Hi NAME, welcome", 3, 7, `Hi ${TOKEN}, welcome`, 3 + TOKEN.length],
    ["over everything", "old", 0, 3, TOKEN, TOKEN.length],
  ])("inserts %s and puts the caret behind it", (_case, text, start, end, expected, caret) => {
    expect(insertAtCursor(text, start, end, TOKEN)).toEqual({ text: expected, caret });
  });

  it("treats a selection given the wrong way round as the same selection", () => {
    expect(insertAtCursor("Hi NAME!", 7, 3, "x")).toEqual({ text: "Hi x!", caret: 4 });
  });

  it("brings a position outside the text back into it, so no text is lost", () => {
    expect(insertAtCursor("Hi", 99, 99, "!")).toEqual({ text: "Hi!", caret: 3 });
    expect(insertAtCursor("Hi", -5, -5, "!")).toEqual({ text: "!Hi", caret: 1 });
    expect(insertAtCursor("Hi", -5, 99, "!")).toEqual({ text: "!", caret: 1 });
  });

  it("keeps line breaks around the cursor", () => {
    expect(insertAtCursor("Hi\n\nBye", 3, 3, "x")).toEqual({ text: "Hi\nx\nBye", caret: 4 });
  });
});
