"use client";

import { DeleteRecordDialog, ReassignRecordDialog } from "@/components/shared/record-dialogs";
import { useAppDispatch } from "@/store/hooks";

import { assignCompany, deleteCompany } from "./companies.slice";
import type { Company } from "./companies.types";

// The dialog a company's actions menu can open. The list page and the detail page both keep
// one of these in state and render <CompanyDialogs>.
export type CompanyDialog = { kind: "reassign" | "delete"; company: Company } | null;

// What deleting a company does to its contacts: they stay, without a company. The count is
// of the contacts this user may see; colleagues' contacts lose the link too, so a company
// that shows none still gets the warning in general words.
function deleteDescription(company: Company): string {
  const contacts =
    company.contactCount === 0
      ? "Any contacts linked to it stay, but lose the link."
      : company.contactCount === 1
        ? "Its 1 contact stays, but is no longer linked to a company."
        : `Its ${String(company.contactCount)} contacts stay, but are no longer linked to a company.`;
  return `The company and its timeline are removed for everyone. ${contacts} This cannot be undone.`;
}

// The dialogs of a company: the shared record dialogs, given the company's requests.
export function CompanyDialogs({
  dialog,
  onClose,
  onDeleted,
}: {
  dialog: CompanyDialog;
  onClose: () => void;
  // Lets the detail page leave the deleted company.
  onDeleted?: () => void;
}) {
  const dispatch = useAppDispatch();
  if (!dialog) {
    return null;
  }
  const { company } = dialog;

  switch (dialog.kind) {
    case "reassign":
      return (
        <ReassignRecordDialog
          record={company}
          noun="company"
          onReassign={(ownerId) => dispatch(assignCompany({ id: company.id, ownerId })).unwrap()}
          onClose={onClose}
        />
      );
    case "delete":
      return (
        <DeleteRecordDialog
          name={company.name}
          description={deleteDescription(company)}
          onDelete={() => dispatch(deleteCompany(company.id)).unwrap()}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      );
  }
}
