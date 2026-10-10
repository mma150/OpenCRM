"use client";

import { Check } from "lucide-react";

import type { PipelineStage } from "@/features/pipeline-stages/pipeline-stages.types";
import { cn } from "@/lib/utils";

import type { Opportunity } from "./opportunities.types";

const stepClass =
  "flex min-h-10 max-w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium";

// Where an opportunity is in the pipeline: the open stages in order, each a step, with the
// one it is in marked. For a user who may change it, every other step is a button that
// moves it there. The steps wrap onto more lines when they do not fit, so any number of
// stages works at any width. A closed opportunity shows the steps without a current one and
// without buttons: it is reopened first.
export function StageStepper({
  opportunity,
  stages,
  canWrite,
  onMove,
}: {
  opportunity: Opportunity;
  // The open stages, in order.
  stages: PipelineStage[];
  canWrite: boolean;
  onMove: (stage: PipelineStage) => void;
}) {
  const open = opportunity.status === "OPEN";
  const currentIndex = stages.findIndex((stage) => stage.id === opportunity.stage.id);

  return (
    <nav aria-label="Stage" className="bg-card rounded-lg border p-3 md:p-4">
      <ol className="flex min-w-0 flex-wrap gap-2">
        {stages.map((stage, index) => {
          const current = index === currentIndex;
          const done = open && index < currentIndex;
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                  current ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="min-w-0 truncate">{stage.name}</span>
            </>
          );
          return (
            <li key={stage.id} className="max-w-full min-w-0">
              {canWrite && open && !current ? (
                <button
                  type="button"
                  aria-label={`Move to ${stage.name}`}
                  onClick={() => {
                    onMove(stage);
                  }}
                  className={cn(
                    stepClass,
                    "hover:border-primary/40 hover:text-foreground focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
                    done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {content}
                </button>
              ) : (
                <span
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    stepClass,
                    current ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
