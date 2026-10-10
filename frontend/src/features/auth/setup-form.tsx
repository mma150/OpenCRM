"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { PageLoading } from "@/components/shared/page-state";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { emailSchema, nameSchema, newPasswordSchema, PASSWORD_HINT } from "@/lib/validation";
import { useAppDispatch } from "@/store/hooks";

import { setupAdmin } from "./auth.slice";
import { AuthCard } from "./auth-card";
import { useSetupRequired } from "./use-setup-status";

const schema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

type Values = z.infer<typeof schema>;

// First run only (D-07): creates the first Admin, who is signed in straight away.
export function SetupForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const setupRequired = useSetupRequired();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  // Once the first Admin exists this page is closed for good.
  useEffect(() => {
    if (setupRequired === false) {
      router.replace("/login");
    }
  }, [setupRequired, router]);

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await dispatch(setupAdmin(values)).unwrap();
    } catch (error) {
      setFormError(
        applyServerError(error as ApiError, form.setError, ["name", "email", "password"]),
      );
    }
  }

  if (!setupRequired) {
    return <PageLoading />;
  }

  return (
    <AuthCard
      title="Create the Admin account"
      description="This is the first account in this OpenCRM installation. It can invite everyone else."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <FormAlert message={formError} />
        <FormField control={form.control} name="name" label="Full name">
          {(field) => <Input {...field} autoComplete="name" className="h-10" />}
        </FormField>
        <FormField control={form.control} name="email" label="Email">
          {(field) => <Input {...field} type="email" autoComplete="username" className="h-10" />}
        </FormField>
        <FormField
          control={form.control}
          name="password"
          label="Password"
          description={PASSWORD_HINT}
        >
          {(field) => <PasswordInput {...field} autoComplete="new-password" className="h-10" />}
        </FormField>
        <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating account..." : "Create Admin account"}
        </Button>
      </form>
    </AuthCard>
  );
}
