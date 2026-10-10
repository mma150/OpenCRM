"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageLoading, PageState } from "@/components/shared/page-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  type CustomFieldDialog,
  CustomFieldDialogs,
  FIELD_LIMIT_MESSAGE,
  isNotApplicable,
} from "./custom-field-dialogs";
import {
  CUSTOM_FIELD_RECORD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  MAX_ACTIVE_CUSTOM_FIELDS,
  RECORD_TYPE_WORDS,
  recordTypeOptions,
} from "./custom-field-labels";
import {
  fetchCustomFieldSettings,
  reorderCustomFields,
  restoreCustomField,
  selectCustomFieldSettings,
} from "./custom-fields.slice";
import type { CustomField, CustomFieldRecordType } from "./custom-fields.types";

const rowClass =
  "flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4";

// "Dropdown · 3 options", or the type alone.
function typeLine(field: CustomField): string {
  const type = CUSTOM_FIELD_TYPE_LABELS[field.type];
  if (field.type !== "DROPDOWN") {
    return type;
  }
  const count = field.options.length;
  return `${type} · ${count === 1 ? "1 option" : `${String(count)} options`}`;
}

function FieldName({ field }: { field: CustomField }) {
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
        <span className="min-w-0 wrap-anywhere">{field.label}</span>
        {field.required ? <Badge variant="secondary">Required</Badge> : null}
      </p>
      <p className="text-muted-foreground text-xs">{typeLine(field)}</p>
    </div>
  );
}

// The record type of the tab that is open, from the address: /settings/custom-fields?type=contacts
function useRecordTypeTab(): [CustomFieldRecordType, (next: CustomFieldRecordType) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const named = searchParams.get("type");
  const recordType =
    CUSTOM_FIELD_RECORD_TYPES.find((type) => RECORD_TYPE_WORDS[type].plural === named) ?? "LEAD";

  function change(next: CustomFieldRecordType) {
    // Leads is the default and is left out of the address.
    const query = next === "LEAD" ? "" : `?type=${RECORD_TYPE_WORDS[next].plural}`;
    router.replace(`${pathname}${query}`, { scroll: false });
  }
  return [recordType, change];
}

function CustomFieldsAdmin() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectCustomFieldSettings);
  const [recordType, setRecordType] = useRecordTypeTab();
  const [dialog, setDialog] = useState<CustomFieldDialog>(null);
  // True while a new order is being saved, so a second move waits for the first.
  const [moving, setMoving] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  // The move button that was used last. Once the new order is on screen it gets the focus
  // back, so a field can be moved several places with the keyboard: Enter, Enter, Enter.
  const lastMove = useRef<{ fieldId: string; by: -1 | 1 } | null>(null);
  // Only the answer for the tab that is open is shown.
  const data = settings.recordType === recordType ? settings.data : null;
  const { status, error } = settings;
  const words = RECORD_TYPE_WORDS[recordType];

  useEffect(() => {
    const last = lastMove.current;
    lastMove.current = null;
    if (!last) {
      return;
    }
    const buttons = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>(
        `[data-field="${last.fieldId}"] [data-move]`,
      ) ?? []),
    ];
    // At the end of the list the button is switched off: the other direction takes over.
    const same = buttons.find((button) => button.dataset.move === String(last.by));
    (same && !same.disabled ? same : buttons.find((button) => !button.disabled))?.focus();
  }, [data]);

  useEffect(() => {
    void dispatch(fetchCustomFieldSettings(recordType));
  }, [dispatch, recordType]);

  const active = (data ?? []).filter((field) => !field.archived);
  const archived = (data ?? []).filter((field) => field.archived);
  const full = active.length >= MAX_ACTIVE_CUSTOM_FIELDS;

  // Swaps a field with its neighbour and saves the new order. The API answers with every
  // field of the record type, which replaces the list.
  async function move(field: CustomField, by: -1 | 1) {
    const ids = active.map((candidate) => candidate.id);
    const from = ids.indexOf(field.id);
    const neighbour = ids[from + by];
    if (moving || from === -1 || neighbour === undefined) {
      return;
    }
    ids[from + by] = field.id;
    ids[from] = neighbour;
    setMoving(true);
    try {
      lastMove.current = { fieldId: field.id, by };
      await dispatch(reorderCustomFields({ recordType, ids })).unwrap();
    } catch (caught) {
      toast.error(`${field.label} could not be moved. ${describeApiError(caught as ApiError)}`);
    } finally {
      setMoving(false);
    }
  }

  async function restore(field: CustomField) {
    try {
      await dispatch(restoreCustomField(field.id)).unwrap();
      toast.success(`${field.label} was restored.`);
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.error(isNotApplicable(apiError) ? FIELD_LIMIT_MESSAGE : describeApiError(apiError));
    }
  }

  const addButton = (
    <Button
      type="button"
      className="h-10 px-4"
      disabled={data === null || full}
      onClick={() => {
        setDialog({ kind: "add", recordType });
      }}
    >
      <Plus aria-hidden />
      Add field
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Custom fields"
        description="Your own fields on leads, contacts, companies and opportunities. They show in forms, on record pages, in list filters, and in imports and exports."
        action={addButton}
      />

      <SegmentedControl
        label="Record type"
        className="max-sm:grid max-sm:grid-cols-2 sm:self-start"
        value={recordType}
        options={recordTypeOptions}
        onChange={setRecordType}
      />

      {data === null ? (
        status === "failed" && error ? (
          <PageError
            error={error}
            onRetry={() => void dispatch(fetchCustomFieldSettings(recordType))}
          />
        ) : (
          <PageLoading label="Loading custom fields..." />
        )
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {String(active.length)} of {String(MAX_ACTIVE_CUSTOM_FIELDS)} fields in use on{" "}
            {words.plural}.
            {full ? " That is the most a record type can have: archive one to add another." : null}
          </p>
          {/* A failed reload keeps the last list on screen, so say that it is out of date. */}
          {status === "failed" && error ? <FormAlert message={describeApiError(error)} /> : null}

          {active.length === 0 ? (
            <PageState
              icon={SlidersHorizontal}
              title={`No custom fields on ${words.plural} yet`}
              description={`Add a field to keep something about every ${words.singular} that OpenCRM does not have a place for.`}
            />
          ) : (
            <ol
              ref={list}
              aria-label="Custom fields"
              className="bg-card flex flex-col divide-y rounded-lg border"
            >
              {active.map((field, index) => (
                <li key={field.id} data-field={field.id} className={rowClass}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                    >
                      {index + 1}
                    </span>
                    <FieldName field={field} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1 max-sm:-ml-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 sm:size-9"
                      aria-label={`Move ${field.label} up`}
                      data-move="-1"
                      // Not switched off while a move is being saved: that would drop the focus.
                      disabled={index === 0}
                      onClick={() => void move(field, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 sm:size-9"
                      aria-label={`Move ${field.label} down`}
                      data-move="1"
                      disabled={index === active.length - 1}
                      onClick={() => void move(field, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 sm:size-9"
                      aria-label={`Edit ${field.label}`}
                      onClick={() => {
                        setDialog({ kind: "edit", field });
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 sm:size-9"
                      aria-label={`Archive ${field.label}`}
                      onClick={() => {
                        setDialog({ kind: "archive", field });
                      }}
                    >
                      <Archive aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {archived.length > 0 ? (
            <section aria-labelledby="archived-fields" className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="archived-fields" className="text-base font-semibold">
                  Archived
                </h2>
                <p className="text-muted-foreground text-sm">
                  Hidden everywhere, with their values kept. Restore a field to bring it and its
                  values back, or delete it for good.
                </p>
              </div>
              <ul
                aria-label="Archived custom fields"
                className="bg-muted/40 flex flex-col divide-y rounded-lg border"
              >
                {archived.map((field) => (
                  <li key={field.id} className={rowClass}>
                    <FieldName field={field} />
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 px-3 sm:h-9"
                        aria-label={`Restore ${field.label}`}
                        onClick={() => void restore(field)}
                      >
                        <ArchiveRestore aria-hidden />
                        Restore
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-10 px-3 sm:h-9"
                        aria-label={`Delete ${field.label} permanently`}
                        onClick={() => {
                          setDialog({ kind: "delete", field });
                        }}
                      >
                        <Trash2 aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <CustomFieldDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}

// /settings/custom-fields (CF-01): an Admin adds, edits, reorders, archives, restores and
// deletes the custom fields of each record type. Everyone else gets a page that says so;
// the API refuses them too.
export function CustomFieldsSettingsPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (me.role !== "ADMIN") {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Custom fields"
        description="Only an Admin can change the custom fields."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <CustomFieldsAdmin />;
}
