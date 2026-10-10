"use client";

import { useEffect } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-state";
import { BackLink } from "@/components/shared/record-layout";
import { NoWriteAccess } from "@/components/shared/record-loader";
import { selectAuth } from "@/features/auth/auth.slice";
import { getCompany } from "@/features/companies/companies.api";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import { recordAccess } from "@/lib/record-access";
import { useReturnTo } from "@/lib/return-to";
import { usePreselectedRecord } from "@/lib/use-preselected-record";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { ContactForm } from "./contact-form";
import { ContactLoader } from "./contact-loader";

// /contacts/new, and /contacts/new?companyId=... to start in a company.
export function NewContactPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: assignable, status: assignableStatus } = useAppSelector(selectAssignableUsers);
  const returnTo = useReturnTo("/contacts");
  const canWrite = me ? recordAccess(me.role).canWrite : false;
  // The company named by `?companyId=` (the "Add contact" button on a company's page).
  const preselected = usePreselectedRecord("companyId", canWrite, getCompany);
  const company = preselected.record
    ? { id: preselected.record.id, name: preselected.record.name }
    : undefined;

  useEffect(() => {
    if (canWrite) {
      void dispatch(fetchAssignableUsers());
    }
  }, [dispatch, canWrite]);

  if (!me) {
    return null;
  }
  if (!canWrite) {
    return <NoWriteAccess plural="contacts" backHref="/contacts" />;
  }

  // Wait for the possible owners, so the form knows whether to show the Owner field.
  // If they cannot be loaded the form still works: the contact is then the user's own.
  const ownersReady = assignable !== null || assignableStatus === "failed";
  const owners = (assignable ?? []).map((user) => ({ value: user.id, label: user.name }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink href={returnTo} label={company ? "Back to company" : "Back to contacts"} />
      <PageHeader title="New contact" description="Add a person and the company they work for." />
      {ownersReady && preselected.ready ? (
        <ContactForm company={company} myId={me.id} owners={owners} returnTo={returnTo} />
      ) : (
        <PageLoading />
      )}
    </div>
  );
}

// /contacts/[id]/edit
export function EditContactPage({ id }: { id: string }) {
  const { data: me } = useAppSelector(selectAuth);
  const returnTo = useReturnTo(`/contacts/${id}`);

  if (!me) {
    return null;
  }
  if (!recordAccess(me.role).canWrite) {
    return <NoWriteAccess plural="contacts" backHref="/contacts" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <ContactLoader id={id}>
        {(contact) => (
          <>
            <BackLink href={returnTo} label="Back" />
            <PageHeader
              title={`Edit ${contact.name}`}
              description="Change the contact's details."
            />
            {/* The key remounts the form if a fresher copy of the contact arrives. */}
            <ContactForm
              key={contact.updatedAt}
              contact={contact}
              myId={me.id}
              returnTo={returnTo}
            />
          </>
        )}
      </ContactLoader>
    </div>
  );
}
