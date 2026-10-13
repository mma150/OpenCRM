"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { RecordRef } from "@/features/timeline/timeline.types";

import { emailRecordOf } from "./email-record";
import { SendEmailDialog } from "./send-email-dialog";

// The "Send email" action in the header of a record page, and the composer it opens. It is
// the same for a lead, a contact, a company and an opportunity:
//
//   <SendEmailButton record={{ type: "lead", id: lead.id }} recordName={lead.name}
//                    canWrite={access.canWrite} />
//
// `canWrite` false (a Read-only user) renders nothing. A converted or lost lead and a closed
// opportunity still take email. While email is off the button stays: the composer then
// says why nothing can be sent. Nothing is asked of the API until the button is pressed.
export function SendEmailButton({
  record,
  recordName,
  canWrite,
}: {
  record: RecordRef;
  recordName: string;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!canWrite) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 px-4"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Mail aria-hidden />
        Send email
      </Button>
      <SendEmailDialog
        open={open}
        onOpenChange={setOpen}
        record={emailRecordOf(record)}
        recordName={recordName}
      />
    </>
  );
}
