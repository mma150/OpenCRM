"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { resetPassword } from "./auth.api";
import { AuthCard, authLinkClass } from "./auth-card";
import { SetPasswordForm } from "./set-password-form";

// Opened from the emailed reset link: /reset-password?token=...
export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");

  if (state === "invalid" || !token) {
    return (
      <AuthCard
        title="This link is invalid or has expired"
        footer={
          <Link href="/login" className={authLinkClass}>
            Back to sign in
          </Link>
        }
      >
        <p role="alert" className="text-sm">
          Reset links work once and for 1 hour.{" "}
          <Link href="/forgot-password" className={authLinkClass}>
            Request a new link
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  // A reset signs the user out everywhere (D-06), so they sign in again with the new password.
  if (state === "done") {
    return (
      <AuthCard title="Password changed">
        <p role="status" className="text-sm">
          Your password has been changed.{" "}
          <Link href="/login" className={authLinkClass}>
            Sign in
          </Link>{" "}
          with the new one.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" description="Choose a new password for your account.">
      <SetPasswordForm
        submitLabel="Set new password"
        onSubmit={async (password) => {
          await resetPassword({ token, password });
          setState("done");
        }}
        onInvalidToken={() => {
          setState("invalid");
        }}
      />
    </AuthCard>
  );
}
