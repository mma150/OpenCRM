"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { addRecipients, MAX_RECIPIENTS } from "./recipients";

// The "To" and "Cc" boxes of the composer: each address is a chip with a remove button, and
// a text box behind them takes the next one. Enter, a comma, a semicolon or leaving the box
// adds what was typed; Backspace in the empty box removes the last chip. An address that is
// not valid stays in the box with a message, so nothing typed is lost.
//
// `text` (what is typed and not yet an address) is the caller's, so the form can refuse to
// send while something unfinished is still in the box.
export function RecipientsInput({
  id,
  value,
  onChange,
  text,
  onTextChange,
  onBlur,
  names = {},
  max = MAX_RECIPIENTS,
  invalid,
  describedBy,
  placeholder,
  className,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  text: string;
  onTextChange: (text: string) => void;
  onBlur?: () => void;
  // The name that belongs to an address, when it is known: shown on its chip.
  names?: Record<string, string>;
  max?: number;
  invalid: boolean;
  describedBy: string | undefined;
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = `${id}-problem`;

  function commit(typed: string) {
    const result = addRecipients(value, typed, max);
    if (result.value.length !== value.length) {
      onChange(result.value);
    }
    onTextChange(result.rest);
    setProblem(result.problem);
  }

  function remove(address: string) {
    onChange(value.filter((existing) => existing !== address));
    setProblem(null);
    input.current?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* A click anywhere in the box puts the cursor in the text box, as in a mail program. */}
      <div
        className={cn(
          "border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex min-h-10 min-w-0 cursor-text flex-wrap items-center gap-1 rounded-lg border bg-transparent p-1 focus-within:ring-3",
          (invalid || problem) && "border-destructive ring-destructive/20 ring-3",
          className,
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            input.current?.focus();
          }
        }}
      >
        {value.map((address) => (
          <span
            key={address}
            className="bg-muted flex max-w-full min-w-0 items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm"
          >
            <span className="min-w-0 truncate">
              {names[address] ? (
                <>
                  <span className="font-medium">{names[address]}</span>{" "}
                  <span className="text-muted-foreground">{address}</span>
                </>
              ) : (
                address
              )}
            </span>
            <button
              type="button"
              aria-label={`Remove ${address}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-7 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-3"
              onClick={() => {
                remove(address);
              }}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={text}
          placeholder={value.length === 0 ? placeholder : undefined}
          aria-invalid={invalid || problem !== null}
          aria-describedby={
            [problem ? problemId : null, describedBy].filter(Boolean).join(" ") || undefined
          }
          className="placeholder:text-muted-foreground h-8 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none md:text-sm"
          onChange={(event) => {
            onTextChange(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === ";") {
              // Enter must not send the email while an address is being typed.
              event.preventDefault();
              commit(text);
            } else if (event.key === "Backspace" && text === "" && value.length > 0) {
              onChange(value.slice(0, -1));
              setProblem(null);
            }
          }}
          onPaste={(event) => {
            // Several addresses copied from elsewhere become chips at once.
            const pasted = event.clipboardData.getData("text");
            if (/[,;\s]/.test(pasted.trim())) {
              event.preventDefault();
              commit(`${text} ${pasted}`);
            }
          }}
          onBlur={() => {
            if (text.trim() !== "") {
              commit(text);
            }
            onBlur?.();
          }}
        />
      </div>
      {problem ? (
        <p id={problemId} role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
