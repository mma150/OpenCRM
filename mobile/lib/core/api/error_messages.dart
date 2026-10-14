import 'package:opencrm/core/api/api_error.dart';

/// "Try again in N minutes" for the lock and rate-limit errors.
String _retryHint(ApiError error) {
  final seconds = error.retryAfterSeconds;
  if (seconds == null || seconds <= 0) {
    return 'Try again in a few minutes.';
  }
  final minutes = (seconds / 60).ceil();
  return minutes == 1
      ? 'Try again in 1 minute.'
      : 'Try again in $minutes minutes.';
}

/// The one place that turns an error code into words for the user, with the same wording
/// as the web app (`frontend/src/lib/api/error-messages.ts`). The message is chosen by the
/// code, never by reading the server's text. A code this app does not know yet shows the
/// code and the server's sentence, so a new one is never silent.
String describeApiError(ApiError error) {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Email or password is incorrect.';
    case 'ACCOUNT_LOCKED':
      return 'This account is locked after too many wrong passwords. ${_retryHint(error)}';
    case 'ACCOUNT_DEACTIVATED':
      return 'This account has been deactivated. Ask an Admin to reactivate it.';
    case 'RATE_LIMITED':
      return 'Too many attempts. ${_retryHint(error)}';
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Sign in again.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that.';
    case 'LEAD_CONVERTED':
      return 'This lead has been converted and can no longer be changed.';
    case 'VALIDATION_FAILED':
      return 'Some of the details are not valid. Check them and try again.';
    case 'NOT_FOUND':
      return 'This no longer exists. Go back and refresh the list.';
    case 'SERVICE_UNAVAILABLE':
      return 'The service is temporarily unavailable. Try again in a moment.';
    case 'INTERNAL_ERROR':
      return 'The server ran into a problem. Try again in a moment.';
    case ApiError.network:
      return 'The server cannot be reached. Check your connection and try again.';
    case ApiError.timeout:
      return 'The server took too long to answer. Try again.';
    case ApiError.invalidResponse:
      return 'The server sent an answer the app could not read. Check the server address.';
    case ApiError.unexpected:
      return 'Something went wrong. Try again.';
    default:
      return '${error.code}: ${error.message}';
  }
}
