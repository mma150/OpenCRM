"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { emailSchema } from "@/lib/validation";
import { useAppDispatch } from "@/store/hooks";

import { login } from "./auth.slice";
import { AuthCard, authLinkClass } from "./auth-card";
import { useSetupRequired } from "./use-setup-status";

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const setupRequired = useSetupRequired();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Nobody can sign in before the first Admin exists.
  useEffect(() => {
    if (setupRequired) {
      router.replace("/setup");
    }
  }, [setupRequired, router]);

  // On success the store holds the user and GuestGate moves on; there is nothing to do here.
  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await dispatch(login(values)).unwrap();
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["email", "password"]));
    }
  }

  return (
    <AuthCard title="Sign in" description="Use your work email and password.">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <FormAlert message={formError} />
        <FormField control={form.control} name="email" label="Email">
          {(field) => <Input {...field} type="email" autoComplete="username" className="h-10" />}
        </FormField>
        <FormField
          control={form.control}
          name="password"
          label="Password"
          labelAction={
            <Link href="/forgot-password" className={`${authLinkClass} text-sm`}>
              Forgot password?
            </Link>
          }
        >
          {(field) => <PasswordInput {...field} autoComplete="current-password" className="h-10" />}
        </FormField>
        <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
