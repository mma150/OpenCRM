"use client";

import { useEffect } from "react";

// Keeps `--visible-height` on the page equal to the part of the screen that is not under
// the on-screen keyboard, while a full-screen dialog is open. The dialog is that tall
// (`h-[var(--visible-height,100dvh)]`), so its Save bar sits just above the keyboard
// instead of behind it.
export function useVisibleHeight(active: boolean): void {
  useEffect(() => {
    // `visualViewport` is missing in old browsers; the dialog then falls back to 100dvh.
    const viewport = (window as Partial<Window>).visualViewport;
    if (!active || !viewport) {
      return;
    }
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--visible-height", `${String(viewport.height)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      root.style.removeProperty("--visible-height");
    };
  }, [active]);
}

// The classes that make a DialogContent fill a phone screen: a header, a scrolling middle
// and a bar at the bottom go inside it as a column. It covers the bottom tab bar.
export const FULL_SCREEN_DIALOG =
  "top-0 left-0 flex h-[var(--visible-height,100dvh)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none";
