"use client";

import { DeleteRecordDialog, ReassignRecordDialog } from "@/components/shared/record-dialogs";
import { useAppDispatch } from "@/store/hooks";

import { assignContact, deleteContact } from "./contacts.slice";
import type { Contact } from "./contacts.types";

// The dialog a contact's actions menu can open. The list page and the detail page both keep
// one of these in state and render <ContactDialogs>.
export type ContactDialog = { kind: "reassign" | "delete"; contact: Contact } | null;

// The dialogs of a contact: the shared record dialogs, given the contact's requests.
export function ContactDialogs({
  dialog,
  onClose,
  onDeleted,
}: {
  dialog: ContactDialog;
  onClose: () => void;
  // Lets the detail page leave the deleted contact.
  onDeleted?: () => void;
}) {
  const dispatch = useAppDispatch();
  if (!dialog) {
    return null;
  }
  const { contact } = dialog;

  switch (dialog.kind) {
    case "reassign":
      return (
        <ReassignRecordDialog
          record={contact}
          noun="contact"
          onReassign={(ownerId) => dispatch(assignContact({ id: contact.id, ownerId })).unwrap()}
          onClose={onClose}
        />
      );
    case "delete":
      return (
        <DeleteRecordDialog
          name={contact.name}
          description="The contact and its timeline are removed for everyone. This cannot be undone."
          onDelete={() => dispatch(deleteContact(contact.id)).unwrap()}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      );
  }
}
