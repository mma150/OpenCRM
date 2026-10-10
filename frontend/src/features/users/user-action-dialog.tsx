"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CopyLinkField } from "@/components/shared/copy-link-field";
import { FormAlert } from "@/components/shared/form-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch } from "@/store/hooks";

import {
  createPasswordResetLink,
  deactivateUser,
  reactivateUser,
  resendInvite,
} from "./users.slice";
import type { User } from "./users.types";

export type UserAction = "deactivate" | "reactivate" | "resend-invite" | "reset-link";

// The words for each action: the question, what will happen, and what to say afterwards.
const COPY: Record<
  UserAction,
  {
    title: (name: string) => string;
    description: string;
    confirm: string;
    working: string;
    done: (user: User) => string;
    linkTitle?: string;
    linkValidFor?: string;
  }
> = {
  deactivate: {
    title: (name) => `Deactivate ${name}?`,
    description:
      "They are signed out straight away and can no longer sign in. Their account and everything they logged is kept, and you can reactivate them later.",
    confirm: "Deactivate",
    working: "Deactivating...",
    done: (user) => `${user.name} was deactivated.`,
  },
  reactivate: {
    title: (name) => `Reactivate ${name}?`,
    description: "They can sign in again, with the same role and manager as before.",
    confirm: "Reactivate",
    working: "Reactivating...",
    done: (user) => `${user.name} was reactivated.`,
  },
  "resend-invite": {
    title: (name) => `Resend the invite to ${name}?`,
    description:
      "A new invite link is created and the earlier one stops working. The new link is valid for 7 days.",
    confirm: "Resend invite",
    working: "Sending...",
    done: (user) => `A new invite was emailed to ${user.email}.`,
    linkTitle: "New invite link",
    linkValidFor: "7 days",
  },
  "reset-link": {
    title: (name) => `Create a password reset link for ${name}?`,
    description: "The link lets them choose a new password. It works once and is valid for 1 hour.",
    confirm: "Create reset link",
    working: "Creating...",
    done: (user) => `A password reset link was emailed to ${user.email}.`,
    linkTitle: "Password reset link",
    linkValidFor: "1 hour",
  },
};

// Asks before doing one of the four user actions, then reports the result: a toast, or the
// link to copy when the action made a link and outgoing email is off (D-10).
export function UserActionDialog({
  action,
  user,
  onClose,
}: {
  action: UserAction;
  user: User;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const copy = COPY[action];

  // Resolves with the link to show, or null when there is none (or it was emailed).
  async function run(): Promise<string | null> {
    switch (action) {
      case "deactivate":
        await dispatch(deactivateUser(user.id)).unwrap();
        return null;
      case "reactivate":
        await dispatch(reactivateUser(user.id)).unwrap();
        return null;
      case "resend-invite":
        return (await dispatch(resendInvite(user.id)).unwrap()).link;
      case "reset-link":
        return (await dispatch(createPasswordResetLink(user.id)).unwrap()).link;
    }
  }

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      const createdLink = await run();
      if (createdLink) {
        setLink(createdLink);
      } else {
        toast.success(copy.done(user));
        onClose();
      }
    } catch (caught) {
      // LAST_ADMIN, FORBIDDEN and the rest are explained in the dialog, which stays open.
      setError(describeApiError(caught as ApiError));
    } finally {
      setWorking(false);
    }
  }

  if (link) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.linkTitle}</DialogTitle>
            <DialogDescription>
              Outgoing email is off, so copy this link and send it to {user.name}. It is valid for{" "}
              {copy.linkValidFor}.
            </DialogDescription>
          </DialogHeader>
          <CopyLinkField label={copy.linkTitle ?? "Link"} link={link} />
          <DialogFooter>
            <Button type="button" className="h-10 px-4" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !working) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">{copy.title(user.name)}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10 px-4" disabled={working}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant={action === "deactivate" ? "destructive" : "default"}
            className="h-10 px-4"
            disabled={working}
            onClick={(event) => {
              // Keep the dialog open until the request has answered.
              event.preventDefault();
              void confirm();
            }}
          >
            {working ? copy.working : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
