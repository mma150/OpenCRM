"use client";

import {
  ArrowRightLeft,
  Building2,
  CalendarDays,
  CircleCheck,
  CircleX,
  RotateCcw,
  User,
} from "lucide-react";
import Link from "next/link";
import { type DragEvent, type ReactNode, useEffect, useState } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { PageError, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/error-messages";
import { formatCurrency, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchBoard, selectBoard } from "./opportunities.slice";
import type { BoardColumn, BoardQuery, Opportunity } from "./opportunities.types";
import type { OpportunityDialog } from "./opportunity-dialogs";
import { useOpportunityStage } from "./use-opportunity-stage";

type Stage = BoardColumn["stage"];

const SKELETON_COLUMNS = [0, 1, 2, 3];

// The address of the list, filtered to one stage: where a column sends the user for the
// opportunities it does not show.
function stageListHref(stageId: string): string {
  return `/opportunities?view=list&stageId=${stageId}`;
}

// On a phone the menu is the only way to move a card, so its rows are a finger tall.
const itemClass = "max-md:min-h-11";

// The "Move to stage" menu of a card. It does everything dragging does, with a keyboard or a
// finger, and it is the only way to move a card on a phone: another open stage moves the
// card at once, Won and Lost open the close dialog. A closed card can only be reopened.
function MoveMenu({
  opportunity,
  stages,
  onMove,
  onReopen,
  onOpen,
}: {
  opportunity: Opportunity;
  // The open stages of the board, in order.
  stages: Stage[];
  onMove: (opportunity: Opportunity, stage: Stage) => void;
  onReopen: (opportunity: Opportunity) => void;
  onOpen: (dialog: OpportunityDialog) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-11 md:size-8"
          aria-label={`Move ${opportunity.name} to another stage`}
        >
          <ArrowRightLeft aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {opportunity.status === "OPEN" ? (
          <>
            <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
            {stages
              .filter((stage) => stage.id !== opportunity.stage.id)
              .map((stage) => (
                <DropdownMenuItem
                  className={itemClass}
                  key={stage.id}
                  onSelect={() => {
                    onMove(opportunity, stage);
                  }}
                >
                  <span className="min-w-0 wrap-anywhere">{stage.name}</span>
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => {
                onOpen({ kind: "close", outcome: "WON", opportunity });
              }}
            >
              <CircleCheck aria-hidden />
              Close as won
            </DropdownMenuItem>
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => {
                onOpen({ kind: "close", outcome: "LOST", opportunity });
              }}
            >
              <CircleX aria-hidden />
              Close as lost
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            className={itemClass}
            onSelect={() => {
              onReopen(opportunity);
            }}
          >
            <RotateCcw aria-hidden />
            Reopen
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// One opportunity on the board: its name (the link to its page), company, value, expected
// close date and owner. `menu` is the "Move to stage" menu, for a user who may change it.
function BoardCard({
  opportunity,
  menu,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  opportunity: Opportunity;
  menu: ReactNode;
  dragging: boolean;
  // Left out for a card that cannot be dragged: a closed one, or any card for a Read-only user.
  onDragStart?: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <li
      draggable={onDragStart ? true : undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-card flex min-w-0 flex-col gap-2 rounded-lg border p-3",
        onDragStart && "md:cursor-grab md:active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            href={`/opportunities/${opportunity.id}`}
            // The card is what is dragged, not the link inside it.
            draggable={false}
            className="hover:text-primary focus-visible:ring-ring/50 self-start rounded-sm text-sm font-medium wrap-anywhere outline-none focus-visible:ring-3"
          >
            {opportunity.name}
          </Link>
          {opportunity.company ? (
            <p className="text-muted-foreground flex min-w-0 items-start gap-1 text-xs">
              <Building2 aria-hidden className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 wrap-anywhere">{opportunity.company.name}</span>
            </p>
          ) : null}
        </div>
        {menu ? <div className="-mt-1.5 -mr-1.5 shrink-0">{menu}</div> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-2">
        <span className="min-w-0 text-sm font-semibold wrap-anywhere">
          {formatCurrency(opportunity.value)}
        </span>
        {opportunity.expectedCloseDate ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <CalendarDays aria-hidden className="size-3 shrink-0" />
            <span className="sr-only">Expected close: </span>
            {formatDay(opportunity.expectedCloseDate)}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
        <User aria-hidden className="size-3 shrink-0" />
        <span className="sr-only">Owner: </span>
        <span className="min-w-0 truncate">{opportunity.owner.name}</span>
      </p>
    </li>
  );
}

// "Showing 50 of 132": a column carries at most 50 cards, and the list has the rest.
function CappedNote({ column }: { column: BoardColumn }) {
  if (column.count <= column.opportunities.length) {
    return null;
  }
  return (
    <p className="text-muted-foreground px-1 text-xs">
      Showing {column.opportunities.length} of {column.count}.{" "}
      <Link
        href={stageListHref(column.stage.id)}
        className="text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
      >
        View all in the list
      </Link>
    </p>
  );
}

const KIND_DOT: Record<Stage["kind"], string> = {
  OPEN: "bg-primary",
  WON: "bg-emerald-600 dark:bg-emerald-400",
  LOST: "bg-destructive",
};

// The stage selector of the board on a phone, where one stage is shown at a time: a row of
// buttons with each stage's count. The row scrolls inside itself when the stages do not fit;
// the page never does.
function StageTabs({
  columns,
  currentId,
  onChange,
}: {
  columns: BoardColumn[];
  currentId: string;
  onChange: (stageId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Stage"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden"
    >
      {columns.map((column) => {
        const pressed = column.stage.id === currentId;
        return (
          <button
            key={column.stage.id}
            type="button"
            aria-pressed={pressed}
            onClick={(event) => {
              onChange(column.stage.id);
              event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" });
            }}
            className={cn(
              "focus-visible:ring-ring/50 flex h-11 max-w-56 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3",
              pressed
                ? "border-primary bg-primary/10 text-primary"
                : "bg-card text-muted-foreground",
            )}
          >
            <span className="truncate">{column.stage.name}</span>
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs">
              {column.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// /opportunities as a board (OPP-02): one column for each stage with its count and total
// value. A user who may change opportunities drags a card to another open stage on a wide
// screen, or uses the card's "Move to stage" menu at any width; dropping on Won or Lost, or
// choosing them in the menu, opens the close dialog. A phone shows one stage at a time.
//
// From `md` the open stages share the width and scroll sideways inside the board when they
// do not fit (the page itself never does). Won and Lost are narrow columns that stay at the
// right edge: they show their count and total and take drops, and link to the list for
// their opportunities, which would otherwise pile up without end.
export function OpportunityBoard({
  query,
  canWrite,
  isFiltered,
  onClearFilters,
  createAction,
  onOpen,
}: {
  query: BoardQuery;
  canWrite: boolean;
  // Whether the search box or the owner filter narrows the board, for the empty state.
  isFiltered: boolean;
  onClearFilters: () => void;
  createAction?: ReactNode;
  onOpen: (dialog: OpportunityDialog) => void;
}) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectBoard);
  const { move, reopen } = useOpportunityStage();
  // The stage a phone shows; the first one until the user picks another.
  const [pickedStageId, setPickedStageId] = useState<string | null>(null);
  // The card being dragged, and the column it is over.
  const [dragged, setDragged] = useState<Opportunity | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchBoard(query));
  }, [dispatch, query]);

  if (data === null) {
    if (status === "failed" && error) {
      return <PageError error={error} onRetry={() => void dispatch(fetchBoard(query))} />;
    }
    return (
      <div role="status" aria-label="Loading board" className="flex flex-col gap-3 md:flex-row">
        {SKELETON_COLUMNS.map((column) => (
          <div key={column} className="bg-muted/50 flex flex-1 flex-col gap-3 rounded-lg p-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (data.every((column) => column.count === 0)) {
    return isFiltered ? (
      <PageState
        title="No opportunities match your filters"
        description="Try a different search or remove a filter."
        action={
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <PageState
        title="No opportunities yet"
        description={
          canWrite
            ? "Add your first opportunity to start your pipeline."
            : "Opportunities will show here once someone adds them."
        }
        action={createAction}
      />
    );
  }

  const openStageList = data.map((column) => column.stage).filter((stage) => stage.kind === "OPEN");
  const currentStageId =
    data.find((column) => column.stage.id === pickedStageId)?.stage.id ?? data[0]?.stage.id ?? "";

  function endDrag() {
    setDragged(null);
    setOverStageId(null);
  }

  // A card dropped on a column: another open stage moves it, Won or Lost asks for the reason.
  function drop(stage: Stage) {
    const opportunity = dragged;
    endDrag();
    if (!opportunity || opportunity.stage.id === stage.id) {
      return;
    }
    if (stage.kind === "OPEN") {
      void move(opportunity, stage);
    } else {
      onOpen({ kind: "close", outcome: stage.kind, opportunity });
    }
  }

  function renderColumn(column: BoardColumn) {
    const { stage } = column;
    const closed = stage.kind !== "OPEN";
    const isTarget = dragged !== null && dragged.stage.id !== stage.id;

    return (
      <section
        key={stage.id}
        aria-label={stage.name}
        data-current={stage.id === currentStageId}
        data-over={isTarget && overStageId === stage.id}
        // Only a column a card may be dropped on takes part in dragging.
        onDragOver={
          isTarget
            ? (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOverStageId(stage.id);
              }
            : undefined
        }
        onDragLeave={
          isTarget
            ? (event) => {
                // Moving over a card inside the column is not leaving it.
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setOverStageId(null);
                }
              }
            : undefined
        }
        onDrop={
          isTarget
            ? (event) => {
                event.preventDefault();
                drop(stage);
              }
            : undefined
        }
        className={cn(
          "bg-muted/50 flex min-w-0 flex-col gap-3 rounded-lg border border-transparent p-3",
          "data-[over=true]:border-primary data-[over=true]:bg-primary/5",
          stage.id !== currentStageId && "max-md:hidden",
          // A width of its own for every column: the row is as wide as its columns together, and
          // the open ones grow into whatever the screen has left.
          closed ? "md:w-24 md:shrink-0 md:p-2" : "md:w-44 md:shrink-0 md:grow",
          isTarget && "md:border-dashed md:border-border",
        )}
      >
        <header className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", KIND_DOT[stage.kind])}
            />
            <h2 className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">{stage.name}</h2>
            <span
              className="bg-background text-muted-foreground shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium"
              aria-label={`${String(column.count)} opportunities`}
            >
              {column.count}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {formatCurrency(column.totalValue)}{" "}
            <span className={closed ? "md:hidden" : ""}>total</span>
          </p>
        </header>

        {/* From `md` a closed column is a narrow drop target and a link to the list. */}
        {closed ? (
          <div className="text-muted-foreground flex flex-col gap-2 text-xs max-md:hidden">
            {canWrite ? (
              <p>Drop a card here to close it as {stage.kind === "WON" ? "won" : "lost"}.</p>
            ) : null}
            {column.count > 0 ? (
              <Link
                href={stageListHref(stage.id)}
                className="text-primary focus-visible:ring-ring/50 self-start rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
              >
                View in list
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className={cn("flex min-w-0 flex-col gap-3", closed && "md:hidden")}>
          {column.opportunities.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
              No opportunities
            </p>
          ) : (
            <ul aria-label={`${stage.name} opportunities`} className="flex min-w-0 flex-col gap-2">
              {column.opportunities.map((opportunity) => (
                <BoardCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  dragging={dragged?.id === opportunity.id}
                  onDragStart={
                    canWrite && !closed
                      ? (event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", opportunity.name);
                          setDragged(opportunity);
                        }
                      : undefined
                  }
                  onDragEnd={endDrag}
                  menu={
                    canWrite ? (
                      <MoveMenu
                        opportunity={opportunity}
                        stages={openStageList}
                        onMove={(card, target) => void move(card, target)}
                        onReopen={(card) => void reopen(card)}
                        onOpen={onOpen}
                      />
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
          <CappedNote column={column} />
        </div>
      </section>
    );
  }

  return (
    <>
      {/* A failed reload keeps the last board on screen, so say that it is out of date. */}
      {status === "failed" && error ? <FormAlert message={describeApiError(error)} /> : null}

      <StageTabs columns={data} currentId={currentStageId} onChange={setPickedStageId} />

      <div role="region" aria-label="Pipeline board" className="min-w-0 md:overflow-x-auto md:pb-2">
        <div className="flex min-w-0 flex-col gap-3 md:w-max md:min-w-full md:flex-row md:items-stretch">
          {data.filter((column) => column.stage.kind === "OPEN").map(renderColumn)}
          {/* Won and Lost stay in reach at the right edge while the open stages scroll. */}
          <div className="md:bg-background flex min-w-0 flex-col gap-3 md:sticky md:right-0 md:flex-row md:pl-3">
            {data.filter((column) => column.stage.kind !== "OPEN").map(renderColumn)}
          </div>
        </div>
      </div>
    </>
  );
}
