"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { safeNextPath } from "./safe-next";

// A form page (New lead, Edit lead) goes back to where the user came from when they cancel
// or save. The page that links to the form says where that is with `?from=`.

// The address of the current page with its query string, to pass as `from`.
export function useCurrentUrl(): string {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function withReturnTo(href: string, from: string): string {
  return `${href}?from=${encodeURIComponent(from)}`;
}

// Where to go back to: `?from=` when it is a path inside this app, otherwise `fallback`.
// `from` comes from the address bar, so it is checked the way `?next=` is.
export function useReturnTo(fallback: string): string {
  const from = useSearchParams().get("from");
  return from ? safeNextPath(from) : fallback;
}
