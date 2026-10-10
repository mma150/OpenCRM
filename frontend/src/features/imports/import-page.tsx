"use client";

import { Check, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageLoading, PageState } from "@/components/shared/page-state";
import { BackLink } from "@/components/shared/record-layout";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import type { Me } from "@/features/auth/auth.types";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import type { ApiError } from "@/lib/api/http";
import { recordAccess } from "@/lib/record-access";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { type ChosenFile, ImportFileStep } from "./import-file-step";
import { IMPORT_TYPE_WORDS, importTypeFromAddress } from "./import-labels";
import { ImportMappingStep } from "./import-mapping-step";
import { ImportResultsStep } from "./import-results-step";
import { listImportFields } from "./imports.api";
import type { ImportField, ImportPreview, ImportResult, ImportType } from "./imports.types";

// Where the import is. Nothing of it is kept anywhere else: leaving the page starts over.
type Stage =
  | { step: "file"; problem: string | null }
  | { step: "mapping"; file: ChosenFile; preview: ImportPreview }
  | { step: "results"; file: ChosenFile; result: ImportResult };

const STEPS = [
  { step: "file", label: "Upload" },
  { step: "mapping", label: "Map columns" },
  { step: "results", label: "Results" },
] as const;

function Steps({ current }: { current: Stage["step"] }) {
  const position = STEPS.findIndex((item) => item.step === current);
  return (
    <ol aria-label="Steps" className="bg-card grid grid-cols-3 gap-2 rounded-lg border p-3 sm:p-4">
      {STEPS.map((item, index) => {
        const done = index < position;
        const active = index === position;
        return (
          <li
            key={item.step}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2 sm:text-left"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                active && "bg-primary text-primary-foreground border-primary",
                done && "bg-primary/10 text-primary border-primary/30",
                !active && !done && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "min-w-0 text-xs wrap-anywhere sm:text-sm",
                active ? "font-medium" : "text-muted-foreground",
              )}
            >
              {item.label}
              <span className="sr-only">
                {done ? " (done)" : active ? " (current step)" : " (not started)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ImportWizard({ me }: { me: Me }) {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const { data: assignable } = useAppSelector(selectAssignableUsers);
  // The list the user came from chooses the type (`?type=contacts`); step 1 can change it.
  const [type, setType] = useState<ImportType>(() =>
    importTypeFromAddress(searchParams.get("type")),
  );
  const [stage, setStage] = useState<Stage>({ step: "file", problem: null });
  // The fields a column can go into, with the type they were asked for.
  const [fields, setFields] = useState<{ type: ImportType; data: ImportField[] } | null>(null);
  const [fieldsError, setFieldsError] = useState<{ type: ImportType; error: ApiError } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const { canReassign } = recordAccess(me.role);
  const words = IMPORT_TYPE_WORDS[type];

  useEffect(() => {
    let current = true;
    listImportFields(type).then(
      (data) => {
        if (current) {
          setFields({ type, data });
          setFieldsError(null);
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setFieldsError({ type, error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [type, attempt]);

  useEffect(() => {
    // Only an Admin and a Sales Manager may give records to someone else.
    if (canReassign) {
      void dispatch(fetchAssignableUsers());
    }
  }, [dispatch, canReassign]);

  const typeFields = fields?.type === type ? fields.data : null;
  const owners = canReassign
    ? (assignable ?? []).map((user) => ({ value: user.id, label: user.name }))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <BackLink href={`/${words.plural}`} label={`Back to ${words.plural}`} />
      <PageHeader
        title={`Import ${words.plural}`}
        description="Bring records in from a spreadsheet saved as a CSV file."
      />
      <Steps current={stage.step} />

      {fieldsError?.type === type && typeFields === null ? (
        <PageError
          error={fieldsError.error}
          onRetry={() => {
            setFieldsError(null);
            setAttempt((count) => count + 1);
          }}
        />
      ) : stage.step === "file" ? (
        <ImportFileStep
          // A file the API refused later starts this step again, with what it said.
          key={stage.problem ?? "file"}
          type={type}
          onTypeChange={setType}
          fields={typeFields}
          problem={stage.problem}
          onPreviewed={(file, preview) => {
            setStage({ step: "mapping", file, preview });
          }}
        />
      ) : stage.step === "mapping" ? (
        typeFields === null ? (
          <PageLoading label="Loading the fields..." />
        ) : (
          <ImportMappingStep
            type={type}
            file={stage.file}
            preview={stage.preview}
            fields={typeFields}
            myId={me.id}
            owners={owners}
            onBack={() => {
              setStage({ step: "file", problem: null });
            }}
            onFileProblem={(problem) => {
              setStage({ step: "file", problem });
            }}
            onImported={(result) => {
              setStage({ step: "results", file: stage.file, result });
            }}
          />
        )
      ) : (
        <ImportResultsStep
          type={type}
          fileName={stage.file.name}
          result={stage.result}
          onAnother={() => {
            setStage({ step: "file", problem: null });
          }}
        />
      )}
    </div>
  );
}

// /import (DATA-01, DATA-02): leads, contacts or companies from a CSV file, in three steps:
// choose the file, match its columns to fields, read the results. Every role that may
// create records may import; a Read-only user gets a page that says so, and the API
// refuses them too.
export function ImportPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (!recordAccess(me.role).canWrite) {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Import"
        description="A Read-only user cannot add records."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <ImportWizard me={me} />;
}
