"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { Wordmark } from "@/components/app-shell/wordmark";
import { PageLoading } from "@/components/shared/page-state";
import { safeNextPath } from "@/lib/safe-next";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchMe, selectAuth } from "./auth.slice";

// Wraps the signed-out pages (login, setup, password reset, invite) in the centred frame.
// A signed-in user does not belong here: they are sent to `?next=` if it is a safe path
// inside the app, otherwise to Home. Signing in on one of these pages lands here too,
// so this is the single place that decides where a user goes after sign-in.
export function GuestGate({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me, status } = useAppSelector(selectAuth);
  const next = searchParams.get("next");

  useEffect(() => {
    if (status === "idle") {
      void dispatch(fetchMe());
    }
  }, [dispatch, status]);

  useEffect(() => {
    if (me) {
      router.replace(safeNextPath(next));
    }
  }, [me, router, next]);

  const checking = status === "idle" || status === "loading" || me !== null;

  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 p-4 wrap-anywhere">
      <Wordmark />
      {checking ? <PageLoading /> : <main className="w-full max-w-sm">{children}</main>}
    </div>
  );
}
