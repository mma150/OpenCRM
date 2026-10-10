"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { RoleBadge } from "@/components/shared/badges";
import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { nameSchema, newPasswordSchema, PASSWORD_HINT } from "@/lib/validation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { changePassword, selectAuth, updateProfile } from "./auth.slice";
import type { Me } from "./auth.types";

const detailsSchema = z.object({ name: nameSchema });

type DetailsValues = z.infer<typeof detailsSchema>;

// Name is the only thing a user changes about themselves (D-20).
function DetailsForm({ me }: { me: Me }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: me.name },
  });

  async function onSubmit(values: DetailsValues) {
    setFormError(null);
    try {
      const updated = await dispatch(updateProfile(values)).unwrap();
      form.reset({ name: updated.name });
      toast.success("Your details were saved.");
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, ["name"]));
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <FormAlert message={formError} />
      <FormField control={form.control} name="name" label="Name">
        {(field) => <Input {...field} autoComplete="name" className="h-10" />}
      </FormField>
      <Field>
        <FieldLabel htmlFor="profile-email">Email</FieldLabel>
        <Input
          id="profile-email"
          type="email"
          readOnly
          disabled
          value={me.email}
          aria-describedby="profile-email-help"
          className="h-10"
        />
        <FieldDescription id="profile-email-help">
          Only an Admin can change your email.
        </FieldDescription>
      </Field>
      <Field>
        <FieldTitle>Role</FieldTitle>
        <div>
          <RoleBadge role={me.role} />
        </div>
      </Field>
      <Button type="submit" className="h-10 self-start px-4" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

type PasswordValues = z.infer<typeof passwordSchema>;

function ChangePasswordForm() {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  // A wrong current password comes back as a field error on `currentPassword`, not a sign-out.
  async function onSubmit(values: PasswordValues) {
    setFormError(null);
    try {
      await dispatch(
        changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      ).unwrap();
      form.reset();
      toast.success("Your password was changed.");
    } catch (error) {
      setFormError(
        applyServerError(error as ApiError, form.setError, ["currentPassword", "newPassword"]),
      );
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <FormAlert message={formError} />
      <FormField control={form.control} name="currentPassword" label="Current password">
        {(field) => <PasswordInput {...field} autoComplete="current-password" className="h-10" />}
      </FormField>
      <FormField
        control={form.control}
        name="newPassword"
        label="New password"
        description={PASSWORD_HINT}
      >
        {(field) => <PasswordInput {...field} autoComplete="new-password" className="h-10" />}
      </FormField>
      <FormField control={form.control} name="confirmPassword" label="Confirm new password">
        {(field) => <PasswordInput {...field} autoComplete="new-password" className="h-10" />}
      </FormField>
      <p className="text-muted-foreground text-sm">
        Changing your password signs you out on your other devices.
      </p>
      <Button type="submit" className="h-10 self-start px-4" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Changing..." : "Change password"}
      </Button>
    </form>
  );
}

export function ProfilePage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Profile" description="Update your name and password." />
      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailsForm me={me} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
