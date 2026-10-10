import { cn } from "@/lib/utils";

export type Segment<Value extends string> = { value: Value; label: string };

// A short row of choices where exactly one is on: the filter above a timeline, the two
// modes of a form, the sections of a record page on a phone. Each choice is a button
// that says whether it is pressed, and the row never scrolls sideways: on a narrow
// screen the choices share its width.
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  // What the choice is about, for screen readers: "Filter timeline".
  label: string;
  value: Value;
  options: readonly Segment<Value>[];
  onChange: (value: Value) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("bg-muted flex min-w-0 gap-1 rounded-lg p-1", className)}
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              "focus-visible:ring-ring/50 h-9 min-w-0 flex-auto truncate rounded-md border border-transparent px-2 text-sm font-medium outline-none focus-visible:ring-3 sm:px-3 md:h-8",
              pressed
                ? "bg-background text-foreground border-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
