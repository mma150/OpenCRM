import { afterEach, describe, expect, it } from "vitest";

import { downloadExport } from "./download";
import { http } from "./http";

const CSV = "﻿Name\r\nAda\r\n";

// The request goes through the real axios instance and its interceptor; only the network
// is replaced, by handing axios's fetch adapter a fetch that answers from memory and
// remembers what it was asked.
function answerWith(status: number, body: string, headers: Record<string, string>) {
  const asked: string[] = [];
  http.defaults.adapter = "fetch";
  http.defaults.env = {
    fetch: (input: RequestInfo | URL) => {
      asked.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response(body, { status, headers }));
    },
  };
  return asked;
}

describe("downloadExport", () => {
  const { adapter, env } = http.defaults;

  afterEach(() => {
    http.defaults.adapter = adapter;
    http.defaults.env = env;
  });

  it("asks for the list's query without the page, with the viewer's time zone", async () => {
    const asked = answerWith(200, CSV, { "content-type": "text/csv; charset=utf-8" });

    await downloadExport(
      "/leads/export",
      { search: "acme", status: "NEW", "cf.abc.min": "10", sort: "name", page: 3, pageSize: 25 },
      "leads.csv",
    );

    const url = new URL(asked[0] ?? "");
    expect(url.pathname.endsWith("/leads/export")).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "acme",
      status: "NEW",
      "cf.abc.min": "10",
      sort: "name",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it("answers with the file, the name the API gave it and whether it was cut off", async () => {
    answerWith(200, CSV, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="leads-2026-11-15.csv"',
      "x-export-truncated": "true",
    });

    const file = await downloadExport("/leads/export", {}, "leads.csv");

    expect(file.filename).toBe("leads-2026-11-15.csv");
    expect(file.truncated).toBe(true);
    // The bytes are kept as they came, the byte order mark included.
    expect(file.blob.size).toBe(new TextEncoder().encode(CSV).length);
  });

  it("falls back to its own file name, and is not cut off, without the headers", async () => {
    answerWith(200, CSV, { "content-type": "text/csv" });

    const file = await downloadExport("/tasks/export", {}, "tasks.csv");

    expect(file).toMatchObject({ filename: "tasks.csv", truncated: false });
  });

  it("rejects with the API's error, read out of the file-shaped answer", async () => {
    answerWith(
      400,
      JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid",
          details: [{ path: "cf.abc.min", message: "Must be a number" }],
        },
      }),
      { "content-type": "application/json", "x-request-id": "req-9" },
    );

    await expect(downloadExport("/leads/export", {}, "leads.csv")).rejects.toEqual({
      code: "VALIDATION_FAILED",
      message: "Invalid",
      details: [{ path: "cf.abc.min", message: "Must be a number" }],
      requestId: "req-9",
    });
  });

  it("rejects with UNKNOWN_ERROR when the refusal is not the error envelope", async () => {
    answerWith(502, "<html>Bad gateway</html>", { "content-type": "text/html" });

    await expect(downloadExport("/leads/export", {}, "leads.csv")).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    });
  });
});
