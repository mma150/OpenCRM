"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { PasswordInput } from "@/components/shared/password-input";
import { SelectControl } from "@/components/shared/select-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import { saveEmailSettings } from "./email-settings.slice";
import type { EmailSettings, UpdateEmailSettingsInput } from "./email-settings.types";

// The select maps onto the API's `secure`: false for STARTTLS or plain, true for implicit TLS.
const ENCRYPTION_OPTIONS = [
  { value: "false", label: "STARTTLS or none (usually port 587 or 25)" },
  { value: "true", label: "TLS (usually port 465)" },
];

const PORT_MESSAGE = "Enter a port from 1 to 65535.";

// The API's rules, so the user hears about them before the request is sent.
const emailSettingsSchema = z
  .object({
    host: z
      .string()
      .trim()
      .min(1, "Enter the mail server's host name.")
      .max(253, "Use 253 characters or fewer.")
      .regex(
        /^[A-Za-z0-9.:[\]-]+$/,
        "Enter a host name such as smtp.example.com, without http:// or a port.",
      ),
    // A number is text in the form and a JSON number in the request.
    port: z
      .string()
      .trim()
      .regex(/^\d{1,5}$/, PORT_MESSAGE)
      .refine((value) => Number(value) >= 1 && Number(value) <= 65_535, PORT_MESSAGE),
    secure: z.enum(["false", "true"]),
    username: z.string().trim().max(200, "Use 200 characters or fewer."),
    // Write-only: never filled in from the API.
    password: z.string().max(500, "Use 500 characters or fewer."),
    fromName: z
      .string()
      .trim()
      .max(100, "Use 100 characters or fewer.")
      .refine((value) => !/[<>"\r\n]/.test(value), 'Leave out <, > and ".'),
    fromAddress: z.string().trim().pipe(z.email("Enter a valid email address.")),
    replyTo: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || z.email().safeParse(value).success,
        "Enter a valid email address.",
      ),
  })
  .superRefine((values, context) => {
    // The API refuses this as VALIDATION_FAILED on `username`.
    if (values.password !== "" && values.username === "") {
      context.addIssue({
        code: "custom",
        path: ["username"],
        message: "Enter the username the password belongs to.",
      });
    }
  });

type EmailSettingsValues = z.infer<typeof emailSettingsSchema>;

const EMAIL_SETTINGS_FIELDS = [
  "host",
  "port",
  "secure",
  "username",
  "password",
  "fromName",
  "fromAddress",
  "replyTo",
] as const;

function valuesOf(settings: EmailSettings): EmailSettingsValues {
  return {
    host: settings.host ?? "",
    port: settings.port === null ? "587" : String(settings.port),
    secure: settings.secure ? "true" : "false",
    username: settings.username ?? "",
    password: "",
    fromName: settings.fromName ?? "",
    fromAddress: settings.fromAddress ?? "",
    replyTo: settings.replyTo ?? "",
  };
}

// PUT replaces the saved settings, so every field is sent. The password is the exception:
// left out it keeps the stored one, a typed one replaces it, and null removes it.
function inputOf(values: EmailSettingsValues, removePassword: boolean): UpdateEmailSettingsInput {
  return {
    host: values.host,
    port: Number(values.port),
    secure: values.secure === "true",
    username: values.username || null,
    fromName: values.fromName || null,
    fromAddress: values.fromAddress,
    replyTo: values.replyTo || null,
    ...(removePassword ? { password: null } : values.password ? { password: values.password } : {}),
  };
}

function passwordPlaceholder(settings: EmailSettings, removePassword: boolean): string {
  if (removePassword) {
    return "Will be removed when you save";
  }
  if (!settings.canStorePassword) {
    return "Cannot be stored on this server";
  }
  if (settings.passwordUnreadable) {
    return "Enter the password again";
  }
  if (settings.hasPassword) {
    return settings.source === "DATABASE"
      ? "Saved (leave empty to keep it)"
      : "Set in the environment";
  }
  return "";
}

function passwordHint(settings: EmailSettings): string | undefined {
  if (settings.source === "ENVIRONMENT" && settings.hasPassword && settings.canStorePassword) {
    return "The environment's password is not copied. Enter it again to save it here.";
  }
  if (settings.canStorePassword) {
    return "Stored encrypted. It is never shown again.";
  }
  return undefined;
}

// The mail server form. It starts from the settings in effect, so with the environment's
// settings in use it shows those, and saving stores them in the database.
export function EmailSettingsForm({ settings }: { settings: EmailSettings }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  // "Remove password" was chosen: the next save sends `password: null`.
  const [removePassword, setRemovePassword] = useState(false);
  const form = useForm<EmailSettingsValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: valuesOf(settings),
  });
  const { control } = form;
  // Only a password saved here can be kept or removed.
  const hasSavedPassword = settings.source === "DATABASE" && settings.hasPassword;

  async function onSubmit(values: EmailSettingsValues) {
    setFormError(null);
    try {
      await dispatch(saveEmailSettings(inputOf(values, removePassword))).unwrap();
      // The page mounts a fresh form with what the API stored.
      toast.success("The email settings were saved. Send a test email to check them.");
    } catch (error) {
      // ENCRYPTION_KEY_MISSING and the rest show above the form; what was typed stays.
      setFormError(applyServerError(error as ApiError, form.setError, EMAIL_SETTINGS_FIELDS));
    }
  }

  return (
    <form
      noValidate
      aria-labelledby="mail-server-title"
      className="bg-card flex min-w-0 flex-col rounded-lg border"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <div className="flex flex-col gap-1 border-b p-4 sm:px-6">
        <h2 id="mail-server-title" className="text-base font-medium">
          Mail server (SMTP)
        </h2>
        <p className="text-muted-foreground text-sm">
          Invites, password resets, reminders and the emails your team sends all go through it.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <FormAlert message={formError} />
        {settings.passwordUnreadable ? (
          <Alert
            role="note"
            className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
          >
            <TriangleAlert aria-hidden />
            <AlertDescription className="text-foreground">
              The saved password can no longer be read, because the server&apos;s
              SETTINGS_ENCRYPTION_KEY has changed. Email cannot be sent until you enter the password
              again and save.
            </AlertDescription>
          </Alert>
        ) : null}
        {settings.canStorePassword ? null : (
          <Alert role="note">
            <Lock aria-hidden />
            <AlertDescription className="text-foreground">
              This server has no SETTINGS_ENCRYPTION_KEY, so a password cannot be stored. A mail
              server that needs no login can still be saved. To save a password, set the variable on
              the server and restart it.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FormField control={control} name="host" label="Host">
              {(field) => (
                <Input
                  {...field}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="smtp.example.com"
                  maxLength={253}
                  className="h-10"
                />
              )}
            </FormField>
          </div>
          <FormField control={control} name="port" label="Port">
            {(field) => (
              <Input {...field} inputMode="numeric" autoComplete="off" className="h-10" />
            )}
          </FormField>
          <div className="sm:col-span-2">
            <FormField control={control} name="secure" label="Encryption">
              {({
                id,
                value,
                onChange,
                "aria-invalid": invalid,
                "aria-describedby": describedBy,
              }) => (
                <SelectControl
                  id={id}
                  value={value}
                  onChange={onChange}
                  invalid={invalid}
                  describedBy={describedBy}
                  options={ENCRYPTION_OPTIONS}
                />
              )}
            </FormField>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="username"
            label="Username"
            description="Leave the username and the password empty for a mail server without login."
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={200}
                className="h-10"
              />
            )}
          </FormField>
          <FormField
            control={control}
            name="password"
            label="Password"
            description={passwordHint(settings)}
            labelAction={
              hasSavedPassword ? (
                <button
                  type="button"
                  className="text-primary focus-visible:ring-ring/50 rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-3"
                  onClick={() => {
                    form.setValue("password", "");
                    form.clearErrors(["password", "username"]);
                    setRemovePassword((current) => !current);
                  }}
                >
                  {removePassword ? "Keep password" : "Remove password"}
                </button>
              ) : undefined
            }
          >
            {(field) => (
              <PasswordInput
                {...field}
                autoComplete="new-password"
                maxLength={500}
                placeholder={passwordPlaceholder(settings, removePassword)}
                disabled={removePassword || !settings.canStorePassword}
                className="h-10"
              />
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="fromName"
            label="From name"
            description="The name system emails are sent under. An email a user sends carries their own name."
          >
            {(field) => (
              <Input
                {...field}
                autoComplete="off"
                placeholder="OpenCRM"
                maxLength={100}
                className="h-10"
              />
            )}
          </FormField>
          <FormField
            control={control}
            name="fromAddress"
            label="From address"
            description="Every email is sent from this address."
          >
            {(field) => (
              <Input
                {...field}
                type="email"
                autoComplete="off"
                placeholder="no-reply@example.com"
                maxLength={254}
                className="h-10"
              />
            )}
          </FormField>
          <FormField
            control={control}
            name="replyTo"
            label="Reply-to"
            description="Optional. Where an answer to a system email goes. An email a user sends is answered to that user."
          >
            {(field) => (
              <Input {...field} type="email" autoComplete="off" maxLength={254} className="h-10" />
            )}
          </FormField>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-muted-foreground min-w-0 text-xs">
          {settings.source === "ENVIRONMENT"
            ? "Saving stores these settings in OpenCRM, which then takes over from the environment."
            : "Nothing is sent when you save. Use the test below afterwards."}
        </p>
        <Button type="submit" className="h-10 shrink-0 px-4" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
