import axios, { AxiosError } from "axios";

// Every rejected request is an ApiError, so slices never inspect axios errors.
export type ApiError = {
  code: string;
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

  const requestId = error.response.headers["x-request-id"];
  const body = error.response.data as ErrorEnvelope | undefined;
  const apiError: ApiError = {
    code: typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
    message:
      typeof body?.error?.message === "string" ? body.error.message : "Unexpected server response",
    details: body?.error?.details ?? null,
  };
  if (typeof requestId === "string") {
    apiError.requestId = requestId;
  }
  return apiError;
}

// The only axios instance in the app. process.env.NEXT_PUBLIC_API_URL must be
// written literally: Next only inlines literal reads into browser code.
export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);
