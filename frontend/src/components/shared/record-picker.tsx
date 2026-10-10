"use client";

import { Check, ChevronDown, type LucideIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { cn } from "@/lib/utils";

import { FormAlert } from "./form-alert";

// Chooses one record out of any number by searching for its name: a button that shows the
// current record and opens a dialog with a search box and the matches. It never loads every
// record, so it is used wherever a company or a contact is chosen. A feature says what its
// record is (`RecordPickerKind`) and wraps this in a picker of its own:
// `CompanyPicker` in features/companies, `ContactPicker` in features/contacts.

// A record as the picker hands it over.
export type PickedRecord = { id: string; name: string };

// One row the search found. `detail` is a second line under the name (a contact's company).
export type PickerMatch = PickedRecord & { detail?: string | null };

export type RecordPickerKind = {
  // The word on the filter button and in the field's label for screen readers: "Company".
  label: string;
  // The record in a sentence: "company" and "companies".
  noun: string;
  plural: string;
  icon: LucideIcon;
  // One page of the records whose name matches `text` ("" for the first ones), by name.
  search: (text: string, pageSize: number) => Promise<{ matches: PickerMatch[]; total: number }>;
  // One record by its id, for a filter whose id came from the address.
  find: (id: string) => Promise<PickedRecord>;
};

// How many records the picker shows at once. More than that: the user types to narrow.
const PICKER_PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

// What one search answered, with the text it was asked for.
type Answer =
  { search: string; matches: PickerMatch[]; total: number } | { search: string; error: ApiError };

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

// The inside of the dialog: a search box and the records it finds, by name. It is mounted
// only while the dialog is open, so every opening starts with an empty box. The answers do
// not enter the store: nothing else shows them.
function RecordSearch({
  kind,
  selectedId,
  clearLabel,
  onPick,
}: {
  kind: RecordPickerKind;
  selectedId: string | null;
  // The row that picks nothing ("No company", "All companies"); left out when none is picked.
  clearLabel: string;
  onPick: (record: PickedRecord | null) => void;
}) {
  const [text, setText] = useState("");
  // What is searched for: the text once typing has paused, trimmed.
  const [search, setSearch] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Counts the retries, so Retry asks again for the same text.
  const [attempt, setAttempt] = useState(0);
  const Icon = kind.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(text.trim());
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    // An answer to an older search must not replace a newer one.
    let current = true;
    kind.search(search, PICKER_PAGE_SIZE).then(
      (found) => {
        if (current) {
          setAnswer({ search, ...found });
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setAnswer({ search, error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [kind, search, attempt]);

  // The last answer stays on screen while the next one is on its way.
  const loading = answer?.search !== search;
  const rowClass =
    "hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-3";

  return (
    <>
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label={`Search ${kind.plural}`}
          placeholder={`Search ${kind.plural} by name`}
          maxLength={100}
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          className="h-10 pl-9"
        />
      </div>

      {/* A fixed height, so the dialog does not jump while the results change. */}
      <div
        className="flex h-72 max-h-[50dvh] min-w-0 flex-col gap-1 overflow-y-auto"
        aria-busy={loading}
      >
        {answer === null ? (
          <p role="status" className="text-muted-foreground px-3 py-2 text-sm">
            Loading {kind.plural}...
          </p>
        ) : "error" in answer ? (
          <div className="flex flex-col items-start gap-2">
            <FormAlert message={describeApiError(answer.error)} />
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              onClick={() => {
                setAttempt(attempt + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            {selectedId ? (
              <button
                type="button"
                className={cn(rowClass, "text-muted-foreground")}
                onClick={() => {
                  onPick(null);
                }}
              >
                <X aria-hidden className="size-4 shrink-0" />
                {clearLabel}
              </button>
            ) : null}
            {answer.matches.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm wrap-anywhere">
                {answer.search
                  ? `No ${kind.plural} match "${answer.search}".`
                  : `No ${kind.plural} yet.`}
              </p>
            ) : (
              <ul aria-label={capitalize(kind.plural)} className="flex min-w-0 flex-col gap-1">
                {answer.matches.map((match) => (
                  <li key={match.id} className="min-w-0">
                    <button
                      type="button"
                      aria-current={match.id === selectedId ? "true" : undefined}
                      className={rowClass}
                      onClick={() => {
                        onPick({ id: match.id, name: match.name });
                      }}
                    >
                      <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="min-w-0 wrap-anywhere">{match.name}</span>
                        {match.detail ? (
                          <span className="text-muted-foreground min-w-0 text-xs wrap-anywhere">
                            {match.detail}
                          </span>
                        ) : null}
                      </span>
                      {match.id === selectedId ? (
                        <Check aria-hidden className="text-primary size-4 shrink-0" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {answer.total > answer.matches.length ? (
              <p className="text-muted-foreground px-3 py-2 text-xs">
                Showing {answer.matches.length} of {answer.total}. Type to narrow the list.
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// In a form it is the control of a FormField, with a button beside it that clears it:
//
//   <RecordPicker kind={COMPANY} id={id} value={company} onChange={setCompany}
//     invalid={invalid} describedBy={describedBy} />
//
// Above a list, `appearance="filter"` makes it look like the toolbar's selects
// ("Company: All"); see RecordFilter below.
export function RecordPicker({
  kind,
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  appearance = "field",
  description,
}: {
  kind: RecordPickerKind;
  id?: string;
  // The record that is picked, or null for none.
  value: PickedRecord | null;
  onChange: (record: PickedRecord | null) => void;
  invalid?: boolean;
  describedBy?: string;
  appearance?: "field" | "filter";
  // The sentence under the dialog's title, when the default does not say enough.
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const isFilter = appearance === "filter";
  const Icon = kind.icon;

  return (
    <>
      {isFilter ? (
        <Button
          type="button"
          variant="outline"
          aria-label={kind.label}
          aria-haspopup="dialog"
          className="border-input dark:bg-input/30 h-10 w-full min-w-0 justify-between gap-1.5 bg-transparent pr-2 pl-2.5 font-normal sm:w-auto sm:max-w-60"
          onClick={() => {
            setOpen(true);
          }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground">{kind.label}:</span>
            <span className="truncate">{value ? value.name : "All"}</span>
          </span>
          <ChevronDown aria-hidden className="text-muted-foreground size-4" />
        </Button>
      ) : (
        <div className="flex min-w-0 gap-2">
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={value ? `${kind.label}: ${value.name}` : `${kind.label}: none`}
            aria-haspopup="dialog"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="border-input dark:bg-input/30 h-10 min-w-0 flex-1 justify-start gap-2 bg-transparent px-2.5 font-normal"
            onClick={() => {
              setOpen(true);
            }}
          >
            <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value ? value.name : `Choose a ${kind.noun}`}
            </span>
          </Button>
          {value ? (
            <Button
              type="button"
              variant="outline"
              className="size-10 shrink-0"
              aria-label={`Clear ${kind.noun}`}
              onClick={() => {
                onChange(null);
              }}
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Near the top on a phone, so the results stay above the on-screen keyboard. */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto max-sm:top-4 max-sm:translate-y-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a {kind.noun}</DialogTitle>
            <DialogDescription>
              {description ??
                (isFilter
                  ? `Show only what belongs to one ${kind.noun}.`
                  : `Search the ${kind.plural} you can see by name.`)}
            </DialogDescription>
          </DialogHeader>
          <RecordSearch
            kind={kind}
            selectedId={value?.id ?? null}
            clearLabel={isFilter ? `All ${kind.plural}` : `No ${kind.noun}`}
            onPick={(record) => {
              onChange(record);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// The picker as a filter above a list (ListToolbar's `extra`). The list keeps only the
// record's id, in the address; this finds the name to show for it, by asking the API when the
// id did not come from the picker itself (a reload, or a link from the record's page).
export function RecordFilter({
  kind,
  recordId,
  onChange,
  description,
}: {
  kind: RecordPickerKind;
  // "" when the filter is off.
  recordId: string;
  onChange: (recordId: string) => void;
  description?: string;
}) {
  const [known, setKnown] = useState<PickedRecord | null>(null);
  const name = known?.id === recordId ? known.name : null;

  useEffect(() => {
    if (!recordId || name !== null) {
      return;
    }
    let current = true;
    kind.find(recordId).then(
      (record) => {
        if (current) {
          setKnown({ id: record.id, name: record.name });
        }
      },
      () => {
        // A record that is gone, or not this user's to see: the list is empty and says so.
        if (current) {
          setKnown({ id: recordId, name: `Unknown ${kind.noun}` });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [kind, recordId, name]);

  return (
    <RecordPicker
      kind={kind}
      appearance="filter"
      description={description}
      // The name is on its way for a moment after a reload.
      value={recordId ? { id: recordId, name: name ?? "..." } : null}
      onChange={(record) => {
        setKnown(record);
        onChange(record?.id ?? "");
      }}
    />
  );
}
