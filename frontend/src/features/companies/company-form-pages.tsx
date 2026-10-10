"use client";

import { useEffect } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-state";
import { BackLink } from "@/components/shared/record-layout";
import { NoWriteAccess } from "@/components/shared/record-loader";
import { selectAuth } from "@/features/auth/auth.slice";
import { useCustomFieldsForForm } from "@/features/custom-fields/use-custom-fields";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import { recordAccess } from "@/lib/record-access";
import { useReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchIndustries, selectIndustries } from "./companies.slice";
import { CompanyForm } from "./company-form";
import { CompanyLoader } from "./company-loader";

// The industries already in use, for the form's suggestions. The form works without them.
function useIndustries(enabled: boolean): string[] {
  const dispatch = useAppDispatch();
  const { data } = useAppSelector(selectIndustries);

  useEffect(() => {
    if (enabled) {
      void dispatch(fetchIndustries());
    }
  }, [dispatch, enabled]);

  return data ?? [];
}

// /companies/new
export function NewCompanyPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: assignable, status: assignableStatus } = useAppSelector(selectAssignableUsers);
  const returnTo = useReturnTo("/companies");
  const customFields = useCustomFieldsForForm("COMPANY");
  const canWrite = me ? recordAccess(me.role).canWrite : false;
  const industries = useIndustries(canWrite);

  useEffect(() => {
    if (canWrite) {
      void dispatch(fetchAssignableUsers());
    }
  }, [dispatch, canWrite]);

  if (!me) {
    return null;
  }
  if (!canWrite) {
    return <NoWriteAccess plural="companies" backHref="/companies" />;
  }

  // Wait for the possible owners, so the form knows whether to show the Owner field.
  // If they cannot be loaded the form still works: the company is then the user's own.
  const ownersReady = assignable !== null || assignableStatus === "failed";
  const owners = (assignable ?? []).map((user) => ({ value: user.id, label: user.name }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink href={returnTo} label="Back to companies" />
      <PageHeader title="New company" description="Add an organisation and who looks after it." />
      {ownersReady && customFields.ready ? (
        <CompanyForm
          myId={me.id}
          owners={owners}
          industries={industries}
          customFields={customFields.fields}
          returnTo={returnTo}
        />
      ) : (
        <PageLoading />
      )}
    </div>
  );
}

// /companies/[id]/edit
export function EditCompanyPage({ id }: { id: string }) {
  const { data: me } = useAppSelector(selectAuth);
  const returnTo = useReturnTo(`/companies/${id}`);
  const customFields = useCustomFieldsForForm("COMPANY");
  const canWrite = me ? recordAccess(me.role).canWrite : false;
  const industries = useIndustries(canWrite);

  if (!me) {
    return null;
  }
  if (!canWrite) {
    return <NoWriteAccess plural="companies" backHref="/companies" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <CompanyLoader id={id}>
        {(company) => (
          <>
            <BackLink href={returnTo} label="Back" />
            <PageHeader
              title={`Edit ${company.name}`}
              description="Change the company's details."
            />
            {/* The key remounts the form if a fresher copy of the company arrives. */}
            {customFields.ready ? (
              <CompanyForm
                key={company.updatedAt}
                company={company}
                myId={me.id}
                industries={industries}
                customFields={customFields.fields}
                returnTo={returnTo}
              />
            ) : (
              <PageLoading />
            )}
          </>
        )}
      </CompanyLoader>
    </div>
  );
}
