"use client";

import { useSyncExternalStore } from "react";

// Below Tailwind's `md` breakpoint: the widths that get the bottom tab bar.
const QUERY = "(width < 48rem)";

// `matchMedia` is missing where there is no real screen (jsdom, in the tests); that
// counts as a wide one.
function media(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const list = media();
  list?.addEventListener("change", onChange);
  return () => {
    list?.removeEventListener("change", onChange);
  };
}

// True on a phone-sized screen. Use it only where a phone needs a different component
// (a full-screen dialog instead of an inline form); for layout, use the `md:` classes.
// It is false while the server renders, so a phone-only component appears after hydration.
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  );
}
