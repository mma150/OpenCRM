import { describe, expect, it } from "vitest";

import { toDateTimeInputValue } from "@/lib/format";

import {
  isOverdue,
  reminderMoment,
  reminderOf,
  taskRecordHref,
  taskRecordType,
} from "./task-labels";

const due = "2026-10-20T09:00";
const dueIso = new Date(due).toISOString();
const before = (ms: number) => new Date(new Date(due).getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("task labels", () => {
  it("turns each reminder choice into the moment the API stores", () => {
    expect(reminderMoment("NONE", due, "")).toBeNull();
    expect(reminderMoment("AT_DUE", due, "")).toBe(dueIso);
    expect(reminderMoment("HOUR_BEFORE", due, "")).toBe(before(HOUR));
    expect(reminderMoment("DAY_BEFORE", due, "")).toBe(before(24 * HOUR));
    expect(reminderMoment("CUSTOM", due, "2026-10-18T17:30")).toBe(
      new Date("2026-10-18T17:30").toISOString(),
    );
    // A choice that counts back from a due date that is not there is no reminder.
    expect(reminderMoment("HOUR_BEFORE", "", "")).toBeNull();
  });

  it("reads a stored reminder back as the choice that gives it, or as a custom moment", () => {
    expect(reminderOf({ dueAt: dueIso, reminderAt: null })).toEqual({
      reminder: "NONE",
      reminderAt: "",
    });
    expect(reminderOf({ dueAt: dueIso, reminderAt: dueIso }).reminder).toBe("AT_DUE");
    expect(reminderOf({ dueAt: dueIso, reminderAt: before(HOUR) }).reminder).toBe("HOUR_BEFORE");
    expect(reminderOf({ dueAt: dueIso, reminderAt: before(24 * HOUR) }).reminder).toBe(
      "DAY_BEFORE",
    );
    expect(reminderOf({ dueAt: dueIso, reminderAt: before(2 * HOUR) })).toEqual({
      reminder: "CUSTOM",
      reminderAt: toDateTimeInputValue(new Date(before(2 * HOUR))),
    });
    expect(reminderOf({ dueAt: null, reminderAt: dueIso }).reminder).toBe("CUSTOM");
  });

  it("calls a task overdue from the day after it was due, like the API", () => {
    const now = new Date(2026, 9, 20, 15, 0);
    expect(isOverdue({ dueAt: new Date(2026, 9, 20, 9, 0).toISOString() }, now)).toBe(false);
    expect(isOverdue({ dueAt: new Date(2026, 9, 19, 23, 59).toISOString() }, now)).toBe(true);
    expect(isOverdue({ dueAt: new Date(2026, 9, 21, 9, 0).toISOString() }, now)).toBe(false);
    expect(isOverdue({ dueAt: null }, now)).toBe(false);
  });

  it("links a task to the page of its record", () => {
    expect(taskRecordHref({ type: "OPPORTUNITY", id: "o1", name: "Deal" })).toBe(
      "/opportunities/o1",
    );
    expect(taskRecordHref({ type: "COMPANY", id: "c1", name: "Acme" })).toBe("/companies/c1");
    expect(taskRecordType("contact")).toBe("CONTACT");
  });
});
