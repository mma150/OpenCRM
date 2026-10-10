import { toast } from "sonner";

import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch } from "@/store/hooks";

import { logout } from "./auth.slice";

// Logs out. On success the store is reset and AuthGate sends the user to /login.
export function useLogout(): () => void {
  const dispatch = useAppDispatch();

  return () => {
    dispatch(logout())
      .unwrap()
      .catch((error: unknown) => {
        const apiError = error as ApiError;
        // UNAUTHENTICATED means the session was already gone, which is what was asked for.
        if (apiError.code !== "UNAUTHENTICATED") {
          toast.error(`Could not log out. ${describeApiError(apiError)}`);
        }
      });
  };
}
