"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageError, PageLoading } from "@/components/shared/page-state";
import type { ApiError } from "@/lib/api/http";
import { ROLE_LABELS } from "@/lib/user-labels";
import { useAppDispatch } from "@/store/hooks";

import { getInviteInfo } from "./auth.api";
import { acceptInvite } from "./auth.slice";
import type { InviteInfo } from "./auth.types";
import { AuthCard, authLinkClass } from "./auth-card";
import { SetPasswordForm } from "./set-password-form";

type InviteState =
  | { step: "loading" }
  | { step: "ready"; info: InviteInfo }
  | { step: "invalid" }
  | { step: "failed"; error: ApiError };

// Opened from the invite link: /accept-invite?token=... The invited person sets their own
// password (D-09) and is signed in.
export function AcceptInviteForm() {
  const dispatch = useAppDispatch();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<InviteState>(
    token ? { step: "loading" } : { step: "invalid" },
  );
  const [attempt, setAttempt] = useState(0);

  // Who the invite is for, so the page can greet them before they choose a password.
  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    getInviteInfo(token)
      .then((info) => {
        if (active) {
          setState({ step: "ready", info });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          const apiError = error as ApiError;
          setState(
            apiError.code === "INVALID_TOKEN"
              ? { step: "invalid" }
              : { step: "failed", error: apiError },
          );
        }
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);

  if (state.step === "invalid" || !token) {
    return (
      <AuthCard
        title="This link is invalid or has expired"
        footer={
          <Link href="/login" className={authLinkClass}>
            Go to sign in
          </Link>
        }
      >
        <p role="alert" className="text-sm">
          Invite links work once and for 7 days. Ask your Admin to send you a new invite.
        </p>
      </AuthCard>
    );
  }

  if (state.step === "loading") {
    return <PageLoading label="Checking your invite..." />;
  }

  if (state.step === "failed") {
    return (
      <PageError
        error={state.error}
        onRetry={() => {
          setState({ step: "loading" });
          setAttempt((current) => current + 1);
        }}
      />
    );
  }

  const { info } = state;
  return (
    <AuthCard
      title={`Welcome, ${info.name}`}
      description={
        <>
          You have been invited to OpenCRM as{" "}
          <span className="text-foreground font-medium">{ROLE_LABELS[info.role]}</span>. Choose a
          password to finish setting up <span className="text-foreground">{info.email}</span>.
        </>
      }
    >
      <SetPasswordForm
        submitLabel="Set password and sign in"
        onSubmit={async (password) => {
          await dispatch(acceptInvite({ token, password })).unwrap();
        }}
        onInvalidToken={() => {
          setState({ step: "invalid" });
        }}
      />
    </AuthCard>
  );
}
