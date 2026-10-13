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
    case "EMAIL_NOT_CONFIGURED":
      return "Outgoing email is not set up, so nothing was sent. An Admin can set it up under Settings, Email.";
    case "EMAIL_SEND_FAILED":
      // The API's sentence says what kind of problem it was (cannot connect, login refused)
      // and never repeats the mail server's own text, so it is shown as it is.
      return `The email was not sent. ${error.message}`;
    case "ENCRYPTION_KEY_MISSING":
      return "The password cannot be stored: the server has no SETTINGS_ENCRYPTION_KEY. Nothing was saved.";
    case "PRODUCT_IN_USE":
      return "This product is on a quote, so it cannot be deleted. Archive it instead.";
    case "QUOTE_NOT_EDITABLE":
      return "This quote is no longer a draft, so it cannot be changed or deleted. Reopen it first.";
    case "INVALID_STATUS_CHANGE":
      return "That is no longer possible: the status has changed in the meantime. The page now shows the current status.";
    case "INVOICE_EXISTS":
      return "This quote already has an invoice, so it cannot be reopened or invoiced again.";
    case "VALIDATION_FAILED":
      return "Some of the details are not valid. Check them and try again.";
    case "PAYLOAD_TOO_LARGE":
      return "The file is larger than 5 MB. Split it into smaller files and import each one.";
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
