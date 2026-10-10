"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

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
import { updateUser } from "./users.slice";
import type { UpdateUserInput, User } from "./users.types";

// Only what the Admin actually changed is sent, so an untouched email or role is never
// re-validated by the server (an unchanged last Admin stays editable, for example).
function changedFields(user: User, values: UserFormValues): UpdateUserInput {
  const changes: UpdateUserInput = {};
  if (values.name !== user.name) {
    changes.name = values.name;
  }
  if (values.email !== user.email) {
    changes.email = values.email;
  }
  if (values.role !== user.role) {
    changes.role = values.role;
  }
  // The server clears the manager itself when the role stops being Sales Rep.
  if (values.role === "SALES_REP" && managerIdOf(values) !== user.managerId) {
    changes.managerId = managerIdOf(values);
  }
  return changes;
}

export function EditUserDialog({
  user,
  users,
  onClose,
}: {
  user: User;
  users: User[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: user.name,
      email: user.email,
      role: user.role,
      managerId: user.managerId ?? NO_MANAGER,
    },
  });
  const role = useWatch({ control: form.control, name: "role" });
  const managers = managerOptions(users, user.manager).filter((option) => option.value !== user.id);

  async function onSubmit(values: UserFormValues) {
    setFormError(null);
    const changes = changedFields(user, values);
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    try {
      const result = await dispatch(updateUser({ id: user.id, changes })).unwrap();
      const count = result.reassignedReports;
      toast.success(
        count > 0
          ? `Changes saved. ${String(count)} sales ${count === 1 ? "rep no longer has" : "reps no longer have"} a manager.`
          : "Changes saved.",
      );
      onClose();
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
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Change the name, email, role or manager.</DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          <UserFormFields control={form.control} role={role} managers={managers} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
