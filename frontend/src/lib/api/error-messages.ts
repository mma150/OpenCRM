import type { ApiError } from "./http";

// "try again in N minutes" for the lock and rate-limit errors, from details.retryAfterSeconds.
function retryHint(details: unknown): string {
  const seconds =
    typeof details === "object" && details !== null && "retryAfterSeconds" in details
      ? details.retryAfterSeconds
      : null;
  if (typeof seconds !== "number" || seconds <= 0) {
    return "Try again in a few minutes.";
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "Try again in 1 minute." : `Try again in ${String(minutes)} minutes.`;
}

// The one place that turns an error code into words for the user. The message is chosen by the
// code, never by parsing the server's text (D-12); an unknown code shows the code and server text.
export function describeApiError(error: ApiError): string {
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return "Email or password is incorrect.";
    case "ACCOUNT_LOCKED":
      return `This account is locked after too many wrong passwords. ${retryHint(error.details)}`;
    case "ACCOUNT_DEACTIVATED":
      return "This account has been deactivated. Ask an Admin to reactivate it.";
    case "RATE_LIMITED":
      return `Too many attempts. ${retryHint(error.details)}`;
    case "INVALID_TOKEN":
      return "This link is invalid or has expired.";
    case "SETUP_CLOSED":
      return "The Admin account has already been created. Sign in instead.";
    case "UNAUTHENTICATED":
      return "Your session has ended. Sign in again.";
    case "FORBIDDEN":
      return "You do not have permission to do that.";
    case "EMAIL_IN_USE":
      return "Another user already has this email address.";
    case "LAST_ADMIN":
      return "This is the last active Admin. Make someone else an Admin first.";
    case "LEAD_CONVERTED":
      return "This lead has been converted and can no longer be changed.";
    case "VALIDATION_FAILED":
      return "Some of the details are not valid. Check them and try again.";
    case "NOT_FOUND":
      return "This no longer exists. Reload the page and try again.";
    case "SERVICE_UNAVAILABLE":
      return "The service is temporarily unavailable. Try again in a moment.";
    case "NETWORK_ERROR":
      return "The server cannot be reached. Check your connection and try again.";
    case "TIMEOUT":
      return "The server took too long to answer. Try again.";
    default:
      return `${error.code}: ${error.message}`;
  }
}
