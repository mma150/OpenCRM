"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectControl, type SelectOption } from "@/components/shared/select-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";

import { type ChosenFile, fileProblem } from "./import-file-step";
import { IMPORT_TYPE_WORDS, rowCount } from "./import-labels";
import { runImport } from "./imports.api";
import type {
  ImportField,
  ImportInput,
  ImportPreview,
  ImportResult,
  ImportType,
} from "./imports.types";

// The select needs a value for "Don't import"; the form sees it as "".
const SKIP = "__skip__";

// `columns` holds, for each column of the file in order, the key of the field it is
// imported into, or "" when it is not imported. (A column's own name cannot be a key of
// the form: it may hold a dot.)
const mappingFormSchema = z
  .object({
    columns: z.array(z.string()),
    ownerId: z.string(),
    skipDuplicates: z.boolean(),
    createCompanies: z.boolean(),
  })
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.columns.forEach((key, index) => {
      if (key !== "" && seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["columns", index],
          message: "This field is already taken by another column.",
        });
      }
      seen.add(key);
    });
  });

type MappingFormValues = z.infer<typeof mappingFormSchema>;

type FieldDetail = { path: string; message: string };

function isFieldDetail(value: unknown): value is FieldDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

// Up to three of the column's first values, to recognise it by.
function samplesOf(preview: ImportPreview, index: number): string[] {
  return preview.sampleRows
    .map((row) => row[index] ?? "")
    .filter((cell) => cell !== "")
    .slice(0, 3);
}

function Checkbox({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex min-w-0 items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="accent-primary mt-0.5 size-4 shrink-0"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}

// Step 2 of an import: which field each column of the file goes into, and how the import
// behaves. The API suggested a field for the columns it recognised; the rest start as
// "Don't import". A field can be taken by one column only, and every required field needs
// one before the import can start.
export function ImportMappingStep({
  type,
  file,
  preview,
  fields,
  myId,
  owners,
  onBack,
  onFileProblem,
  onImported,
}: {
  type: ImportType;
  file: ChosenFile;
  preview: ImportPreview;
  fields: ImportField[];
  myId: string;
  // The people the user may give the records to; the Owner choice shows when there are several.
  owners: SelectOption[];
  onBack: () => void;
  // The API refused the file itself: back to step 1 with what it said.
  onFileProblem: (message: string) => void;
  onImported: (result: ImportResult) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const words = IMPORT_TYPE_WORDS[type];
  const showOwner = owners.length > 1;
  const known = new Set(fields.map((field) => field.key));
  const form = useForm<MappingFormValues>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: {
      // A suggestion for a field that is not offered (it was archived a moment ago) is dropped.
      columns: preview.headers.map((header) => {
        const suggested = preview.suggestedMapping[header] ?? "";
        return known.has(suggested) ? suggested : "";
      }),
      ownerId: myId,
      skipDuplicates: true,
      createCompanies: true,
    },
  });
  const { control } = form;
  const columns = useWatch({ control, name: "columns" });
  const submitting = form.formState.isSubmitting;

  const mappedCount = columns.filter((key) => key !== "").length;
  const missing = fields.filter((field) => field.required && !columns.includes(field.key));

  // Puts what the API refused where it belongs: on a column, on the owner, above the form,
  // or (a problem with the file itself) back on step 1.
  function placeServerError(error: ApiError) {
    const aboutFile = fileProblem(error);
    if (aboutFile) {
      onFileProblem(aboutFile);
      return;
    }
    if (error.code !== "VALIDATION_FAILED" || !Array.isArray(error.details)) {
      setFormError(describeApiError(error));
      return;
    }
    const general: string[] = [];
    for (const detail of error.details as unknown[]) {
      if (!isFieldDetail(detail)) {
        continue;
      }
      const index = detail.path.startsWith("mapping.")
        ? preview.headers.indexOf(detail.path.slice("mapping.".length))
        : -1;
      if (index !== -1) {
        form.setError(`columns.${String(index)}` as `columns.${number}`, {
          type: "server",
          message: detail.message,
        });
      } else if (detail.path === "ownerId") {
        form.setError("ownerId", { type: "server", message: detail.message });
      } else {
        // A required field without a column ("mapping"), or anything this form has no place for.
        general.push(detail.message);
      }
    }
    setFormError(general.length > 0 ? general.join(" ") : null);
  }

  async function onSubmit(values: MappingFormValues) {
    setFormError(null);
    const input: ImportInput = {
      type,
      csv: file.csv,
      mapping: Object.fromEntries(
        preview.headers.map((header, index) => [header, values.columns[index] || null]),
      ),
      skipDuplicates: values.skipDuplicates,
      ...(showOwner ? { ownerId: values.ownerId } : {}),
      ...(type === "CONTACT" ? { createCompanies: values.createCompanies } : {}),
    };
    try {
      onImported(await runImport(input));
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      placeServerError(error as ApiError);
    }
  }

  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-6"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Match the columns</h2>
              <p className="text-muted-foreground text-sm wrap-anywhere">
                {file.name} · {rowCount(preview.rowCount)}. Choose the field each column goes into.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Badge variant="secondary">{String(mappedCount)} mapped</Badge>
              <Badge variant="outline">{String(columns.length - mappedCount)} not imported</Badge>
            </div>
          </div>

          <FormAlert message={formError} />
          {missing.length > 0 ? (
            <Alert
              role="status"
              className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
            >
              <CircleAlert aria-hidden />
              <AlertDescription className="text-foreground">
                <p>
                  {missing.length === 1
                    ? "A required field has no column yet:"
                    : "These required fields have no column yet:"}
                </p>
                <ul aria-label="Required fields without a column" className="list-disc pl-5">
                  {missing.map((field) => (
                    <li key={field.key} className="font-medium wrap-anywhere">
                      {field.label}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_minmax(0,18rem)] gap-4 border-b pb-2 text-xs font-medium tracking-wide uppercase md:grid">
            <span>Column in your file</span>
            <span>Field in OpenCRM</span>
          </div>
          <ol aria-label="Columns" className="flex min-w-0 flex-col gap-3 md:gap-0 md:divide-y">
            {preview.headers.map((header, index) => {
              const samples = samplesOf(preview, index);
              const selectId = `column-${String(index)}`;
              const errorId = `${selectId}-error`;
              return (
                <li
                  // A file never has two columns with one name: the API refuses it.
                  key={header}
                  className="grid min-w-0 grid-cols-1 gap-3 max-md:rounded-lg max-md:border max-md:p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-center md:gap-4 md:py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium wrap-anywhere">{header}</p>
                    <p className="text-muted-foreground text-xs wrap-anywhere">
                      {samples.length > 0
                        ? `e.g. ${samples.join(" · ")}`
                        : "No values in the first rows"}
                    </p>
                  </div>
                  <Controller
                    control={control}
                    name={`columns.${String(index)}` as `columns.${number}`}
                    render={({ field, fieldState }) => (
                      <div className="flex min-w-0 flex-col gap-1">
                        <label
                          htmlFor={selectId}
                          className="text-muted-foreground text-xs md:sr-only"
                        >
                          Field for {header}
                        </label>
                        <Select
                          value={field.value === "" ? SKIP : field.value}
                          onValueChange={(next) => {
                            field.onChange(next === SKIP ? "" : next);
                          }}
                        >
                          <SelectTrigger
                            id={selectId}
                            aria-invalid={fieldState.invalid}
                            aria-describedby={fieldState.invalid ? errorId : undefined}
                            className="w-full min-w-0 data-[size=default]:h-10"
                          >
                            <span className="truncate">
                              <SelectValue />
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP}>Don&apos;t import</SelectItem>
                            {fields.map((option) => (
                              <SelectItem
                                key={option.key}
                                value={option.key}
                                // A field goes to one column only.
                                disabled={
                                  option.key !== field.value && columns.includes(option.key)
                                }
                              >
                                {option.label}
                                {option.required ? " (required)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.error?.message ? (
                          <p id={errorId} role="alert" className="text-destructive text-sm">
                            {fieldState.error.message}
                          </p>
                        ) : null}
                      </div>
                    )}
                  />
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <h2 className="text-base font-semibold">Options</h2>
          {showOwner ? (
            <div className="max-w-sm">
              <FormField
                control={control}
                name="ownerId"
                label="Owner"
                description={`Who the imported ${words.plural} belong to.`}
              >
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
                    options={owners}
                  />
                )}
              </FormField>
            </div>
          ) : null}
          <Controller
            control={control}
            name="skipDuplicates"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
                title={`Skip rows whose ${words.duplicateBy} already exists`}
                description={`A row is left out when a ${words.singular} you can see, or an earlier row of the file, has the same ${words.duplicateBy}. Skipped rows are counted in the results.`}
              />
            )}
          />
          {type === "CONTACT" ? (
            <Controller
              control={control}
              name="createCompanies"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onChange={field.onChange}
                  title="Create companies that do not exist yet"
                  description="A contact is linked to the company with the name in its row. When there is none, the company is created. Without this, such a row fails."
                />
              )}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={submitting}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <Button type="submit" className="h-10 px-4" disabled={submitting || missing.length > 0}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Importing..." : `Import ${rowCount(preview.rowCount)}`}
        </Button>
      </div>
    </form>
  );
}
