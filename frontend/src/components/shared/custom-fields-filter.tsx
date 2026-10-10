"use client";

import { CircleAlert, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomField } from "@/features/custom-fields/custom-fields.types";
import type { ApiError } from "@/lib/api/http";
import { formatDay } from "@/lib/format";
import { useIsPhone } from "@/lib/use-is-phone";
import { FULL_SCREEN_DIALOG, useVisibleHeight } from "@/lib/use-visible-height";
import { cn } from "@/lib/utils";

import type { CustomFilterParams } from "./list-url-state";

// The custom field filters of a list (CF-03): the "More filters" button with its panel, and
// the chips that show what is set. Both work on the list's `state.custom`, the `cf.`
// parameters of the address, which are exactly what the API takes:
//
//   <ListToolbar ... more={<CustomFieldFilterButton fields={fields} values={state.custom} onApply={setCustom} />} />
//   <CustomFieldFilterChips fields={fields} values={state.custom} onChange={setCustom} error={error} />

type ParamName = keyof CustomFilterParams;

// The select needs a value for "no filter"; the list sees it as "".
const ANY = "__any__";
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
// The longest value the API accepts in a filter.
const MAX_VALUE_LENGTH = 100;

const param = (field: CustomField, suffix = ""): ParamName => `cf.${field.id}${suffix}`;

// The parameters a field can be filtered with, by its type.
function paramsOf(field: CustomField): ParamName[] {
  switch (field.type) {
    case "TEXT":
    case "DROPDOWN":
      return [param(field)];
    case "NUMBER":
      return [param(field, ".min"), param(field, ".max")];
    case "DATE":
      return [param(field, ".from"), param(field, ".to")];
  }
}

// "cf.<field id>.min" -> "<field id>"
function fieldIdOf(name: string): string {
  return name.slice("cf.".length).split(".")[0] ?? "";
}

// What a chip says about the filter of one field, or null when the field has none set.
function describeFilter(field: CustomField, values: CustomFilterParams): string | null {
  const value = values[param(field)];
  switch (field.type) {
    case "TEXT":
      return value ? `${field.label} contains "${value}"` : null;
    case "DROPDOWN":
      return value ? `${field.label}: ${value}` : null;
    case "NUMBER": {
      const min = values[param(field, ".min")];
      const max = values[param(field, ".max")];
      if (min && max) {
        return `${field.label}: ${min} to ${max}`;
      }
      return min
        ? `${field.label}: at least ${min}`
        : max
          ? `${field.label}: at most ${max}`
          : null;
    }
    case "DATE": {
      const from = values[param(field, ".from")];
      const to = values[param(field, ".to")];
      if (from && to) {
        return `${field.label}: ${formatDay(from)} to ${formatDay(to)}`;
      }
      return from
        ? `${field.label}: from ${formatDay(from)}`
        : to
          ? `${field.label}: until ${formatDay(to)}`
          : null;
    }
  }
}

// How many fields the list is filtered by.
function countFiltered(fields: CustomField[], values: CustomFilterParams): number {
  return fields.filter((field) => describeFilter(field, values) !== null).length;
}

const inputClass = "h-10 min-w-0";

// One field's controls in the panel. `draft` holds every parameter as text.
function FilterControl({
  field,
  draft,
  errors,
  onChange,
}: {
  field: CustomField;
  draft: CustomFilterParams;
  errors: Partial<Record<ParamName, string>>;
  onChange: (name: ParamName, value: string) => void;
}) {
  const id = `filter-${field.id}`;
  const [first, second] = paramsOf(field);
  if (first === undefined) {
    return null;
  }
  const error = errors[first] ?? (second ? errors[second] : undefined);
  const errorId = `${id}-error`;
  const invalid = error !== undefined;

  // A text or a dropdown field: one control with the field's own label.
  if (second === undefined) {
    const value = draft[first] ?? "";
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium wrap-anywhere">
          {field.label}
        </label>
        {field.type === "DROPDOWN" ? (
          <Select
            value={value === "" ? ANY : value}
            onValueChange={(next) => {
              onChange(first, next === ANY ? "" : next);
            }}
          >
            <SelectTrigger id={id} className="w-full min-w-0 data-[size=default]:h-10">
              <span className="truncate">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any</SelectItem>
              {/* An option in the address that the field no longer has is still listed, so
                  the control can show what the list is filtered by. */}
              {[...new Set([...field.options, ...(value ? [value] : [])])].map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={id}
            value={value}
            placeholder="Contains..."
            maxLength={MAX_VALUE_LENGTH}
            autoComplete="off"
            className={inputClass}
            onChange={(event) => {
              onChange(first, event.target.value);
            }}
          />
        )}
      </div>
    );
  }

  // A number or a date field: a range, both ends optional.
  const isDate = field.type === "DATE";
  const ends = [
    { name: first, label: isDate ? "From" : "At least" },
    { name: second, label: isDate ? "To" : "At most" },
  ];
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium wrap-anywhere">{field.label}</legend>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        {ends.map((end) => (
          <div key={end.name} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-${end.label}`} className="text-muted-foreground text-xs">
              {end.label}
            </label>
            <Input
              id={`${id}-${end.label}`}
              aria-label={`${field.label}: ${end.label.toLowerCase()}`}
              aria-invalid={errors[end.name] !== undefined}
              aria-describedby={invalid ? errorId : undefined}
              value={draft[end.name] ?? ""}
              type={isDate ? "date" : "text"}
              inputMode={isDate ? undefined : "decimal"}
              autoComplete="off"
              className={inputClass}
              onChange={(event) => {
                onChange(end.name, event.target.value);
              }}
            />
          </div>
        ))}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// Checks the draft the way the API will, so a mistake is said beside its field.
function checkDraft(
  fields: CustomField[],
  draft: CustomFilterParams,
): Partial<Record<ParamName, string>> {
  const errors: Partial<Record<ParamName, string>> = {};
  for (const field of fields) {
    const [first, second] = paramsOf(field);
    if (first === undefined || second === undefined) {
      continue;
    }
    const low = (draft[first] ?? "").trim();
    const high = (draft[second] ?? "").trim();
    if (field.type === "NUMBER") {
      for (const [name, value] of [
        [first, low],
        [second, high],
      ] as const) {
        if (value !== "" && !NUMBER_PATTERN.test(value)) {
          errors[name] = "Enter a number such as 12 or 12.5.";
        }
      }
      if (!errors[first] && !errors[second] && low && high && Number(low) > Number(high)) {
        errors[second] = '"At most" is below "At least".';
      }
    } else if (low && high && low > high) {
      errors[second] = '"To" is before "From".';
    }
  }
  return errors;
}

// The panel itself. It is mounted when it opens, so it always starts from what is set.
function FilterPanel({
  fields,
  values,
  onApply,
  onClose,
}: {
  fields: CustomField[];
  values: CustomFilterParams;
  onApply: (values: CustomFilterParams) => void;
  onClose: () => void;
}) {
  const isPhone = useIsPhone();
  useVisibleHeight(isPhone);
  const [draft, setDraft] = useState<CustomFilterParams>(values);
  const [errors, setErrors] = useState<Partial<Record<ParamName, string>>>({});

  function apply() {
    const found = checkDraft(fields, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    // Only the parameters of the fields in use are written: a filter left over in the
    // address for a field that has been archived since goes away here.
    const next: CustomFilterParams = {};
    for (const name of fields.flatMap(paramsOf)) {
      const value = (draft[name] ?? "").trim();
      if (value !== "") {
        next[name] = value;
      }
    }
    onApply(next);
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={cn(
          isPhone ? FULL_SCREEN_DIALOG : "flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-lg",
        )}
      >
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>More filters</DialogTitle>
          <DialogDescription>
            Narrow the list by its custom fields. A record without a value never matches.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-5 overflow-y-auto p-4">
            {fields.map((field) => (
              <FilterControl
                key={field.id}
                field={field}
                draft={draft}
                errors={errors}
                onChange={(name, value) => {
                  setDraft((current) => ({ ...current, [name]: value }));
                }}
              />
            ))}
          </div>
          <div className="bg-background flex flex-wrap items-center justify-between gap-2 border-t p-4 sm:rounded-b-xl">
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-3"
              onClick={() => {
                setDraft({});
                setErrors({});
              }}
            >
              Clear all
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="h-10 px-4">
                Apply filters
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The "More filters" button of a list toolbar. It opens a panel with one control for each
// custom field in use: text contains, a dropdown's option, a number range, a date range.
// The panel is a dialog, and fills the screen on a phone. Nothing is drawn for a record type
// without custom fields.
export function CustomFieldFilterButton({
  fields,
  values,
  onApply,
}: {
  fields: CustomField[];
  values: CustomFilterParams;
  onApply: (values: CustomFilterParams) => void;
}) {
  const [open, setOpen] = useState(false);
  if (fields.length === 0) {
    return null;
  }
  const count = countFiltered(fields, values);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 min-w-0 justify-start px-3 font-normal"
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontal aria-hidden />
        <span className="truncate">More filters{count > 0 ? ` (${String(count)})` : ""}</span>
      </Button>
      {open ? (
        <FilterPanel
          fields={fields}
          values={values}
          onApply={onApply}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type FieldDetail = { path: string; message: string };

// The details of a VALIDATION_FAILED that are about a custom field filter.
function filterProblems(error: ApiError | null): FieldDetail[] {
  if (error?.code !== "VALIDATION_FAILED" || !Array.isArray(error.details)) {
    return [];
  }
  return (error.details as unknown[]).filter(
    (detail): detail is FieldDetail =>
      typeof detail === "object" &&
      detail !== null &&
      "path" in detail &&
      typeof detail.path === "string" &&
      detail.path.startsWith("cf.") &&
      "message" in detail &&
      typeof detail.message === "string",
  );
}

const chipButtonClass =
  "hover:bg-muted focus-visible:ring-ring/50 -mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3";

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li className="bg-card flex max-w-full min-w-0 items-center gap-1 rounded-full border py-1 pr-2 pl-3 text-sm">
      <span className="min-w-0 wrap-anywhere">{label}</span>
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        className={chipButtonClass}
        onClick={onRemove}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </li>
  );
}

// The custom field filters that are set, under the toolbar: one removable chip for each
// field, and "Clear all". When the API refuses a filter (a hand-edited address, a field
// that has been archived since) it says which and offers to remove them; the rest of the
// page keeps working. `fields` is null until the fields are known. `error` is the list's.
export function CustomFieldFilterChips({
  fields,
  values,
  onChange,
  error,
}: {
  fields: CustomField[] | null;
  values: CustomFilterParams;
  onChange: (values: CustomFilterParams) => void;
  error: ApiError | null;
}) {
  const names = Object.keys(values) as ParamName[];
  if (names.length === 0) {
    return null;
  }

  function without(remove: ParamName[]): CustomFilterParams {
    const rest: CustomFilterParams = {};
    for (const [name, value] of Object.entries(values) as [ParamName, string][]) {
      if (!remove.includes(name)) {
        rest[name] = value;
      }
    }
    return rest;
  }

  const known = fields ?? [];
  const chips = known
    .map((field) => ({ field, label: describeFilter(field, values) }))
    .filter((chip): chip is { field: CustomField; label: string } => chip.label !== null);
  // Parameters no field in use can be filtered with: its id is unknown, or the form does
  // not fit its type. They are shown once the fields are known, so they can be removed.
  const usable = new Set<string>(known.flatMap(paramsOf));
  const unknown = fields === null ? [] : names.filter((name) => !usable.has(name));
  const problems = filterProblems(error);
  // The API's own words are about the address ("use cf.<field id>=value"), which helps
  // nobody who did not type it: a problem with a filter of no field in use gets ours.
  const describeProblem = (problem: FieldDetail) => {
    const field = known.find((candidate) => candidate.id === fieldIdOf(problem.path));
    return field && usable.has(problem.path)
      ? `${field.label}: ${problem.message}`
      : "A filter in the address does not belong to a field in use.";
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {problems.length > 0 ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <CircleAlert aria-hidden />
          <AlertDescription>
            <p>The list could not be filtered by its custom fields:</p>
            <ul className="list-disc pl-5">
              {problems.map((problem) => (
                <li key={problem.path} className="wrap-anywhere">
                  {describeProblem(problem)}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="text-foreground mt-2 h-9 px-3"
              onClick={() => {
                onChange(without(problems.map((problem) => problem.path as ParamName)));
              }}
            >
              Remove {problems.length === 1 ? "this filter" : "these filters"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ul aria-label="Custom field filters" className="flex min-w-0 flex-wrap items-center gap-2">
        {chips.map(({ field, label }) => (
          <Chip
            key={field.id}
            label={label}
            onRemove={() => {
              onChange(without(paramsOf(field)));
            }}
          />
        ))}
        {unknown.length > 0 ? (
          <Chip
            label={unknown.length === 1 ? "A filter that is not in use" : "Filters not in use"}
            onRemove={() => {
              onChange(without(unknown));
            }}
          />
        ) : null}
        <li>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-sm"
            onClick={() => {
              onChange({});
            }}
          >
            Clear all
          </Button>
        </li>
      </ul>
    </div>
  );
}
