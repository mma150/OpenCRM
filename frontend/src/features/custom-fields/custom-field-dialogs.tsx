"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectControl } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import {
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES,
  customFieldTypeOptions,
  MAX_ACTIVE_CUSTOM_FIELDS,
  MAX_DROPDOWN_OPTIONS,
  MAX_LABEL_LENGTH,
  MAX_OPTION_LENGTH,
  RECORD_TYPE_WORDS,
} from "./custom-field-labels";
import {
  archiveCustomField,
  createCustomField,
  deleteCustomField,
  updateCustomField,
} from "./custom-fields.slice";
import type {
  CustomField,
  CustomFieldRecordType,
  UpdateCustomFieldInput,
} from "./custom-fields.types";

// The dialog the custom fields settings page can open.
export type CustomFieldDialog =
  | { kind: "add"; recordType: CustomFieldRecordType }
  | { kind: "edit" | "archive" | "delete"; field: CustomField }
  | null;

// The API refuses an action that does not apply (a 31st field in use) as VALIDATION_FAILED
// without naming a field. The page then says why in its own words.
export function isNotApplicable(error: ApiError): boolean {
  return error.code === "VALIDATION_FAILED" && !Array.isArray(error.details);
}

export const FIELD_LIMIT_MESSAGE = `A record type can have ${String(MAX_ACTIVE_CUSTOM_FIELDS)} fields in use at most. Archive one first.`;

// The same limits as the API, to save a round trip. The server checks again.
const fieldFormSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Enter a label.")
      .max(MAX_LABEL_LENGTH, `Use ${String(MAX_LABEL_LENGTH)} characters or fewer.`),
    type: z.enum(CUSTOM_FIELD_TYPES),
    // The choices of a dropdown, in order. Each is an object because a field array needs one.
    options: z.array(z.object({ value: z.string().trim() })),
    required: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.type !== "DROPDOWN") {
      return;
    }
    if (values.options.length === 0) {
      context.addIssue({ code: "custom", path: ["options"], message: "Add at least one option." });
    }
    const seen = new Set<string>();
    values.options.forEach((option, index) => {
      const path = ["options", index, "value"];
      const key = option.value.toLowerCase();
      if (option.value === "") {
        context.addIssue({ code: "custom", path, message: "Enter the option, or remove it." });
      } else if (option.value.length > MAX_OPTION_LENGTH) {
        context.addIssue({
          code: "custom",
          path,
          message: `Use ${String(MAX_OPTION_LENGTH)} characters or fewer.`,
        });
      } else if (seen.has(key)) {
        context.addIssue({ code: "custom", path, message: "This option is listed twice." });
      }
      seen.add(key);
    });
  });

type FieldFormValues = z.infer<typeof fieldFormSchema>;

function sameOptions(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((option, index) => option === b[index]);
}

// Only what the Admin actually changed is sent. `options` is always the whole list.
function changedFields(field: CustomField, values: FieldFormValues): UpdateCustomFieldInput {
  const changes: UpdateCustomFieldInput = {};
  if (values.label !== field.label) {
    changes.label = values.label;
  }
  if (values.required !== field.required) {
    changes.required = values.required;
  }
  const options = values.options.map((option) => option.value);
  if (field.type === "DROPDOWN" && !sameOptions(options, field.options)) {
    changes.options = options;
  }
  return changes;
}

// Adds a field to a record type, or edits one. The record type and the type of a field are
// fixed once it exists, so an edit shows the type without a control.
function FieldDialog({
  field,
  recordType,
  onClose,
}: {
  field?: CustomField;
  recordType: CustomFieldRecordType;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FieldFormValues>({
    resolver: zodResolver(fieldFormSchema),
    defaultValues: {
      label: field?.label ?? "",
      type: field?.type ?? "TEXT",
      options: (field?.options ?? []).map((value) => ({ value })),
      required: field?.required ?? false,
    },
  });
  const options = useFieldArray({ control: form.control, name: "options" });
  const type = useWatch({ control: form.control, name: "type" });
  const { errors, isSubmitting } = form.formState;
  const words = RECORD_TYPE_WORDS[recordType];
  // A problem with the list as a whole: none at all, or what the API said about it.
  const optionsError = errors.options?.root?.message ?? errors.options?.message;

  async function onSubmit(values: FieldFormValues) {
    setFormError(null);
    const optionValues = values.options.map((option) => option.value);
    try {
      if (field) {
        const changes = changedFields(field, values);
        if (Object.keys(changes).length > 0) {
          await dispatch(updateCustomField({ id: field.id, changes })).unwrap();
          toast.success(`${values.label} was saved.`);
        }
      } else {
        await dispatch(
          createCustomField({
            recordType,
            label: values.label,
            type: values.type,
            required: values.required,
            ...(values.type === "DROPDOWN" ? { options: optionValues } : {}),
          }),
        ).unwrap();
        toast.success(`${values.label} was added to ${words.plural}.`);
      }
      onClose();
    } catch (caught) {
      const error = caught as ApiError;
      setFormError(
        isNotApplicable(error)
          ? FIELD_LIMIT_MESSAGE
          : applyServerError(error, form.setError, ["label", "type", "options", "required"]),
      );
    }
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle className="pr-8 wrap-anywhere">
              {field ? `Edit ${field.label}` : `Add a field to ${words.plural}`}
            </DialogTitle>
            <DialogDescription>
              {field
                ? "A new label shows everywhere at once. The values on the records stay."
                : `The field is added after the last one. It shows in the ${words.singular} form, on the ${words.singular} page and in the list's filters.`}
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          <FormField control={form.control} name="label" label="Label">
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                maxLength={MAX_LABEL_LENGTH}
                className="h-10"
              />
            )}
          </FormField>
          {field ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Type</span>
              <span>{CUSTOM_FIELD_TYPE_LABELS[field.type]}</span>
              <span className="text-muted-foreground text-xs">
                The type of a field cannot be changed.
              </span>
            </div>
          ) : (
            <FormField control={form.control} name="type" label="Type">
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
                  options={customFieldTypeOptions}
                />
              )}
            </FormField>
          )}

          {type === "DROPDOWN" ? (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Options</legend>
              {options.fields.length === 0 ? (
                <p className="text-muted-foreground text-sm">No options yet.</p>
              ) : null}
              <ol className="flex min-w-0 flex-col gap-2">
                {options.fields.map((option, index) => {
                  const number = String(index + 1);
                  const error = errors.options?.[index]?.value?.message;
                  const errorId = `option-${number}-error`;
                  return (
                    <li key={option.id} className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <Input
                          {...form.register(
                            `options.${String(index)}.value` as `options.${number}.value`,
                          )}
                          aria-label={`Option ${number}`}
                          aria-invalid={error !== undefined}
                          aria-describedby={error ? errorId : undefined}
                          autoComplete="off"
                          maxLength={MAX_OPTION_LENGTH}
                          className="h-10 min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="size-10 shrink-0"
                          aria-label={`Move option ${number} up`}
                          disabled={index === 0}
                          onClick={() => {
                            options.move(index, index - 1);
                          }}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="size-10 shrink-0"
                          aria-label={`Move option ${number} down`}
                          disabled={index === options.fields.length - 1}
                          onClick={() => {
                            options.move(index, index + 1);
                          }}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="size-10 shrink-0"
                          aria-label={`Remove option ${number}`}
                          onClick={() => {
                            options.remove(index);
                          }}
                        >
                          <X aria-hidden />
                        </Button>
                      </div>
                      {error ? (
                        <p id={errorId} role="alert" className="text-destructive text-sm">
                          {error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {optionsError ? (
                <p role="alert" className="text-destructive text-sm">
                  {optionsError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 self-start px-4"
                disabled={options.fields.length >= MAX_DROPDOWN_OPTIONS}
                onClick={() => {
                  options.append({ value: "" });
                }}
              >
                <Plus aria-hidden />
                Add option
              </Button>
              <p className="text-muted-foreground text-xs">
                {field
                  ? "A record that holds an option you remove keeps it until it is changed."
                  : `Up to ${String(MAX_DROPDOWN_OPTIONS)} options.`}
              </p>
            </fieldset>
          ) : null}

          <Controller
            control={form.control}
            name="required"
            render={({ field: control }) => (
              <label className="flex min-w-0 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5 size-4 shrink-0"
                  checked={control.value}
                  onChange={(event) => {
                    control.onChange(event.target.checked);
                  }}
                  onBlur={control.onBlur}
                  ref={control.ref}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">Required</span>
                  <span className="text-muted-foreground text-xs">
                    A new {words.singular} cannot be saved without it. Existing {words.plural} stay
                    as they are.
                  </span>
                </span>
              </label>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : field ? "Save changes" : "Add field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Archiving hides the field and keeps its values, so it only asks once.
function ArchiveFieldDialog({ field, onClose }: { field: CustomField; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function archive() {
    setError(null);
    setSaving(true);
    try {
      await dispatch(archiveCustomField(field.id)).unwrap();
      toast.success(`${field.label} was archived.`);
      onClose();
    } catch (caught) {
      setError(describeApiError(caught as ApiError));
      setSaving(false);
    }
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 wrap-anywhere">Archive {field.label}?</DialogTitle>
          <DialogDescription>
            The field disappears from forms, record pages, filters, imports and exports. Its values
            are kept, and come back when you restore it.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 px-4"
            disabled={saving}
            onClick={() => void archive()}
          >
            {saving ? "Archiving..." : "Archive field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Deleting is permanent and takes the values with it, so the Admin has to tick a box that
// says so before the button works.
function DeleteFieldDialog({ field, onClose }: { field: CustomField; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const words = RECORD_TYPE_WORDS[field.recordType];

  async function remove() {
    setError(null);
    setDeleting(true);
    try {
      await dispatch(deleteCustomField(field)).unwrap();
      toast.success(`${field.label} was deleted.`);
      onClose();
    } catch (caught) {
      setError(describeApiError(caught as ApiError));
      setDeleting(false);
    }
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 wrap-anywhere">
            Delete {field.label} permanently?
          </DialogTitle>
          <DialogDescription>
            This removes the field and the value it holds on every {words.singular}. It cannot be
            undone, and the values cannot be brought back.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <label className="flex min-w-0 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-4 shrink-0"
            checked={understood}
            onChange={(event) => {
              setUnderstood(event.target.checked);
            }}
          />
          <span className="min-w-0 wrap-anywhere">
            I understand that the values of {field.label} are removed from every {words.singular}.
          </span>
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 px-4"
            disabled={!understood || deleting}
            onClick={() => void remove()}
          >
            {deleting ? "Deleting..." : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The dialogs of the custom fields settings page.
export function CustomFieldDialogs({
  dialog,
  onClose,
}: {
  dialog: CustomFieldDialog;
  onClose: () => void;
}) {
  if (!dialog) {
    return null;
  }
  switch (dialog.kind) {
    case "add":
      return <FieldDialog recordType={dialog.recordType} onClose={onClose} />;
    case "edit":
      return (
        <FieldDialog field={dialog.field} recordType={dialog.field.recordType} onClose={onClose} />
      );
    case "archive":
      return <ArchiveFieldDialog field={dialog.field} onClose={onClose} />;
    case "delete":
      return <DeleteFieldDialog field={dialog.field} onClose={onClose} />;
  }
}
