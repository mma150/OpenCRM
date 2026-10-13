"use client";

import { Eye, Lock, Mail, Pencil, Plus, ShieldAlert, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageLoading, PageState } from "@/components/shared/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { describeApiError } from "@/lib/api/error-messages";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { type EmailTemplateDialog, EmailTemplateDialogs } from "./email-template-dialogs";
import { templateAccess } from "./email-template-labels";
import { fetchEmailTemplates, selectEmailTemplates } from "./email-templates.slice";
import type { EmailTemplate } from "./email-templates.types";

// One template: its name, who sees it, its subject and the start of its text.
function TemplateRow({
  template,
  mine,
  onOpen,
}: {
  template: EmailTemplate;
  mine: boolean;
  onOpen: (dialog: EmailTemplateDialog) => void;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          <span className="min-w-0 wrap-anywhere">{template.name}</span>
          {template.shared ? (
            <Badge variant="secondary">
              <Users aria-hidden />
              Shared
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Lock aria-hidden />
              Only you
            </Badge>
          )}
        </p>
        <p className="text-sm wrap-anywhere">
          <span className="text-muted-foreground">Subject: </span>
          {template.subject}
        </p>
        <p className="text-muted-foreground line-clamp-2 text-sm wrap-anywhere">{template.body}</p>
        {mine ? null : <p className="text-muted-foreground text-xs">By {template.owner.name}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 max-sm:-ml-2">
        {template.editable ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3 sm:h-9"
              aria-label={`Edit ${template.name}`}
              onClick={() => {
                onOpen({ kind: "edit", template });
              }}
            >
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive h-11 px-3 sm:h-9"
              aria-label={`Delete ${template.name}`}
              onClick={() => {
                onOpen({ kind: "delete", template });
              }}
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-11 px-3 sm:h-9"
            aria-label={`View ${template.name}`}
            onClick={() => {
              onOpen({ kind: "view", template });
            }}
          >
            <Eye aria-hidden />
            View
          </Button>
        )}
      </div>
    </li>
  );
}

function EmailTemplates({ meId, canShare }: { meId: string; canShare: boolean }) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectEmailTemplates);
  const [dialog, setDialog] = useState<EmailTemplateDialog>(null);

  useEffect(() => {
    void dispatch(fetchEmailTemplates());
  }, [dispatch]);

  const addButton = (
    <Button
      type="button"
      className="h-10 px-4"
      disabled={data === null}
      onClick={() => {
        setDialog({ kind: "add" });
      }}
    >
      <Plus aria-hidden />
      New template
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Email templates"
        description="Reusable emails: your own, and the ones shared with everyone. Choose one when you send an email from a record."
        action={addButton}
      />

      {data === null ? (
        status === "failed" && error ? (
          <PageError error={error} onRetry={() => void dispatch(fetchEmailTemplates())} />
        ) : (
          <PageLoading label="Loading templates..." />
        )
      ) : (
        <>
          {/* A failed reload keeps the last list on screen, so say that it is out of date. */}
          {status === "failed" && error ? <FormAlert message={describeApiError(error)} /> : null}
          {data.length === 0 ? (
            <PageState
              icon={Mail}
              title="No templates yet"
              description="Write an email once and reuse it: a follow-up, an introduction, a thank-you. Placeholders such as the contact's first name are filled in when it is sent."
            />
          ) : (
            <ul
              aria-label="Email templates"
              className="bg-card flex min-w-0 flex-col divide-y rounded-lg border"
            >
              {data.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  mine={template.owner.id === meId}
                  onOpen={setDialog}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <EmailTemplateDialogs
        dialog={dialog}
        canShare={canShare}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}

// /settings/email-templates (MAIL-04): everyone who can send email keeps templates of their
// own and sees the shared ones. A Read-only user sends no email and gets a page that says
// so; the API refuses them too.
export function EmailTemplatesPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }
  const access = templateAccess(me.role);

  if (!access.canUse) {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Email templates"
        description="A Read-only user cannot send email, so there are no templates to keep."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <EmailTemplates meId={me.id} canShare={access.canShare} />;
}
