"use client";

import { ArrowDown, ArrowUp, Lock, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageLoading, PageState } from "@/components/shared/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchPipelineStages,
  reorderPipelineStages,
  selectPipelineStages,
} from "./pipeline-stages.slice";
import type { PipelineStage } from "./pipeline-stages.types";
import { MAX_OPEN_STAGES, type StageDialog, StageDialogs } from "./stage-dialogs";
import { openStages } from "./stage-labels";

function countLabel(count: number): string {
  return count === 1 ? "1 opportunity" : `${String(count)} opportunities`;
}

const rowClass =
  "flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4";

function PipelineAdmin() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectPipelineStages);
  const [dialog, setDialog] = useState<StageDialog>(null);
  // True while a new order is being saved, so a second move waits for the first.
  const [moving, setMoving] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  // The move button that was used last. Once the new order is on screen it gets the focus
  // back, so a stage can be moved several places with the keyboard: Enter, Enter, Enter.
  const lastMove = useRef<{ stageId: string; by: -1 | 1 } | null>(null);

  useEffect(() => {
    const last = lastMove.current;
    lastMove.current = null;
    if (!last) {
      return;
    }
    const buttons = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>(
        `[data-stage="${last.stageId}"] [data-move]`,
      ) ?? []),
    ];
    // At the end of the list the button is switched off: the other direction takes over.
    const same = buttons.find((button) => button.dataset.move === String(last.by));
    (same && !same.disabled ? same : buttons.find((button) => !button.disabled))?.focus();
  }, [data]);

  useEffect(() => {
    void dispatch(fetchPipelineStages());
  }, [dispatch]);

  if (data === null) {
    return status === "failed" && error ? (
      <PageError error={error} onRetry={() => void dispatch(fetchPipelineStages())} />
    ) : (
      <PageLoading label="Loading pipeline..." />
    );
  }

  const open = openStages(data);
  const closed = data.filter((stage) => stage.kind !== "OPEN");
  const full = open.length >= MAX_OPEN_STAGES;

  // Swaps a stage with its neighbour and saves the new order. The API answers with the
  // whole pipeline, which replaces the list.
  async function move(stage: PipelineStage, by: -1 | 1) {
    const ids = open.map((candidate) => candidate.id);
    const from = ids.indexOf(stage.id);
    const neighbour = ids[from + by];
    if (moving || from === -1 || neighbour === undefined) {
      return;
    }
    ids[from + by] = stage.id;
    ids[from] = neighbour;
    setMoving(true);
    try {
      lastMove.current = { stageId: stage.id, by };
      await dispatch(reorderPipelineStages(ids)).unwrap();
    } catch (caught) {
      toast.error(`${stage.name} could not be moved. ${describeApiError(caught as ApiError)}`);
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="The stages an opportunity moves through, in order. Won and Lost always come last."
        action={
          <Button
            type="button"
            className="h-10 px-4"
            disabled={full}
            onClick={() => {
              setDialog({ kind: "add" });
            }}
          >
            <Plus aria-hidden />
            Add stage
          </Button>
        }
      />
      {full ? (
        <p className="text-muted-foreground text-sm">
          The pipeline has {MAX_OPEN_STAGES} open stages, the most it can hold.
        </p>
      ) : null}
      {/* A failed reload keeps the last list on screen, so say that it is out of date. */}
      {status === "failed" && error ? <FormAlert message={describeApiError(error)} /> : null}

      <ol
        ref={list}
        aria-label="Pipeline stages"
        className="bg-card flex flex-col divide-y rounded-lg border"
      >
        {open.map((stage, index) => (
          <li key={stage.id} data-stage={stage.id} className={rowClass}>
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium wrap-anywhere">{stage.name}</p>
                <p className="text-muted-foreground text-xs">
                  {countLabel(stage.opportunityCount)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 max-sm:-ml-2">
              <Button
                type="button"
                variant="ghost"
                className="size-11 sm:size-9"
                aria-label={`Move ${stage.name} up`}
                data-move="-1"
                // Not switched off while a move is being saved: that would drop the focus.
                disabled={index === 0}
                onClick={() => void move(stage, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="size-11 sm:size-9"
                aria-label={`Move ${stage.name} down`}
                data-move="1"
                disabled={index === open.length - 1}
                onClick={() => void move(stage, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="size-11 sm:size-9"
                aria-label={`Rename ${stage.name}`}
                onClick={() => {
                  setDialog({ kind: "rename", stage });
                }}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive size-11 sm:size-9"
                aria-label={`Delete ${stage.name}`}
                // A pipeline keeps at least one open stage.
                disabled={open.length <= 1}
                onClick={() => {
                  setDialog({ kind: "delete", stage });
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}
        {/* Won and Lost are fixed: always last, never deleted, but they can be renamed. */}
        {closed.map((stage) => (
          <li key={stage.id} className={`${rowClass} bg-muted/40`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-muted-foreground flex size-6 shrink-0 items-center justify-center">
                <Lock aria-hidden className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="min-w-0 wrap-anywhere">{stage.name}</span>
                  <Badge variant="outline">
                    {stage.kind === "WON" ? "Closed as won" : "Closed as lost"}
                  </Badge>
                </p>
                <p className="text-muted-foreground text-xs">
                  {countLabel(stage.opportunityCount)} · Fixed stage
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 max-sm:-ml-2">
              <Button
                type="button"
                variant="ghost"
                className="size-11 sm:size-9"
                aria-label={`Rename ${stage.name}`}
                onClick={() => {
                  setDialog({ kind: "rename", stage });
                }}
              >
                <Pencil aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <StageDialogs
        dialog={dialog}
        stages={open}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}

// /settings/pipeline (OPP-05): an Admin adds, renames, reorders and deletes the stages of
// the pipeline. Everyone else gets a page that says so; the API refuses them too.
export function PipelineSettingsPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (me.role !== "ADMIN") {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Pipeline"
        description="Only an Admin can change the stages of the pipeline."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return <PipelineAdmin />;
}
