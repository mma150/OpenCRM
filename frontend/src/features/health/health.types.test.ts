import { describe, expectTypeOf, it } from "vitest";

import type { ApiError } from "@/lib/api/http";
import type { components } from "@/lib/api/schema";

import { getHealth } from "./health.api";
import type { Health } from "./health.types";

// These checks are made by tsc (pnpm typecheck); at run time they do nothing.
describe("health types", () => {
  it("getHealth returns the Health type generated from the OpenAPI document", () => {
    expectTypeOf(getHealth).returns.resolves.toEqualTypeOf<components["schemas"]["Health"]>();
    expectTypeOf<Health>().toEqualTypeOf<components["schemas"]["Health"]>();
  });

  it("ApiError code is the generated ErrorCode plus the client codes", () => {
    expectTypeOf<ApiError["code"]>().toEqualTypeOf<
      components["schemas"]["ErrorCode"] | "NETWORK_ERROR" | "TIMEOUT" | "UNKNOWN_ERROR"
    >();
  });
});
