"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { CopyLinkField } from "@/components/shared/copy-link-field";
import { FormAlert } from "@/components/shared/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import {
  managerIdOf,
  managerOptions,
  NO_MANAGER,
  USER_FORM_FIELDS,
  UserFormFields,
  userFormSchema,
  type UserFormValues,
} from "./user-form";
import { inviteUser } from "./users.slice";
import type { InviteUserResult, User } from "./users.types";

const emptyForm: UserFormValues = { name: "", email: "", role: "SALES_REP", managerId: NO_MANAGER };

// Invite by name, email and role (D-09). The person sets their own password from the link.
// When outgoing email is off the link is shown here for the Admin to pass on (D-10).
export function InviteUserDialog({ users, onClose }: { users: User[]; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteUserResult | null>(null);
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: emptyForm,
  });
  const role = useWatch({ control: form.control, name: "role" });

  async function onSubmit(values: UserFormValues) {
    setFormError(null);
    try {
      const managerId = managerIdOf(values);
      const invited = await dispatch(
        inviteUser({
          name: values.name,
          email: values.email,
          role: values.role,
          ...(managerId ? { managerId } : {}),
        }),
      ).unwrap();
      setResult(invited);
    } catch (error) {
      setFormError(applyServerError(error as ApiError, form.setError, USER_FORM_FIELDS));
    }
  }

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
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite created</DialogTitle>
              <DialogDescription>
                {result.invite.link
                  ? `Outgoing email is off, so copy this link and send it to ${result.user.name}. It is valid for 7 days.`
                  : `We emailed an invite link to ${result.user.email}. It is valid for 7 days.`}
              </DialogDescription>
            </DialogHeader>
            {result.invite.link ? (
              <CopyLinkField label="Invite link" link={result.invite.link} />
            ) : (
              <p role="status" className="flex items-center gap-2 text-sm">
                <CircleCheck aria-hidden className="size-4 shrink-0 text-emerald-600" />
                Invite sent.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                onClick={() => {
                  form.reset(emptyForm);
                  setResult(null);
                }}
              >
                Invite another
              </Button>
              <Button type="button" className="h-10 px-4" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          >
            <DialogHeader>
              <DialogTitle>Invite user</DialogTitle>
              <DialogDescription>
                They get a link to set their own password. The link is valid for 7 days.
              </DialogDescription>
            </DialogHeader>
            <FormAlert message={formError} />
            <UserFormFields control={form.control} role={role} managers={managerOptions(users)} />
            <DialogFooter>
              <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Inviting..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
