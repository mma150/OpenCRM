"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { emailSchema } from "@/lib/validation";

import { sendTestEmail } from "./email-settings.api";

const testSchema = z.object({ to: z.string().trim().pipe(emailSchema) });

type TestValues = z.infer<typeof testSchema>;

// "Send test email": one message through the mail server in effect. The answer is shown
// here and nowhere else, so it does not enter the store.
export function TestEmailCard({ defaultTo }: { defaultTo: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<TestValues>({
    resolver: zodResolver(testSchema),
    defaultValues: { to: defaultTo },
  });

  async function onSubmit(values: TestValues) {
    setSentTo(null);
    setFormError(null);
    try {
      const result = await sendTestEmail(values.to);
      setSentTo(result.to);
    } catch (error) {
      // EMAIL_NOT_CONFIGURED, EMAIL_SEND_FAILED (with the API's safe reason) and RATE_LIMITED.
      setFormError(applyServerError(error as ApiError, form.setError, ["to"]));
    }
  }

  return (
    <form
      noValidate
      aria-labelledby="test-email-title"
      className="bg-card flex min-w-0 flex-col gap-4 rounded-lg border p-4 sm:p-6"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <div className="flex flex-col gap-1">
        <h2 id="test-email-title" className="text-base font-medium">
          Send a test email
        </h2>
        <p className="text-muted-foreground text-sm">
          Sends one message through the mail server in effect now. Changes in the form above are not
          tested until you save them.
        </p>
      </div>
      <FormAlert message={formError} />
      {sentTo ? (
        <Alert
          role="status"
          className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
        >
          <CircleCheck aria-hidden />
          <AlertDescription className="text-foreground wrap-anywhere">
            Test email sent to {sentTo}. Check that inbox to see that it arrived.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 sm:max-w-sm sm:flex-1">
          <FormField control={form.control} name="to" label="Send to">
            {(field) => (
              <Input {...field} type="email" autoComplete="off" maxLength={254} className="h-10" />
            )}
          </FormField>
        </div>
        <Button
          type="submit"
          variant="outline"
          // Lines the button up with the input, under the label.
          className="h-10 shrink-0 px-4 sm:mt-7"
          disabled={form.formState.isSubmitting}
        >
          <Send aria-hidden />
          {form.formState.isSubmitting ? "Sending..." : "Send test email"}
        </Button>
      </div>
    </form>
  );
}
