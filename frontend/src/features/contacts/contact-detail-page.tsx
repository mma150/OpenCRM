"use client";

import { Briefcase, Building2, Pencil, User } from "lucide-react";
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
import { RecordCustomFields } from "@/features/custom-fields/record-custom-fields";
import { SendEmailButton } from "@/features/emails/send-email-button";
import { RecordOpportunities } from "@/features/opportunities/record-opportunities";
import { RecordTasks } from "@/features/tasks/record-tasks";
import { LogConversationButton } from "@/features/timeline/log-conversation-button";
import { Timeline } from "@/features/timeline/timeline";
import type { RecordRef } from "@/features/timeline/timeline.types";
import { formatDate, formatRelativeDate } from "@/lib/format";
import { recordAccess } from "@/lib/record-access";
import { useAppSelector } from "@/store/hooks";

import { type ContactDialog, ContactDialogs } from "./contact-dialogs";
import { ContactLoader } from "./contact-loader";
import type { Contact } from "./contacts.types";

function ContactDetail({ contact }: { contact: Contact }) {
  const router = useRouter();
  const { data: me } = useAppSelector(selectAuth);
  const [dialog, setDialog] = useState<ContactDialog>(null);

  if (!me) {
    return null;
  }
  const access = recordAccess(me.role);
  const record: RecordRef = { type: "contact", id: contact.id };
  const here = `/contacts/${contact.id}`;
  // The new-opportunity form with this contact (and its company) filled in.
  const addOpportunityHref = `/opportunities/new?contactId=${contact.id}&from=${encodeURIComponent(here)}`;
  const company = contact.company ? (
    <DetailLink href={`/companies/${contact.company.id}`}>{contact.company.name}</DetailLink>
  ) : null;

  return (
    <>
      <BackLink href="/contacts" label="Back to contacts" />
      <RecordLayout
        header={
          <>
            <RecordHeader
              title={contact.name}
              meta={
                <>
                  {contact.jobTitle ? (
                    <RecordFact icon={<Briefcase aria-hidden />}>{contact.jobTitle}</RecordFact>
                  ) : null}
                  {company ? (
                    <RecordFact icon={<Building2 aria-hidden />}>{company}</RecordFact>
                  ) : null}
                  <RecordFact icon={<User aria-hidden />}>Owner: {contact.owner.name}</RecordFact>
                </>
              }
              actions={
                access.canWrite ? (
                  <>
                    <SendEmailButton record={record} recordName={contact.name} canWrite />
                    <Button asChild variant="outline" className="h-10 px-4">
                      <Link href={`/contacts/${contact.id}/edit`}>
                        <Pencil aria-hidden />
                        Edit
                      </Link>
                    </Button>
                    <RecordMoreMenu
                      onReassign={
                        access.canReassign
                          ? () => {
                              setDialog({ kind: "reassign", contact });
                            }
                          : undefined
                      }
                      onDelete={() => {
                        setDialog({ kind: "delete", contact });
                      }}
                    />
                  </>
                ) : undefined
              }
            />
            {/* Phones only: the timeline shows the same form inline on wider screens. */}
            {access.canWrite ? (
              <LogConversationButton record={record} recordName={contact.name} />
            ) : null}
          </>
        }
        // The deals with this contact: above the timeline from `lg`, a section of its own below.
        extra={{
          label: "Opportunities",
          content: (
            <RecordOpportunities
              of={{ contactId: contact.id }}
              addHref={access.canWrite ? addOpportunityHref : undefined}
            />
          ),
        }}
        main={
          // A change to the contact (a new owner) moves `updatedAt`, and the timeline then
          // loads again to show the entry the API wrote for it.
          <Timeline record={record} canWrite={access.canWrite} refreshKey={contact.updatedAt} />
        }
        aside={
          <>
            <RecordTasks record={record} recordName={contact.name} canWrite={access.canWrite} />
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailItem label="Email">
                    {contact.email ? (
                      <DetailLink href={`mailto:${contact.email}`}>{contact.email}</DetailLink>
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Phone">
                    {contact.phone ? (
                      <DetailLink href={`tel:${contact.phone}`}>{contact.phone}</DetailLink>
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Company">{company ?? <EmptyValue />}</DetailItem>
                  <DetailItem label="Owner">{contact.owner.name}</DetailItem>
                  <DetailItem label="Last contact">
                    {contact.lastContactAt ? formatRelativeDate(contact.lastContactAt) : "Never"}
                  </DetailItem>
                  {contact.convertedFromLead ? (
                    <DetailItem label="Converted from lead">
                      <DetailLink href={`/leads/${contact.convertedFromLead.id}`}>
                        {contact.convertedFromLead.name}
                      </DetailLink>
                    </DetailItem>
                  ) : null}
                  <DetailItem label="Created">{formatDate(contact.createdAt)}</DetailItem>
                  <DetailItem label="Updated">{formatDate(contact.updatedAt)}</DetailItem>
                </DetailList>
              </CardContent>
            </Card>
            <RecordCustomFields recordType="CONTACT" values={contact.customFields} />
            <NotesCard notes={contact.notes} />
          </>
        }
      />

      <ContactDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onDeleted={() => {
          router.replace("/contacts");
        }}
      />
    </>
  );
}

// /contacts/[id]: the header with the contact's actions, the timeline in the wide column,
// and the Details and Notes cards beside it (behind the "Details" button below `lg`).
export function ContactDetailPage({ id }: { id: string }) {
  return <ContactLoader id={id}>{(contact) => <ContactDetail contact={contact} />}</ContactLoader>;
}
