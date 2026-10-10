"use client";

import { toast } from "sonner";

import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { useAppDispatch } from "@/store/hooks";

import { completeTask, reopenTask } from "./tasks.slice";
import type { Task } from "./tasks.types";

// What a task's checkbox does, wherever the task is listed (the Tasks page, Home, a record's
// Tasks card). Completing is optimistic: the task leaves the list at once and comes back,
// with a message, when the API refuses. `onChanged` runs after a change the API accepted,
// for a list that keeps its tasks outside the tasks slice and has to load them again.
export function useTaskToggle(onChanged?: () => void): {
  complete: (task: Pick<Task, "id" | "title">) => Promise<void>;
  reopen: (task: Pick<Task, "id" | "title">) => Promise<void>;
} {
  const dispatch = useAppDispatch();

  async function reopen(task: Pick<Task, "id" | "title">) {
    try {
      await dispatch(reopenTask(task.id)).unwrap();
      toast.success("Task reopened.");
      onChanged?.();
    } catch (error) {
      toast.error(`"${task.title}" could not be reopened. ${describeApiError(error as ApiError)}`);
    }
  }

  async function complete(task: Pick<Task, "id" | "title">) {
    try {
      await dispatch(completeTask(task.id)).unwrap();
      // A large checkbox is easy to hit by mistake, so the toast can take it back.
      toast.success("Task completed.", {
        action: { label: "Undo", onClick: () => void reopen(task) },
      });
      onChanged?.();
    } catch (error) {
      toast.error(
        `"${task.title}" could not be completed and is back in the list. ${describeApiError(error as ApiError)}`,
      );
    }
  }

  return { complete, reopen };
}
