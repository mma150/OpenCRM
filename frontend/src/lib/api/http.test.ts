import { afterEach, describe, expect, it, vi } from "vitest";

import { http, setUnauthenticatedHandler } from "./http";

// The request goes through the real axios instance and its interceptor; only the network
// is replaced, by handing axios's fetch adapter a fetch that answers from memory.
function requestAnsweredWith(status: number, body: unknown) {
  const fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "x-request-id": "req-1" },
      }),
    );
  return http.get("/anything", { adapter: "fetch", env: { fetch } });
}

const errorBody = (code: string) => ({ error: { code, message: "Server text", details: null } });

describe("http", () => {
  afterEach(() => {
    setUnauthenticatedHandler(null);
  });

  it("sends the session cookie to the API", () => {
    expect(http.defaults.withCredentials).toBe(true);
  });

  it("calls the handler when the API answers UNAUTHENTICATED", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);

    await expect(requestAnsweredWith(401, errorBody("UNAUTHENTICATED"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      requestId: "req-1",
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call the handler for a wrong password, which is also HTTP 401", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);

    await expect(requestAnsweredWith(401, errorBody("INVALID_CREDENTIALS"))).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call the handler for FORBIDDEN or a 401 without the error envelope", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);

    await expect(requestAnsweredWith(403, errorBody("FORBIDDEN"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(requestAnsweredWith(401, { nothing: true })).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("still rejects with the ApiError when no handler is registered", async () => {
    await expect(requestAnsweredWith(401, errorBody("UNAUTHENTICATED"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
