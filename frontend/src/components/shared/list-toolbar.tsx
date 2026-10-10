"use client";

import { Search } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SelectOption } from "./select-control";

// The select needs a value for "no filter"; the list sees it as "".
const ALL = "all";

export type ListFilter = {
  // The word before the value on the control, and its name for screen readers: "Status".
  label: string;
  // The option that switches the filter off: "All".
  allLabel: string;
  // "" when the filter is off.
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

export type ListSort = {
  // One value per choice, such as "createdAt:desc".
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

function ToolbarSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="w-full min-w-0 data-[size=default]:h-10 sm:w-auto sm:max-w-60"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-muted-foreground">{label}:</span>
          <span className="truncate">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The search box. It keeps what is being typed and reports it once typing has paused,
// so a list is not reloaded on every key. `value` is what the list currently uses.
function SearchBox({
  value,
  placeholder,
  maxLength,
  delayMs,
  onChange,
}: {
  value: string;
  placeholder: string;
  maxLength: number | undefined;
  delayMs: number;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [reported, setReported] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);

  // When the list's value changes from outside (Clear filters, Back), show it in the box.
  // A value this box reported itself is not copied back, so it never overwrites newer typing.
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value !== reported) {
      setReported(value);
      setText(value);
    }
  }

  useEffect(() => {
    const next = text.trim();
    if (next === reported) {
      return;
    }
    const timer = setTimeout(() => {
      setReported(next);
      onChange(next);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [text, reported, delayMs, onChange]);

  return (
    <div className="relative min-w-0 xl:max-w-xs xl:flex-1">
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        maxLength={maxLength}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className="h-10 pl-9"
      />
    </div>
  );
}

// The row above every list: a debounced search box, filter selects and the sort order.
// Phones get the search box on its own line and the selects two to a row, so nothing
// scrolls sideways; from `xl` everything sits on one line. A list with nothing to search
// by text (the activity feed) leaves `search` out and gets the selects alone.
export function ListToolbar({
  search,
  filters = [],
  extra,
  sort,
  searchDelayMs = 300,
}: {
  // `maxLength` is the longest search text the API accepts.
  search?: {
    value: string;
    placeholder: string;
    maxLength?: number;
    onChange: (value: string) => void;
  };
  filters?: ListFilter[];
  // A filter that is not a select (the company picker above the contacts). It comes first.
  extra?: ReactNode;
  sort?: ListSort;
  searchDelayMs?: number;
}) {
  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
      {search ? (
        <SearchBox
          value={search.value}
          placeholder={search.placeholder}
          maxLength={search.maxLength}
          delayMs={searchDelayMs}
          onChange={search.onChange}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {extra}
        {filters.map((filter) => (
          <ToolbarSelect
            key={filter.label}
            label={filter.label}
            value={filter.value || ALL}
            options={[{ value: ALL, label: filter.allLabel }, ...filter.options]}
            onChange={(value) => {
              filter.onChange(value === ALL ? "" : value);
            }}
          />
        ))}
        {sort ? (
          <ToolbarSelect
            label="Sort"
            value={sort.value}
            options={sort.options}
            onChange={sort.onChange}
          />
        ) : null}
      </div>
    </div>
  );
}
