"use client";

import { Braces } from "lucide-react";
import { type FocusEvent, type SyntheticEvent, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchEmailPlaceholders, selectEmailPlaceholders } from "./email-templates.slice";
import type { EmailPlaceholder } from "./email-templates.types";
import { insertAtCursor } from "./insert-at-cursor";

// The two boxes a placeholder can go into.
export type PlaceholderField = "subject" | "body";

type TextBox = HTMLInputElement | HTMLTextAreaElement;

// What react-hook-form hands a control, as far as this hook needs it.
type FormControl = { ref: (element: TextBox | null) => void; onBlur: () => void };

// Remembers which of the subject and the body had the cursor last, and where, so that a
// placeholder picked from the menu lands there. The template dialog and the email composer
// both use it:
//
//   const inserter = usePlaceholderInserter({
//     getValue: (field) => form.getValues(field),
//     setValue: (field, text) => form.setValue(field, text, { shouldDirty: true }),
//   });
//   <Input {...field} {...inserter.bind("subject", field)} />
//   <Textarea {...field} {...inserter.bind("body", field)} />
//   <PlaceholderMenu onInsert={inserter.insert} onClosed={inserter.restoreFocus} />
export function usePlaceholderInserter({
  getValue,
  setValue,
}: {
  getValue: (field: PlaceholderField) => string;
  setValue: (field: PlaceholderField, text: string) => void;
}) {
  const boxes = useRef<Record<PlaceholderField, TextBox | null>>({ subject: null, body: null });
  // Nothing focused yet: a placeholder goes to the end of the body.
  const last = useRef<{ field: PlaceholderField; start: number | null; end: number | null }>({
    field: "body",
    start: null,
    end: null,
  });
  // Where the cursor goes once the new text is in the box.
  const pending = useRef<{ field: PlaceholderField; caret: number } | null>(null);

  function remember(field: PlaceholderField, box: TextBox) {
    last.current = { field, start: box.selectionStart, end: box.selectionEnd };
  }

  // The props that make a box a target. They go after the form's own (`{...field}`), whose
  // `ref` and `onBlur` they keep calling.
  function bind(field: PlaceholderField, control: FormControl) {
    return {
      ref: (element: TextBox | null) => {
        boxes.current[field] = element;
        control.ref(element);
      },
      onSelect: (event: SyntheticEvent<TextBox>) => {
        remember(field, event.currentTarget);
      },
      onFocus: (event: FocusEvent<TextBox>) => {
        remember(field, event.currentTarget);
      },
      // Opening the menu takes the focus away; the box still knows its selection then.
      onBlur: (event: FocusEvent<TextBox>) => {
        remember(field, event.currentTarget);
        control.onBlur();
      },
    };
  }

  function insert(token: string) {
    const { field, start, end } = last.current;
    const text = getValue(field);
    const result = insertAtCursor(text, start ?? text.length, end ?? start ?? text.length, token);
    setValue(field, result.text);
    last.current = { field, start: result.caret, end: result.caret };
    pending.current = { field, caret: result.caret };
  }

  // Puts the cursor behind what was just inserted. True when it did, so the menu knows not
  // to hand the focus back to its own button.
  function restoreFocus(): boolean {
    const target = pending.current;
    pending.current = null;
    const box = target ? boxes.current[target.field] : null;
    if (!target || !box) {
      return false;
    }
    box.focus();
    box.setSelectionRange(target.caret, target.caret);
    return true;
  }

  return { bind, insert, restoreFocus };
}

// The "Insert placeholder" button and its menu: every placeholder with what it stands for.
// It loads the list itself (GET /email-templates/placeholders, once).
export function PlaceholderMenu({
  onInsert,
  onClosed,
  include,
}: {
  onInsert: (token: string) => void;
  // Called when the menu has closed. Returns true when it moved the focus itself.
  onClosed: () => boolean;
  // Leaves some placeholders out: the composer hides the quote ones on a plain email.
  include?: (placeholder: EmailPlaceholder) => boolean;
}) {
  const dispatch = useAppDispatch();
  const { data, status } = useAppSelector(selectEmailPlaceholders);

  useEffect(() => {
    void dispatch(fetchEmailPlaceholders());
  }, [dispatch]);

  if (status === "failed" && data === null) {
    return (
      <p className="text-muted-foreground text-xs">
        The list of placeholders could not be loaded. You can still type one, such as{" "}
        <code className="font-mono">{"{{contact.firstName}}"}</code>.
      </p>
    );
  }

  const placeholders = (data ?? []).filter((placeholder) => include?.(placeholder) ?? true);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 self-start px-3"
          disabled={data === null}
        >
          <Braces aria-hidden />
          Insert placeholder
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => {
          if (onClosed()) {
            event.preventDefault();
          }
        }}
      >
        {placeholders.map((placeholder) => (
          <DropdownMenuItem
            key={placeholder.key}
            className="flex-col items-start gap-0.5"
            onSelect={() => {
              onInsert(placeholder.token);
            }}
          >
            <span className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-medium">{placeholder.label}</span>
              <code className="text-muted-foreground font-mono text-xs">{placeholder.token}</code>
            </span>
            <span className="text-muted-foreground text-xs">{placeholder.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
