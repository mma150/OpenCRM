"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageLoading, PageState } from "@/components/shared/page-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchEmailSettings,
  removeEmailSettings,
  selectEmailSettings,
} from "./email-settings.slice";
import type { EmailSettings, EmailSource } from "./email-settings.types";
import { EmailSettingsForm } from "./email-settings-form";
import { TestEmailCard } from "./test-email-card";

// Where the mail server in effect comes from, in words. The badge always carries a word,
// never colour alone.
const SOURCES: Record<
  EmailSource,
  { title: string; badge: string; badgeClass: string; meaning: string }
> = {
  DATABASE: {
    title: "Saved in OpenCRM",
    badge: "Email is on",
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    meaning:
      "OpenCRM sends email through the mail server saved on this page. It wins over the server's SMTP_* environment variables.",
  },
  ENVIRONMENT: {
    title: "From the server's environment (SMTP_* variables)",
    badge: "Email is on",
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    meaning:
      "Nothing is saved in OpenCRM, so email goes through the mail server set with the SMTP_* variables. The form shows the values in effect; saving it stores them in OpenCRM's database, which then takes over from the environment.",
  },
  NONE: {
    title: "Email is off",
    badge: "Off",
    badgeClass: "border-border bg-muted text-muted-foreground",
    meaning:
      "No mail server is set up, so OpenCRM sends nothing: invite and reset links are shown for you to copy, and reminders are not emailed. Fill in the form and save to turn email on.",
  },
};

// Asks before forgetting the saved settings.
function RemoveSettingsDialog({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      const now = await dispatch(removeEmailSettings()).unwrap();
      toast.success(
        now.source === "ENVIRONMENT"
          ? "The saved settings were removed. Email now uses the server's environment."
          : "The saved settings were removed. Email is now off.",
      );
      onClose();
    } catch (caught) {
      setError(describeApiError(caught as ApiError));
      setWorking(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !working) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the saved email settings?</AlertDialogTitle>
          <AlertDialogDescription>
            OpenCRM forgets the mail server saved here, including its password. Email then goes back
            to the settings in the server&apos;s environment (the SMTP_* variables), or is switched
            off when there are none.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10 px-4" disabled={working}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-10 px-4"
            disabled={working}
            onClick={(event) => {
              // Keep the dialog open until the request has answered.
              event.preventDefault();
              void confirm();
            }}
          >
            {working ? "Removing..." : "Remove saved settings"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Which mail server is in effect, and what that means.
function SourceCard({ settings, onRemove }: { settings: EmailSettings; onRemove: () => void }) {
  const source = SOURCES[settings.source];

  return (
    <section
      aria-labelledby="email-source-title"
      className="bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:p-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Settings in effect
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id="email-source-title" className="min-w-0 text-base font-medium wrap-anywhere">
            {source.title}
          </h2>
          <Badge variant="outline" className={cn(source.badgeClass)}>
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {source.badge}
          </Badge>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">{source.meaning}</p>
      {settings.source === "DATABASE" ? (
        <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            {settings.updatedAt ? `Last saved ${formatDateTime(settings.updatedAt)}.` : null}
          </p>
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive h-10 shrink-0 px-4"
            onClick={onRemove}
          >
            Remove saved settings
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function EmailSettingsAdmin({ myEmail }: { myEmail: string }) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectEmailSettings);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    void dispatch(fetchEmailSettings());
  }, [dispatch]);

  return (
    <>
      <PageHeader title="Email" description="The mail server OpenCRM sends email through." />
      {data ? (
        <>
          {/* A failed reload keeps the last answer on screen, so say that it is out of date. */}
          {status === "failed" && error ? <FormAlert message={describeApiError(error)} /> : null}
          <SourceCard
            settings={data}
            onRemove={() => {
              setRemoving(true);
            }}
          />
          {/* A save or a removal changes where the settings come from or when they were
              saved: the form then starts again from what is in effect. A failed save changes
              neither, so what was typed stays. */}
          <EmailSettingsForm key={`${data.source}:${data.updatedAt ?? ""}`} settings={data} />
          <TestEmailCard defaultTo={myEmail} />
        </>
      ) : status === "failed" && error ? (
        <PageError error={error} onRetry={() => void dispatch(fetchEmailSettings())} />
      ) : (
        <PageLoading label="Loading email settings..." />
      )}
      {removing ? (
        <RemoveSettingsDialog
          onClose={() => {
            setRemoving(false);
          }}
        />
      ) : null}
    </>
  );
}

// /settings/email (MAIL-01): an Admin sets the outgoing mail server, tests it and removes
// it again. Everyone else gets a page that says so; the API refuses them too.
export function EmailSettingsPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (me.role !== "ADMIN") {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Email"
        description="Only an Admin can set up outgoing email."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <EmailSettingsAdmin myEmail={me.email} />;
}
