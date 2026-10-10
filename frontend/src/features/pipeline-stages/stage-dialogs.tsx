"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectControl } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { useAppDispatch } from "@/store/hooks";

import {
  createPipelineStage,
  deletePipelineStage,
  renamePipelineStage,
} from "./pipeline-stages.slice";
import type { PipelineStage } from "./pipeline-stages.types";
import { stageOptions } from "./stage-labels";

// The dialog the pipeline settings page can open.
export type StageDialog =
  { kind: "add" } | { kind: "rename" | "delete"; stage: PipelineStage } | null;

// The most open stages a pipeline can have: the API's limit.
export const MAX_OPEN_STAGES = 20;

// The API refuses an action that does not apply (a 21st stage, deleting the last open stage)
// as VALIDATION_FAILED without naming a field. The dialog then says why in its own words.
function isNotApplicable(error: ApiError): boolean {
  return error.code === "VALIDATION_FAILED" && !Array.isArray(error.details);
}

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(50, "Use 50 characters or fewer."),
});

type NameValues = z.infer<typeof nameSchema>;

// Adds an open stage (it goes last, before Won), or renames any stage.
function StageNameDialog({ stage, onClose }: { stage?: PipelineStage; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: stage?.name ?? "" },
  });

  async function onSubmit(values: NameValues) {
    setFormError(null);
    try {
      if (stage) {
        if (values.name !== stage.name) {
          await dispatch(renamePipelineStage({ id: stage.id, name: values.name })).unwrap();
          toast.success(`${stage.name} was renamed to ${values.name}.`);
        }
      } else {
        await dispatch(createPipelineStage(values.name)).unwrap();
        toast.success(`${values.name} was added to the pipeline.`);
      }
      onClose();
    } catch (caught) {
      const error = caught as ApiError;
      setFormError(
        !stage && isNotApplicable(error)
          ? `A pipeline can have ${String(MAX_OPEN_STAGES)} open stages at most. Delete one first.`
          : applyServerError(error, form.setError, ["name"]),
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle className="pr-8 wrap-anywhere">
              {stage ? `Rename ${stage.name}` : "Add a stage"}
            </DialogTitle>
            <DialogDescription>
              {stage
                ? "The new name shows everywhere at once. Opportunities stay in the stage."
                : "The stage is added after the last open stage. You can move it afterwards."}
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          <FormField control={form.control} name="name" label="Stage name">
            {(field) => <Input {...field} autoComplete="off" maxLength={50} className="h-10" />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : stage ? "Rename" : "Add stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DeleteValues = { moveToStageId: string };

// Deletes an open stage. One that holds opportunities first asks which open stage takes them.
function DeleteStageDialog({
  stage,
  others,
  onClose,
}: {
  stage: PipelineStage;
  // The other open stages, in order.
  others: PipelineStage[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);
  const holds = stage.opportunityCount;
  const form = useForm<DeleteValues>({
    resolver: zodResolver(
      z.object({
        moveToStageId:
          holds > 0 ? z.string().min(1, "Choose the stage that takes them.") : z.string(),
      }),
    ),
    defaultValues: { moveToStageId: "" },
  });
  const opportunities = holds === 1 ? "1 opportunity" : `${String(holds)} opportunities`;

  async function onSubmit(values: DeleteValues) {
    setFormError(null);
    try {
      await dispatch(
        deletePipelineStage({
          id: stage.id,
          ...(values.moveToStageId ? { moveToStageId: values.moveToStageId } : {}),
        }),
      ).unwrap();
      toast.success(`${stage.name} was deleted.`);
      onClose();
    } catch (caught) {
      const error = caught as ApiError;
      setFormError(
        isNotApplicable(error)
          ? "This stage cannot be deleted. A pipeline keeps at least one open stage."
          : applyServerError(error, form.setError, ["moveToStageId"]),
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DialogHeader>
            <DialogTitle className="pr-8 wrap-anywhere">Delete {stage.name}?</DialogTitle>
            <DialogDescription>
              {holds > 0
                ? `This stage holds ${opportunities}. Choose the stage they move to; each gets a line on its timeline.`
                : "This stage holds no opportunities. Deleting it cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={formError} />
          {holds > 0 ? (
            <FormField
              control={form.control}
              name="moveToStageId"
              label={`Move ${opportunities} to`}
            >
              {({
                id,
                value,
                onChange,
                "aria-invalid": invalid,
                "aria-describedby": describedBy,
              }) => (
                <SelectControl
                  id={id}
                  value={value}
                  onChange={onChange}
                  invalid={invalid}
                  describedBy={describedBy}
                  options={stageOptions(others)}
                  placeholder="Select a stage"
                />
              )}
            </FormField>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="h-10 px-4"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Deleting..." : "Delete stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The dialogs of the pipeline settings page.
export function StageDialogs({
  dialog,
  stages,
  onClose,
}: {
  dialog: StageDialog;
  // The open stages, in order.
  stages: PipelineStage[];
  onClose: () => void;
}) {
  if (!dialog) {
    return null;
  }
  switch (dialog.kind) {
    case "add":
      return <StageNameDialog onClose={onClose} />;
    case "rename":
      return <StageNameDialog stage={dialog.stage} onClose={onClose} />;
    case "delete":
      return (
        <DeleteStageDialog
          stage={dialog.stage}
          others={stages.filter((stage) => stage.id !== dialog.stage.id)}
          onClose={onClose}
        />
      );
  }
}
