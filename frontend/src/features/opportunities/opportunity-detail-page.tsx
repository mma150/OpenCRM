"use client";

import {
  Building2,
  CalendarDays,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Pencil,
  RotateCcw,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FollowUp } from "@/components/shared/follow-up";
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
import { openStages } from "@/features/pipeline-stages/stage-labels";
import { usePipelineStages } from "@/features/pipeline-stages/use-pipeline-stages";
import { RecordTasks } from "@/features/tasks/record-tasks";
import { LogConversationButton } from "@/features/timeline/log-conversation-button";
import { Timeline } from "@/features/timeline/timeline";
import type { RecordRef } from "@/features/timeline/timeline.types";
import { formatCurrency, formatDate, formatDay, formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { setOpportunityFollowUp } from "./opportunities.slice";
import type { Opportunity } from "./opportunities.types";
import { type OpportunityDialog, OpportunityDialogs } from "./opportunity-dialogs";
import { opportunityAccess } from "./opportunity-labels";
import { OpportunityLoader } from "./opportunity-loader";
import { OpportunityStageBadge } from "./opportunity-stage-badge";
import { StageStepper } from "./stage-stepper";
import { useOpportunityStage } from "./use-opportunity-stage";

// How a closed opportunity ended: won or lost, when, and why. It sits under the header, so
// it is in view at every width.
function ClosedBanner({ opportunity }: { opportunity: Opportunity }) {
  const won = opportunity.status === "WON";
  const Icon = won ? CircleCheck : CircleX;
  return (
    <section
      aria-label="Outcome"
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-lg border p-4",
        won
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">
          Closed as {won ? "won" : "lost"}
          {opportunity.closedAt ? ` on ${formatDate(opportunity.closedAt)}` : null}
        </p>
        <p className="text-foreground text-sm wrap-anywhere whitespace-pre-wrap">
          {opportunity.closeReason ? (
            <>
              <span className="text-muted-foreground">Reason: </span>
              {opportunity.closeReason}
            </>
          ) : (
            <span className="text-muted-foreground">No reason was given.</span>
          )}
        </p>
      </div>
    </section>
  );
}

function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data: stages } = usePipelineStages();
  const { move, reopen } = useOpportunityStage();
  const [dialog, setDialog] = useState<OpportunityDialog>(null);

  if (!me) {
    return null;
  }
  const access = opportunityAccess(me.role);
  const record: RecordRef = { type: "opportunity", id: opportunity.id };
  const open = opportunity.status === "OPEN";
  const company = opportunity.company ? (
    <DetailLink href={`/companies/${opportunity.company.id}`}>
      {opportunity.company.name}
    </DetailLink>
  ) : null;
  const contact = opportunity.contact ? (
    <DetailLink href={`/contacts/${opportunity.contact.id}`}>{opportunity.contact.name}</DetailLink>
  ) : null;

  return (
    <>
      <BackLink href="/opportunities" label="Back to opportunities" />
      <RecordLayout
        header={
          <>
            <RecordHeader
              title={opportunity.name}
              badge={<OpportunityStageBadge stage={opportunity.stage} />}
              meta={
                <>
                  {company ? (
                    <RecordFact icon={<Building2 aria-hidden />}>{company}</RecordFact>
                  ) : null}
                  <RecordFact icon={<CircleDollarSign aria-hidden />}>
                    Value: {formatCurrency(opportunity.value)}
                  </RecordFact>
                  {opportunity.expectedCloseDate ? (
                    <RecordFact icon={<CalendarDays aria-hidden />}>
                      Expected close: {formatDay(opportunity.expectedCloseDate)}
                    </RecordFact>
                  ) : null}
                  <RecordFact icon={<User aria-hidden />}>
                    Owner: {opportunity.owner.name}
                  </RecordFact>
                </>
              }
              actions={
                access.canWrite ? (
                  <>
                    {open ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 px-4"
                          onClick={() => {
                            setDialog({ kind: "close", outcome: "WON", opportunity });
                          }}
                        >
                          <CircleCheck aria-hidden />
                          Close as won
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 px-4"
                          onClick={() => {
                            setDialog({ kind: "close", outcome: "LOST", opportunity });
                          }}
                        >
                          <CircleX aria-hidden />
                          Close as lost
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 px-4"
                        onClick={() => void reopen(opportunity)}
                      >
                        <RotateCcw aria-hidden />
                        Reopen
                      </Button>
                    )}
                    <Button asChild variant="outline" className="h-10 px-4">
                      <Link href={`/opportunities/${opportunity.id}/edit`}>
                        <Pencil aria-hidden />
                        Edit
                      </Link>
                    </Button>
                    <RecordMoreMenu
                      onReassign={
                        access.canReassign
                          ? () => {
                              setDialog({ kind: "reassign", opportunity });
                            }
                          : undefined
                      }
                      onDelete={() => {
                        setDialog({ kind: "delete", opportunity });
                      }}
                    />
                  </>
                ) : undefined
              }
            />
            {open ? null : <ClosedBanner opportunity={opportunity} />}
            {stages ? (
              <StageStepper
                opportunity={opportunity}
                stages={openStages(stages)}
                canWrite={access.canWrite}
                onMove={(stage) => void move(opportunity, stage)}
              />
            ) : null}
            {/* A closed opportunity takes no new follow-up; one it still has can be cleared. */}
            <FollowUp
              at={opportunity.followUpAt}
              note={opportunity.followUpNote}
              canSet={access.canWrite && open}
              canClear={access.canWrite}
              onSave={(input) =>
                dispatch(setOpportunityFollowUp({ id: opportunity.id, input })).unwrap()
              }
            />
            {/* Phones only: the timeline shows the same form inline on wider screens. */}
            {access.canWrite ? (
              <LogConversationButton record={record} recordName={opportunity.name} />
            ) : null}
          </>
        }
        main={
          // A change to the opportunity (stage, closed, reopened, owner) moves `updatedAt`,
          // and the timeline then loads again to show the entry the API wrote for it.
          <Timeline record={record} canWrite={access.canWrite} refreshKey={opportunity.updatedAt} />
        }
        aside={
          <>
            <RecordTasks record={record} recordName={opportunity.name} canWrite={access.canWrite} />
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList>
                  <DetailItem label="Value">{formatCurrency(opportunity.value)}</DetailItem>
                  <DetailItem label="Expected close">
                    {opportunity.expectedCloseDate ? (
                      formatDay(opportunity.expectedCloseDate)
                    ) : (
                      <EmptyValue />
                    )}
                  </DetailItem>
                  <DetailItem label="Stage">{opportunity.stage.name}</DetailItem>
                  <DetailItem label="Company">{company ?? <EmptyValue />}</DetailItem>
                  <DetailItem label="Contact">{contact ?? <EmptyValue />}</DetailItem>
                  <DetailItem label="Owner">{opportunity.owner.name}</DetailItem>
                  <DetailItem label="Last contact">
                    {opportunity.lastContactAt
                      ? formatRelativeDate(opportunity.lastContactAt)
                      : "Never"}
                  </DetailItem>
                  {opportunity.convertedFromLead ? (
                    <DetailItem label="Converted from lead">
                      <DetailLink href={`/leads/${opportunity.convertedFromLead.id}`}>
                        {opportunity.convertedFromLead.name}
                      </DetailLink>
                    </DetailItem>
                  ) : null}
                  <DetailItem label="Created">{formatDate(opportunity.createdAt)}</DetailItem>
                  <DetailItem label="Updated">{formatDate(opportunity.updatedAt)}</DetailItem>
                </DetailList>
              </CardContent>
            </Card>
            <RecordCustomFields recordType="OPPORTUNITY" values={opportunity.customFields} />
            <NotesCard notes={opportunity.notes} />
          </>
        }
      />

      <OpportunityDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onDeleted={() => {
          router.replace("/opportunities");
        }}
      />
    </>
  );
}

// /opportunities/[id]: the header with the opportunity's actions, its place in the pipeline,
// the timeline in the wide column, and the Details and Notes cards beside it (OPP-03).
export function OpportunityDetailPage({ id }: { id: string }) {
  return (
    <OpportunityLoader id={id}>
      {(opportunity) => <OpportunityDetail opportunity={opportunity} />}
    </OpportunityLoader>
  );
}
