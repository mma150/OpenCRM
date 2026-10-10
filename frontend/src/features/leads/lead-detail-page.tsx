"use client";

import {
  ArrowRightLeft,
  Briefcase,
  Building2,
  CircleCheck,
  Pencil,
  RotateCcw,
  User,
  UserRoundPen,
  XCircle,
} from "lucide-react";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectAuth } from "@/features/auth/auth.slice";
import { LogConversationButton } from "@/features/timeline/log-conversation-button";
import { Timeline } from "@/features/timeline/timeline";
import type { RecordRef } from "@/features/timeline/timeline.types";
import { formatCurrency, formatDate, formatRelativeDate } from "@/lib/format";
import { useAppSelector } from "@/store/hooks";

import { type LeadDialog, LeadDialogs } from "./lead-dialogs";
import {
  isConverted,
  isOpenLeadStatus,
  LEAD_SOURCE_LABELS,
  leadAccess,
  LOST_REASON_LABELS,
  openLeadStatusOptions,
} from "./lead-labels";
import { LeadLoader } from "./lead-loader";
import { LeadStatusBadge } from "./lead-status-badge";
import type { Lead, OpenLeadStatus } from "./leads.types";
import { useChangeLeadStatus } from "./use-change-lead-status";

// The header's actions for a user who may change the lead. They are a few compact controls
// that wrap, so on a phone they stay in reach without scrolling sideways. A converted lead
// keeps only Reassign: its details and status are final, and it cannot be deleted.
function LeadActions({
  lead,
  canReassign,
  onOpen,
}: {
  lead: Lead;
  canReassign: boolean;
  onOpen: (dialog: LeadDialog) => void;
}) {
  const changeStatus = useChangeLeadStatus();
  const isOpen = isOpenLeadStatus(lead.status);

  if (isConverted(lead)) {
    return canReassign ? (
      <Button
        type="button"
        variant="outline"
        className="h-10 px-4"
        onClick={() => {
          onOpen({ kind: "reassign", lead });
        }}
      >
        <UserRoundPen aria-hidden />
        Reassign
      </Button>
    ) : null;
  }

  return (
    <>
      {isOpen ? (
        <Select
          value={lead.status}
          onValueChange={(status) => void changeStatus(lead, status as OpenLeadStatus)}
        >
          <SelectTrigger aria-label="Status" className="data-[size=default]:h-10">
            <span className="text-muted-foreground">Status:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {openLeadStatusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {/* A lost lead is reopened before it can be converted. */}
      {isOpen ? (
        <Button
          type="button"
          className="h-10 px-4"
          onClick={() => {
            onOpen({ kind: "convert", lead });
          }}
        >
          <ArrowRightLeft aria-hidden />
          Convert
        </Button>
      ) : null}
      {lead.status === "LOST" ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          onClick={() => void changeStatus(lead, "NEW")}
        >
          <RotateCcw aria-hidden />
          Reopen
        </Button>
      ) : null}
      <Button asChild variant="outline" className="h-10 px-4">
        <Link href={`/leads/${lead.id}/edit`}>
          <Pencil aria-hidden />
          Edit
        </Link>
      </Button>
      <RecordMoreMenu
        onReassign={
          canReassign
            ? () => {
                onOpen({ kind: "reassign", lead });
              }
            : undefined
        }
        onDelete={() => {
          onOpen({ kind: "delete", lead });
        }}
      >
        {isOpen ? (
          <DropdownMenuItem
            onSelect={() => {
              onOpen({ kind: "mark-lost", lead });
            }}
          >
            <XCircle aria-hidden />
            Mark as lost
          </DropdownMenuItem>
        ) : null}
      </RecordMoreMenu>
    </>
  );
}

// What a converted lead became, with a link to each record. It sits under the header, so it
// is in view at every width. A record the user may not see is not named by the API, and is
// left out here.
function ConvertedBanner({ lead }: { lead: Lead }) {
  const { contact, company, opportunity } = lead.convertedTo ?? {};
  const links = [
    contact ? { label: "Contact", href: `/contacts/${contact.id}`, name: contact.name } : null,
    company ? { label: "Company", href: `/companies/${company.id}`, name: company.name } : null,
    opportunity
      ? { label: "Opportunity", href: `/opportunities/${opportunity.id}`, name: opportunity.name }
      : null,
  ].filter((link) => link !== null);

  return (
    <section
      aria-label="Converted"
      className="flex min-w-0 items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950"
    >
      <CircleCheck
        aria-hidden
        className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Converted{lead.convertedAt ? ` on ${formatDate(lead.convertedAt)}` : null}
          </p>
          <p className="text-muted-foreground text-sm">
            This lead can no longer be edited. Its timeline is kept, and the work continues on the
            records it became.
          </p>
        </div>
        {links.length > 0 ? (
          <dl className="flex min-w-0 flex-col gap-1 text-sm">
            {links.map((link) => (
              <div key={link.label} className="flex min-w-0 flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{link.label}:</dt>
                <dd className="min-w-0">
                  <DetailLink href={link.href}>{link.name}</DetailLink>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

// Why, when and with what note the lead was marked as lost.
function LostCard({ lead }: { lead: Lead }) {
  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle>Marked as lost</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailItem label="Reason">
            {lead.lostReason ? LOST_REASON_LABELS[lead.lostReason] : <EmptyValue />}
          </DetailItem>
          {lead.lostNote ? (
            <DetailItem label="Note">
              <span className="whitespace-pre-wrap">{lead.lostNote}</span>
            </DetailItem>
          ) : null}
          {lead.lostAt ? <DetailItem label="Date">{formatDate(lead.lostAt)}</DetailItem> : null}
        </DetailList>
      </CardContent>
    </Card>
  );
}

function LeadDetail({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { data: me } = useAppSelector(selectAuth);
  const [dialog, setDialog] = useState<LeadDialog>(null);

  if (!me) {
    return null;
  }
  const access = leadAccess(me.role);
  const record: RecordRef = { type: "lead", id: lead.id };

  return (
    <>
      <BackLink href="/leads" label="Back to leads" />
      <RecordLayout
        header={
          <>
            <RecordHeader
              title={lead.name}
              badge={<LeadStatusBadge status={lead.status} />}
              meta={
                <>
                  {lead.company ? (
                    <RecordFact icon={<Building2 aria-hidden />}>{lead.company}</RecordFact>
                  ) : null}
                  {lead.jobTitle ? (
                    <RecordFact icon={<Briefcase aria-hidden />}>{lead.jobTitle}</RecordFact>
                  ) : null}
                  <RecordFact icon={<User aria-hidden />}>Owner: {lead.owner.name}</RecordFact>
                </>
              }
              actions={
                access.canWrite ? (
                  <LeadActions lead={lead} canReassign={access.canReassign} onOpen={setDialog} />
                ) : undefined
              }
            />
            {isConverted(lead) ? <ConvertedBanner lead={lead} /> : null}
            {/* Phones only: the timeline shows the same form inline on wider screens. */}
            {access.canWrite ? (
              <LogConversationButton record={record} recordName={lead.name} />
            ) : null}
          </>
        }
        main={
          // A change to the lead (status, owner, lost, reopened) moves `updatedAt`, and the
          // timeline then loads again to show the entry the API wrote for it.
          <Timeline record={record} canWrite={access.canWrite} refreshKey={lead.updatedAt} />
        }
        aside={
          <>
            {lead.status === "LOST" ? <LostCard lead={lead} /> : null}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailItem label="Email">
                    {lead.email ? (
                      <DetailLink href={`mailto:${lead.email}`}>{lead.email}</DetailLink>
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Phone">
                    {lead.phone ? (
                      <DetailLink href={`tel:${lead.phone}`}>{lead.phone}</DetailLink>
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Source">{LEAD_SOURCE_LABELS[lead.source]}</DetailItem>
                  <DetailItem label="Owner">{lead.owner.name}</DetailItem>
                  <DetailItem label="Last contact">
                    {lead.lastContactAt ? formatRelativeDate(lead.lastContactAt) : "Never"}
                  </DetailItem>
                  <DetailItem label="Estimated value">
                    {lead.estimatedValue === null ? (
                      <EmptyValue />
                    ) : (
                      formatCurrency(lead.estimatedValue)
                    )}
                  </DetailItem>
                  <DetailItem label="Created">{formatDate(lead.createdAt)}</DetailItem>
                  <DetailItem label="Updated">{formatDate(lead.updatedAt)}</DetailItem>
                </DetailList>
              </CardContent>
            </Card>
            <NotesCard notes={lead.notes} />
          </>
        }
      />

      <LeadDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onDeleted={() => {
          router.replace("/leads");
        }}
      />
    </>
  );
}

// /leads/[id]: the header with the lead's actions, the timeline in the wide column, and
// the Details and Notes cards beside it (behind the "Details" button below `lg`).
export function LeadDetailPage({ id }: { id: string }) {
  return <LeadLoader id={id}>{(lead) => <LeadDetail lead={lead} />}</LeadLoader>;
}
