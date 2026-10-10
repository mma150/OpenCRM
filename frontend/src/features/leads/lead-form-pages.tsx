"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { PageLoading, PageState } from "@/components/shared/page-state";
import { BackLink } from "@/components/shared/record-layout";
import { NoWriteAccess } from "@/components/shared/record-loader";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { useCustomFieldsForForm } from "@/features/custom-fields/use-custom-fields";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import { useReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { LeadForm } from "./lead-form";
import { isConverted, leadAccess } from "./lead-labels";
import { LeadLoader } from "./lead-loader";

// /leads/new
export function NewLeadPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: assignable, status: assignableStatus } = useAppSelector(selectAssignableUsers);
  const returnTo = useReturnTo("/leads");
  const customFields = useCustomFieldsForForm("LEAD");
  const canWrite = me ? leadAccess(me.role).canWrite : false;

  useEffect(() => {
    if (canWrite) {
      void dispatch(fetchAssignableUsers());
    }
  }, [dispatch, canWrite]);

  if (!me) {
    return null;
  }
  if (!canWrite) {
    return <NoWriteAccess plural="leads" backHref="/leads" />;
  }

  // Wait for the possible owners, so the form knows whether to show the Owner field.
  // If they cannot be loaded the form still works: the lead is then the user's own.
  const ownersReady = assignable !== null || assignableStatus === "failed";
  const owners = (assignable ?? []).map((user) => ({ value: user.id, label: user.name }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink href={returnTo} label="Back to leads" />
      <PageHeader title="New lead" description="Add a prospect and who looks after them." />
      {ownersReady && customFields.ready ? (
        <LeadForm
          myId={me.id}
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

// /leads/[id]/edit
export function EditLeadPage({ id }: { id: string }) {
  const { data: me } = useAppSelector(selectAuth);
  const returnTo = useReturnTo(`/leads/${id}`);
  const customFields = useCustomFieldsForForm("LEAD");

  if (!me) {
    return null;
  }
  if (!leadAccess(me.role).canWrite) {
    return <NoWriteAccess plural="leads" backHref="/leads" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <LeadLoader id={id}>
        {(lead) =>
          isConverted(lead) ? (
            // Its details are final: the API refuses a change with LEAD_CONVERTED.
            <PageState
              icon={Lock}
              title="This lead was converted"
              description="A converted lead can no longer be edited. Its timeline is kept, and the work continues on the contact it became."
              action={
                <Button asChild variant="outline" className="h-10 px-4">
                  <Link href={`/leads/${lead.id}`}>Back to the lead</Link>
                </Button>
              }
            />
          ) : (
            <>
              <BackLink href={returnTo} label="Back" />
              <PageHeader title={`Edit ${lead.name}`} description="Change the lead's details." />
              {/* The key remounts the form if a fresher copy of the lead arrives. */}
              {customFields.ready ? (
                <LeadForm
                  key={lead.updatedAt}
                  lead={lead}
                  myId={me.id}
                  customFields={customFields.fields}
                  returnTo={returnTo}
                />
              ) : (
                <PageLoading />
              )}
            </>
          )
        }
      </LeadLoader>
    </div>
  );
}
