import { describe, expect, it } from "vitest";

import { dayIn, daysBetween, firstOfMonth, startOfDay, timeZoneSchema, todayIn } from "./time-zone";

describe("timeZoneSchema", () => {
  it.each(["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "Pacific/Kiritimati"])(
    "accepts %s",
    (name) => {
      expect(timeZoneSchema.parse(name)).toBe(name);
    },
  );

  it("is UTC when nothing is sent", () => {
    expect(timeZoneSchema.parse(undefined)).toBe("UTC");
  });

  it.each(["", "Mars/Olympus", "India", "x".repeat(65)])("refuses %j", (name) => {
    expect(timeZoneSchema.safeParse(name).success).toBe(false);
  });
});

describe("dayIn", () => {
  it("names the calendar day it is in the time zone", () => {
    const moment = new Date("2026-10-10T20:30:00Z");

    expect(dayIn("UTC", moment)).toBe("2026-10-10");
    // 02:00 the next morning in India, 10:30 the next morning on Kiritimati.
    expect(dayIn("Asia/Kolkata", moment)).toBe("2026-10-11");
    expect(dayIn("Pacific/Kiritimati", moment)).toBe("2026-10-11");
    // Half past four in the afternoon in New York.
    expect(dayIn("America/New_York", moment)).toBe("2026-10-10");
  });

  it("follows the zone across the end of a year", () => {
    expect(dayIn("Asia/Kolkata", new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
    expect(dayIn("America/New_York", new Date("2027-01-01T03:00:00Z"))).toBe("2026-12-31");
  });
});

describe("startOfDay", () => {
  it("is midnight UTC for UTC", () => {
    expect(startOfDay("UTC", "2026-10-10")).toEqual(new Date("2026-10-10T00:00:00Z"));
  });

  it("is midnight on the zone's own clock", () => {
    expect(startOfDay("Asia/Kolkata", "2026-10-10")).toEqual(new Date("2026-10-09T18:30:00Z"));
    expect(startOfDay("America/New_York", "2026-10-10")).toEqual(new Date("2026-10-10T04:00:00Z"));
    expect(startOfDay("Pacific/Kiritimati", "2026-10-10")).toEqual(
      new Date("2026-10-09T10:00:00Z"),
    );
  });

  it("moves to a later or an earlier day, across the end of a month", () => {
    expect(startOfDay("UTC", "2026-10-31", 1)).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(startOfDay("UTC", "2026-03-01", -1)).toEqual(new Date("2026-02-28T00:00:00Z"));
    expect(startOfDay("Asia/Kolkata", "2026-12-31", 1)).toEqual(new Date("2026-12-31T18:30:00Z"));
  });

  it("follows the clocks changing: a day is 23 or 25 hours long", () => {
    // London goes forward on 29 March 2026 and back on 25 October 2026.
    const spring = startOfDay("Europe/London", "2026-03-29");
    const dayAfterSpring = startOfDay("Europe/London", "2026-03-29", 1);
    const autumn = startOfDay("Europe/London", "2026-10-25");
    const dayAfterAutumn = startOfDay("Europe/London", "2026-10-25", 1);

    expect(spring).toEqual(new Date("2026-03-29T00:00:00Z"));
    expect(dayAfterSpring).toEqual(new Date("2026-03-29T23:00:00Z"));
    expect(autumn).toEqual(new Date("2026-10-24T23:00:00Z"));
    expect(dayAfterAutumn).toEqual(new Date("2026-10-26T00:00:00Z"));
  });
});

describe("todayIn", () => {
  it("gives the viewer's day with its first moment and the first moment of the next", () => {
    // 20:30 UTC on the 10th is 02:00 on the 11th in India.
    const today = todayIn("Asia/Kolkata", new Date("2026-10-10T20:30:00Z"));

    expect(today).toEqual({
      day: "2026-10-11",
      start: new Date("2026-10-10T18:30:00Z"),
      end: new Date("2026-10-11T18:30:00Z"),
    });
  });

  it("puts the same moment on different days in different zones", () => {
    const moment = new Date("2026-10-10T20:30:00Z");

    expect(todayIn("UTC", moment).day).toBe("2026-10-10");
    expect(todayIn("America/Los_Angeles", moment).day).toBe("2026-10-10");
    expect(todayIn("Asia/Tokyo", moment).day).toBe("2026-10-11");
  });
});

describe("firstOfMonth and daysBetween", () => {
  it("names the first day of the day's month", () => {
    expect(firstOfMonth("2026-10-10")).toBe("2026-10-01");
    expect(firstOfMonth("2026-02-28")).toBe("2026-02-01");
  });

  it("counts whole days from one day to another", () => {
    expect(daysBetween("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2026-10-10", "2026-10-09")).toBe(-1);
  });
});
