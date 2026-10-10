"use client";

import { MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsPhone } from "@/lib/use-is-phone";

import type { RecordRef } from "./timeline.types";
import { TimelineComposer } from "./timeline-composer";

// Keeps `--visible-height` on the page equal to the part of the screen that is not under
// the on-screen keyboard, while the dialog is open. The dialog is that tall, so its Save
// bar sits just above the keyboard instead of behind it.
function useVisibleHeight(active: boolean): void {
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

// Phones only: the wide "Log conversation" button a record page puts under its header,
// and the full-screen dialog it opens. On wider screens it renders nothing, because the
// timeline shows the same form inline. The dialog covers the bottom tab bar.
export function LogConversationButton({
  record,
  recordName,
}: {
  record: RecordRef;
  // Shown under the dialog's title, so it is clear whose timeline is being added to.
  recordName: string;
}) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useVisibleHeight(isPhone && open);

  if (!isPhone) {
    return null;
  }

  return (
    <>
      <Button
        ref={button}
        type="button"
        className="h-12 w-full text-base"
        onClick={() => {
          setOpen(true);
        }}
      >
        <MessageSquarePlus aria-hidden className="size-5" />
        Log conversation
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-0 left-0 flex h-[var(--visible-height,100dvh)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
          // The form puts the cursor in the text box itself.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
          // Closing, saved or not, hands the focus back to the button that opened it.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            button.current?.focus();
          }}
        >
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle className="text-lg">Log conversation</DialogTitle>
            <DialogDescription className="wrap-anywhere">{recordName}</DialogDescription>
          </DialogHeader>
          <TimelineComposer
            record={record}
            layout="sheet"
            autoFocus
            onSaved={() => {
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
