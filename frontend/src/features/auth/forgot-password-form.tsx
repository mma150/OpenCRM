"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { emailSchema } from "@/lib/validation";

import { forgotPassword } from "./auth.api";
import { AuthCard, authLinkClass } from "./auth-card";

const schema = z.object({ email: emailSchema });

type Values = z.infer<typeof schema>;

const backToSignIn = (
  <Link href="/login" className={authLinkClass}>
    Back to sign in
  </Link>
);

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  // Nothing here enters the store, so the form calls the API function directly.
  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["email"]));
    }
  }

  // The same answer whether or not the email has an account (D-08).
  if (sent) {
    return (
      <AuthCard title="Check your email" footer={backToSignIn}>
        <p role="status" className="text-sm">
          If that email exists, we sent a link. It is valid for 1 hour.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we will send you a link to set a new password."
      footer={backToSignIn}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <FormAlert message={formError} />
        <FormField control={form.control} name="email" label="Email">
          {(field) => <Input {...field} type="email" autoComplete="username" className="h-10" />}
        </FormField>
        <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
