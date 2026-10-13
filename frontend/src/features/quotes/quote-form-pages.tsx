"use client";

import { FileLock2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { PageLoading, PageState } from "@/components/shared/page-state";
import { BackLink } from "@/components/shared/record-layout";
import { NoWriteAccess } from "@/components/shared/record-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { selectAuth } from "@/features/auth/auth.slice";
import { getOpportunity } from "@/features/opportunities/opportunities.api";
import { OpportunityPicker } from "@/features/opportunities/opportunity-picker";
import { useOrganization } from "@/features/organization/use-organization";
import { useReturnTo } from "@/lib/return-to";
import { usePreselectedRecord } from "@/lib/use-preselected-record";
import { useAppSelector } from "@/store/hooks";

import { QuoteForm } from "./quote-form";
import { QUOTE_STATUS_LABELS, quoteAccess, quoteActions } from "./quote-labels";
import { QuoteLoader } from "./quote-loader";

// /quotes/new?opportunityId=<id>: the editor for a new quote of that opportunity ("New quote"
// on its Quotes card). A quote always belongs to an opportunity, so without the id, or with
// one this user cannot see, the page first asks which opportunity the quote is for.
export function NewQuotePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useAppSelector(selectAuth);
  const { data: organization, status: organizationStatus } = useOrganization();
  const returnTo = useReturnTo("/quotes");
  const canWrite = me ? quoteAccess(me.role).canWrite : false;
  const fromOpportunity = usePreselectedRecord("opportunityId", canWrite, getOpportunity);

  if (!me) {
    return null;
  }
  if (!canWrite) {
    return <NoWriteAccess plural="quotes" backHref="/quotes" />;
  }

  // The defaults of a new quote come from the organisation settings. If they cannot be
  // loaded the form still works, with the API's own defaults.
  const organizationReady = organization !== null || organizationStatus === "failed";
  const opportunity = fromOpportunity.record;
  const asked = searchParams.get("opportunityId");

  // Puts the chosen opportunity into the address, keeping `from`.
  function choose(id: string) {
    const params = new URLSearchParams(searchParams);
    params.set("opportunityId", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <BackLink href={returnTo} label={returnTo === "/quotes" ? "Back to quotes" : "Back"} />
      <PageHeader
        title="New quote"
        description="What you offer, line by line. It is saved as a draft that you can change until you send it."
      />
      {!fromOpportunity.ready || !organizationReady ? (
        <PageLoading />
      ) : opportunity ? (
        <QuoteForm
          // A fresh form when another opportunity is named in the address.
          key={opportunity.id}
          opportunity={{ id: opportunity.id, name: opportunity.name }}
          contact={opportunity.contact}
          company={opportunity.company}
          organization={organization}
          returnTo={returnTo}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Which opportunity is this quote for?</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {asked
                ? "That opportunity does not exist or is not yours to see. Choose another one."
                : "A quote always belongs to an opportunity. Its contact and company are filled in for you."}
            </p>
            <div className="max-w-md">
              <OpportunityPicker
                value={null}
                onChange={(picked) => {
                  if (picked) {
                    choose(picked.id);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// /quotes/[id]/edit: the editor for a draft. A quote in any other status is not changed:
// the page says that it must be reopened first.
export function EditQuotePage({ id }: { id: string }) {
  const { data: me } = useAppSelector(selectAuth);
  const { data: organization, status: organizationStatus } = useOrganization();
  const returnTo = useReturnTo(`/quotes/${id}`);

  if (!me) {
    return null;
  }
  if (!quoteAccess(me.role).canWrite) {
    return <NoWriteAccess plural="quotes" backHref="/quotes" />;
  }
  const organizationReady = organization !== null || organizationStatus === "failed";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <QuoteLoader id={id}>
        {(quote) =>
          quoteActions(quote).edit ? (
            <>
              <BackLink href={returnTo} label="Back" />
              <PageHeader
                title={`Edit quote ${quote.number}`}
                description="Change the draft. The totals are counted again when you save."
              />
              {organizationReady ? (
                // The key remounts the form if a fresher copy of the quote arrives.
                <QuoteForm
                  key={quote.updatedAt}
                  quote={quote}
                  opportunity={quote.opportunity}
                  organization={organization}
                  returnTo={returnTo}
                />
              ) : (
                <PageLoading />
              )}
            </>
          ) : (
            <PageState
              icon={FileLock2}
              title={`Quote ${quote.number} is not a draft`}
              description={`It is ${QUOTE_STATUS_LABELS[quote.status].toLowerCase()}, so it cannot be changed. Reopen it on its page first, or duplicate it to revise it as a new draft.`}
              action={
                <Button asChild variant="outline" className="h-10 px-4">
                  <Link href={`/quotes/${quote.id}`}>Back to the quote</Link>
                </Button>
              }
            />
          )
        }
      </QuoteLoader>
    </div>
  );
}
