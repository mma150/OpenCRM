"use client";

import { useEffect } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-state";
import { BackLink } from "@/components/shared/record-layout";
import { NoWriteAccess } from "@/components/shared/record-loader";
import { selectAuth } from "@/features/auth/auth.slice";
import { getCompany } from "@/features/companies/companies.api";
import { getContact } from "@/features/contacts/contacts.api";
import { useCustomFieldsForForm } from "@/features/custom-fields/use-custom-fields";
import { openStages, stageOptions } from "@/features/pipeline-stages/stage-labels";
import { usePipelineStages } from "@/features/pipeline-stages/use-pipeline-stages";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import { useReturnTo } from "@/lib/return-to";
import { usePreselectedRecord } from "@/lib/use-preselected-record";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { OpportunityForm } from "./opportunity-form";
import { opportunityAccess } from "./opportunity-labels";
import { OpportunityLoader } from "./opportunity-loader";

// /opportunities/new, and /opportunities/new?companyId=... or ?contactId=... to start linked
// to a company or a contact ("Add opportunity" on their pages).
export function NewOpportunityPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: assignable, status: assignableStatus } = useAppSelector(selectAssignableUsers);
  const { data: stages, status: stagesStatus } = usePipelineStages();
  const returnTo = useReturnTo("/opportunities");
  const customFields = useCustomFieldsForForm("OPPORTUNITY");
  const canWrite = me ? opportunityAccess(me.role).canWrite : false;
  const fromCompany = usePreselectedRecord("companyId", canWrite, getCompany);
  const fromContact = usePreselectedRecord("contactId", canWrite, getContact);

  useEffect(() => {
    if (canWrite) {
      void dispatch(fetchAssignableUsers());
    }
  }, [dispatch, canWrite]);

  if (!me) {
    return null;
  }
  if (!canWrite) {
    return <NoWriteAccess plural="opportunities" backHref="/opportunities" />;
  }

  // Wait for the possible owners and the stages, so the form knows which fields to show.
  // If either cannot be loaded the form still works: the opportunity is then the user's own,
  // in the first stage.
  const ownersReady = assignable !== null || assignableStatus === "failed";
  const stagesReady = stages !== null || stagesStatus === "failed";
  const owners = (assignable ?? []).map((user) => ({ value: user.id, label: user.name }));
  const contact = fromContact.record;
  // A contact brings its company along, unless the address names one itself.
  const company = fromCompany.record ?? contact?.company ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink
        href={returnTo}
        label={
          fromCompany.record
            ? "Back to company"
            : contact
              ? "Back to contact"
              : "Back to opportunities"
        }
      />
      <PageHeader
        title="New opportunity"
        description="Add a deal, what it is worth and who it is with."
      />
      {ownersReady &&
      stagesReady &&
      fromCompany.ready &&
      fromContact.ready &&
      customFields.ready ? (
        <OpportunityForm
          company={company ? { id: company.id, name: company.name } : undefined}
          contact={contact ? { id: contact.id, name: contact.name } : undefined}
          myId={me.id}
          stages={stageOptions(openStages(stages))}
          owners={owners}
          customFields={customFields.fields}
          returnTo={returnTo}
        />
      ) : (
        <PageLoading />
      )}
    </div>
  );
}

// /opportunities/[id]/edit
export function EditOpportunityPage({ id }: { id: string }) {
  const { data: me } = useAppSelector(selectAuth);
  const returnTo = useReturnTo(`/opportunities/${id}`);
  const customFields = useCustomFieldsForForm("OPPORTUNITY");

  if (!me) {
    return null;
  }
  if (!opportunityAccess(me.role).canWrite) {
    return <NoWriteAccess plural="opportunities" backHref="/opportunities" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <OpportunityLoader id={id}>
        {(opportunity) => (
          <>
            <BackLink href={returnTo} label="Back" />
            <PageHeader
              title={`Edit ${opportunity.name}`}
              description="Change the opportunity's details. Its stage is changed on its page or on the board."
            />
            {/* The key remounts the form if a fresher copy of the opportunity arrives. */}
            {customFields.ready ? (
              <OpportunityForm
                key={opportunity.updatedAt}
                opportunity={opportunity}
                myId={me.id}
                customFields={customFields.fields}
                returnTo={returnTo}
              />
            ) : (
              <PageLoading />
            )}
          </>
        )}
      </OpportunityLoader>
    </div>
  );
}
