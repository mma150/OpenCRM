"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { newPasswordSchema, PASSWORD_HINT } from "@/lib/validation";

const schema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

type Values = z.infer<typeof schema>;

// "New password" + "Confirm": the form behind both emailed links (password reset and invite).
// `onSubmit` rejects with an ApiError; INVALID_TOKEN is handed to `onInvalidToken` because
// the whole page, not a field, is then out of date.
export function SetPasswordForm({
  submitLabel,
  onSubmit,
  onInvalidToken,
}: {
  submitLabel: string;
  onSubmit: (password: string) => Promise<void>;
  onInvalidToken: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function submit(values: Values) {
    setFormError(null);
    try {
      await onSubmit(values.password);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === "INVALID_TOKEN") {
        onInvalidToken();
        return;
      }
      setFormError(applyServerError(apiError, form.setError, ["password"]));
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void form.handleSubmit(submit)(event)}
    >
      <FormAlert message={formError} />
      <FormField
        control={form.control}
        name="password"
        label="New password"
        description={PASSWORD_HINT}
      >
        {(field) => <PasswordInput {...field} autoComplete="new-password" className="h-10" />}
      </FormField>
      <FormField control={form.control} name="confirmPassword" label="Confirm new password">
        {(field) => <PasswordInput {...field} autoComplete="new-password" className="h-10" />}
      </FormField>
      <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
