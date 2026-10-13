"use client";

import { Factory, Globe, Pencil, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  BackLink,
  DetailItem,
  DetailLink,
  DetailList,
  EmptyValue,
  NotesCard,
  RecordFact,
  RecordHeader,
  RecordLayout,
} from "@/components/shared/record-layout";
import { RecordMoreMenu } from "@/components/shared/record-menus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { selectAuth } from "@/features/auth/auth.slice";
import { CompanyContacts } from "@/features/contacts/company-contacts";
import { RecordCustomFields } from "@/features/custom-fields/record-custom-fields";
import { SendEmailButton } from "@/features/emails/send-email-button";
import { RecordOpportunities } from "@/features/opportunities/record-opportunities";
import { RecordTasks } from "@/features/tasks/record-tasks";
import { LogConversationButton } from "@/features/timeline/log-conversation-button";
import { Timeline } from "@/features/timeline/timeline";
import type { RecordRef } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/format";
import { recordAccess } from "@/lib/record-access";
import { useAppSelector } from "@/store/hooks";

import type { Company } from "./companies.types";
import { type CompanyDialog, CompanyDialogs } from "./company-dialogs";
import { CompanyLoader } from "./company-loader";
import { WebsiteLink } from "./company-website";

function CompanyDetail({ company }: { company: Company }) {
  const router = useRouter();
  const { data: me } = useAppSelector(selectAuth);
  const [dialog, setDialog] = useState<CompanyDialog>(null);

  if (!me) {
    return null;
  }
  const access = recordAccess(me.role);
  const record: RecordRef = { type: "company", id: company.id };
  const here = `/companies/${company.id}`;
  // The new-contact form with this company filled in, coming back here on Cancel.
  const addContactHref = `/contacts/new?companyId=${company.id}&from=${encodeURIComponent(here)}`;
  const addOpportunityHref = `/opportunities/new?companyId=${company.id}&from=${encodeURIComponent(here)}`;

  return (
    <>
      <BackLink href="/companies" label="Back to companies" />
      <RecordLayout
        header={
          <>
            <RecordHeader
              title={company.name}
              meta={
                <>
                  {company.industry ? (
                    <RecordFact icon={<Factory aria-hidden />}>{company.industry}</RecordFact>
                  ) : null}
                  {company.website ? (
                    <RecordFact icon={<Globe aria-hidden />}>
                      <WebsiteLink website={company.website} />
                    </RecordFact>
                  ) : null}
                  <RecordFact icon={<User aria-hidden />}>Owner: {company.owner.name}</RecordFact>
                </>
              }
              actions={
                access.canWrite ? (
                  <>
                    <SendEmailButton record={record} recordName={company.name} canWrite />
                    <Button asChild variant="outline" className="h-10 px-4">
                      <Link href={addContactHref}>
                        <UserPlus aria-hidden />
                        Add contact
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-10 px-4">
                      <Link href={`${here}/edit`}>
                        <Pencil aria-hidden />
                        Edit
                      </Link>
                    </Button>
                    <RecordMoreMenu
                      onReassign={
                        access.canReassign
                          ? () => {
                              setDialog({ kind: "reassign", company });
                            }
                          : undefined
                      }
                      onDelete={() => {
                        setDialog({ kind: "delete", company });
                      }}
                    />
                  </>
                ) : undefined
              }
            />
            {/* Phones only: the timeline shows the same form inline on wider screens. */}
            {access.canWrite ? (
              <LogConversationButton record={record} recordName={company.name} />
            ) : null}
          </>
        }
        // The people and the deals at the company: above the timeline from `lg`, sections of
        // their own below.
        extra={[
          {
            label: "Contacts",
            content: (
              <CompanyContacts
                companyId={company.id}
                addHref={access.canWrite ? addContactHref : undefined}
              />
            ),
          },
          {
            label: "Opportunities",
            content: (
              <RecordOpportunities
                of={{ companyId: company.id }}
                addHref={access.canWrite ? addOpportunityHref : undefined}
              />
            ),
          },
        ]}
        main={
          // A change to the company (a new owner) moves `updatedAt`, and the timeline then
          // loads again to show the entry the API wrote for it.
          <Timeline record={record} canWrite={access.canWrite} refreshKey={company.updatedAt} />
        }
        aside={
          <>
            <RecordTasks record={record} recordName={company.name} canWrite={access.canWrite} />
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailItem label="Website">
                    {company.website ? <WebsiteLink website={company.website} /> : <EmptyValue />}
                  </DetailItem>
                  <DetailItem label="Phone">
                    {company.phone ? (
                      <DetailLink href={`tel:${company.phone}`}>{company.phone}</DetailLink>
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Industry">{company.industry ?? <EmptyValue />}</DetailItem>
                  <DetailItem label="Address">
                    {company.address ? (
                      <span className="whitespace-pre-wrap">{company.address}</span>
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Owner">{company.owner.name}</DetailItem>
                  <DetailItem label="Created">{formatDate(company.createdAt)}</DetailItem>
                  <DetailItem label="Updated">{formatDate(company.updatedAt)}</DetailItem>
                </DetailList>
              </CardContent>
            </Card>
            <RecordCustomFields recordType="COMPANY" values={company.customFields} />
            <NotesCard notes={company.notes} />
          </>
        }
      />

      <CompanyDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onDeleted={() => {
          router.replace("/companies");
        }}
      />
    </>
  );
}

// /companies/[id]: the header with the company's actions, its contacts and its timeline in
// the wide column, and the Details and Notes cards beside them (CONT-02, CONT-03).
export function CompanyDetailPage({ id }: { id: string }) {
  return <CompanyLoader id={id}>{(company) => <CompanyDetail company={company} />}</CompanyLoader>;
}
