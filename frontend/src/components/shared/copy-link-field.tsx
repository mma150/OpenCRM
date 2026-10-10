"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// A link the user passes on by hand (an invite or reset link when outgoing email is off, D-10).
// The box selects itself on focus, so the link can still be copied if the clipboard is blocked.
export function CopyLinkField({ label, link }: { label: string; link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        readOnly
        aria-label={label}
        value={link}
        className="h-10 min-w-0 flex-1 font-mono text-xs md:text-xs"
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
      <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void copy()}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
      </Button>
    </div>
  );
}
