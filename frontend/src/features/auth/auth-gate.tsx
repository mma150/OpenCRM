"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { PageError, PageLoading } from "@/components/shared/page-state";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchMe, selectAuth } from "./auth.slice";

// Wraps every signed-in page. It loads the current user once, shows the page only when
// there is one, and sends everyone else to /login (remembering where they were going).
export function AuthGate({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, status, error } = useAppSelector(selectAuth);
  const signedOut = status === "failed" && error?.code === "UNAUTHENTICATED";

  useEffect(() => {
    if (status === "idle") {
      void dispatch(fetchMe());
    }
  }, [dispatch, status]);

  useEffect(() => {
    if (signedOut) {
      router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [signedOut, router, pathname]);

  if (me) {
    return children;
  }

  // A network or server failure is not "signed out": stay here and offer Retry.
  if (status === "failed" && error && !signedOut) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-4">
        <PageError error={error} onRetry={() => void dispatch(fetchMe())} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <PageLoading />
    </div>
  );
}
