import axios, { AxiosError } from "axios";

import { env } from "@/env";

import type { components } from "./schema";

// Error codes the API sends, taken from the generated OpenAPI document.
export type ErrorCode = components["schemas"]["ErrorCode"];

// Codes the client itself produces when there is no usable server error body.
export type ClientErrorCode = "NETWORK_ERROR" | "TIMEOUT" | "UNKNOWN_ERROR";

// Every rejected request is an ApiError, so slices never inspect axios errors.
export type ApiError = {
  code: ErrorCode | ClientErrorCode;
  message: string;
  details: unknown;
  requestId?: string;
};

// The server error envelope is { error: { code, message, details } }.
type ErrorEnvelope = { error?: { code?: unknown; message?: unknown; details?: unknown } };

function toApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return { code: "UNKNOWN_ERROR", message: "Unexpected error", details: null };
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return { code: "TIMEOUT", message: "The request timed out", details: null };
  }

  if (!error.response) {
    return { code: "NETWORK_ERROR", message: "Could not reach the server", details: null };
  }

  const requestId: unknown = error.response.headers["x-request-id"];
  const body = error.response.data as ErrorEnvelope | undefined;
  const apiError: ApiError = {
    // The API contract says this is an ErrorCode. A code added by a newer server
    // still arrives as text and falls through to the default case in the UI.
    code: typeof body?.error?.code === "string" ? (body.error.code as ErrorCode) : "UNKNOWN_ERROR",
    message:
      typeof body?.error?.message === "string" ? body.error.message : "Unexpected server response",
    details: body?.error?.details ?? null,
  };
  if (typeof requestId === "string") {
    apiError.requestId = requestId;
  }
  return apiError;
}

// The only axios instance in the app. The base URL comes from the validated env object.
export const http = axios.create({
  baseURL: env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);
