import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  reopenTask,
  updateTask,
} from "./tasks.api";
import {
  answerWith,
  callBack,
  doneTask,
  groups,
  prepareDeck,
  sendQuote,
  taskList,
  tidyUp,
} from "./tasks.fixtures";
import type { Task } from "./tasks.types";
import { TasksPage } from "./tasks-page";

vi.mock("./tasks.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/leads/leads.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("sonner");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Not allowed", details: null };

// A promise the test settles by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function renderTasks(me: Me = adminUser, search = "") {
  vi.mocked(listTasks).mockImplementation(answerWith(groups));
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
  setMockLocation("/tasks", search);
  followNavigation();
  const view = renderWithStore(<TasksPage />, { me });
  await screen.findByRole("heading", { level: 1, name: "Tasks" });
  return view;
}

const group = (name: string) => screen.getByRole("region", { name });
const titlesIn = (name: string) =>
  within(within(group(name)).getByRole("list")).getAllByRole("listitem");

describe("TasksPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the open tasks in four groups, each with its count", async () => {
    await renderTasks();

    for (const [name, task] of [
      ["Overdue", sendQuote],
      ["Due today", callBack],
      ["Upcoming", prepareDeck],
      ["No due date", tidyUp],
    ] as const) {
      const section = await screen.findByRole("region", { name });
      expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent(`${name}1`);
      expect(within(section).getByText(task.title)).toBeInTheDocument();
    }
  });

  it("marks an overdue task with the word, links its record, and names another assignee", async () => {
    await renderTasks();

    const overdue = await screen.findByRole("region", { name: "Overdue" });
    expect(within(overdue).getByText(/^Overdue · /)).toBeInTheDocument();
    expect(within(overdue).getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/leads/${sendQuote.record?.id ?? ""}`,
    );
    // The viewer's own name is not repeated; the rep's is shown.
    expect(within(overdue).queryByText(adminUser.name)).not.toBeInTheDocument();
    expect(within(group("Due today")).getByText(repUser.name)).toBeInTheDocument();
    expect(within(group("Due today")).queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it("asks for the viewer's own tasks by default, with the browser's time zone left to the API layer", async () => {
    await renderTasks();

    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledTimes(4);
    });
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OPEN", due: "overdue", assigneeId: adminUser.id }),
    );
  });

  it("lets an Admin look at a team member's tasks or everyone's", async () => {
    const { user } = await renderTasks();

    await user.click(await screen.findByRole("combobox", { name: "Assignee" }));
    await user.click(await screen.findByRole("option", { name: repUser.name }));
    await waitFor(() => {
      expect(listTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ assigneeId: repUser.id }),
      );
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(`/tasks?assignee=${repUser.id}`, {
      scroll: false,
    });

    await user.click(screen.getByRole("combobox", { name: "Assignee" }));
    await user.click(await screen.findByRole("option", { name: "Everyone" }));
    await waitFor(() => {
      expect(vi.mocked(listTasks).mock.lastCall?.[0]).not.toHaveProperty("assigneeId");
    });
  });

  it("gives a Sales Manager the Assignee filter and a Sales Rep none", async () => {
    await renderTasks(managerUser);
    expect(await screen.findByRole("combobox", { name: "Assignee" })).toBeInTheDocument();
  });

  it("shows a Sales Rep only their own tasks, without an Assignee filter", async () => {
    await renderTasks(repUser);

    await screen.findByRole("region", { name: "Overdue" });
    expect(screen.queryByRole("combobox", { name: "Assignee" })).not.toBeInTheDocument();
    expect(listAssignableUsers).not.toHaveBeenCalled();
    expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: repUser.id }));
  });

  it("shows a Read-only user everyone's tasks and nothing to change", async () => {
    await renderTasks(readOnlyUser);

    await screen.findByRole("region", { name: "Overdue" });
    expect(vi.mocked(listTasks).mock.calls[0]?.[0]).not.toHaveProperty("assigneeId");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
  });

  it("searches by title and narrows to one group, both kept in the address", async () => {
    const { user } = await renderTasks(adminUser, "search=quote&due=overdue");

    await screen.findByRole("region", { name: "Overdue" });
    expect(screen.queryByRole("region", { name: "Due today" })).not.toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith(expect.objectContaining({ search: "quote" }));

    await user.click(screen.getByRole("combobox", { name: "Due" }));
    await user.click(await screen.findByRole("option", { name: "Any time" }));
    expect(await screen.findByRole("region", { name: "Due today" })).toBeInTheDocument();
  });

  it("takes a ticked task out of its group at once, before the API has answered", async () => {
    const request = deferred<Task>();
    const { user } = await renderTasks();
    vi.mocked(completeTask).mockReturnValue(request.promise);

    await user.click(await screen.findByRole("checkbox", { name: `Complete ${sendQuote.title}` }));

    expect(screen.queryByText(sendQuote.title)).not.toBeInTheDocument();
    expect(within(group("Overdue")).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Overdue0",
    );
    expect(completeTask).toHaveBeenCalledWith(sendQuote.id);

    request.resolve({ ...sendQuote, status: "DONE" });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Task completed.", expect.anything());
    });
  });

  it("puts the task back and says so when the API refuses to complete it", async () => {
    const request = deferred<Task>();
    const { user } = await renderTasks();
    vi.mocked(completeTask).mockReturnValue(request.promise);

    await user.click(await screen.findByRole("checkbox", { name: `Complete ${sendQuote.title}` }));
    expect(screen.queryByText(sendQuote.title)).not.toBeInTheDocument();

    request.reject(forbidden);

    expect(await screen.findByText(sendQuote.title)).toBeInTheDocument();
    expect(titlesIn("Overdue")).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("could not be completed and is back in the list"),
    );
    expect(screen.getByRole("checkbox", { name: `Complete ${sendQuote.title}` })).not.toBeChecked();
  });

  it("says when there are no open tasks, and offers to add one", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    setMockLocation("/tasks");
    renderWithStore(<TasksPage />, { me: adminUser });

    expect(await screen.findByText("No open tasks")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New task" })).toHaveLength(2);
  });

  it("shows a failed load with Retry", async () => {
    vi.mocked(listTasks).mockRejectedValue(forbidden);
    setMockLocation("/tasks");
    const { user } = renderWithStore(<TasksPage />, { me: repUser });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
    vi.mocked(listTasks).mockImplementation(answerWith(groups));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(sendQuote.title)).toBeInTheDocument();
  });

  describe("the Done view", () => {
    it("lists completed tasks, and unticking one reopens it", async () => {
      vi.mocked(reopenTask).mockResolvedValue({ ...doneTask, status: "OPEN", completedAt: null });
      const { user } = await renderTasks(adminUser, "view=done");

      const list = await screen.findByRole("list", { name: "Completed tasks" });
      expect(within(list).getByText(doneTask.title)).toBeInTheDocument();
      expect(listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ status: "DONE", assigneeId: adminUser.id, page: 1 }),
      );

      const checkbox = within(list).getByRole("checkbox", { name: `Reopen ${doneTask.title}` });
      expect(checkbox).toBeChecked();
      await user.click(checkbox);

      await waitFor(() => {
        expect(reopenTask).toHaveBeenCalledWith(doneTask.id);
      });
      expect(toast.success).toHaveBeenCalledWith("Task reopened.");
    });

    it("is reached with the Open / Done switch, which lives in the address", async () => {
      const { user } = await renderTasks();

      await user.click(screen.getByRole("button", { name: "Done" }));

      expect(mockRouter.replace).toHaveBeenLastCalledWith("/tasks?view=done", { scroll: false });
      expect(await screen.findByRole("list", { name: "Completed tasks" })).toBeInTheDocument();
    });
  });

  describe("the task dialog", () => {
    async function openNew() {
      const view = await renderTasks();
      await view.user.click(screen.getByRole("button", { name: "New task" }));
      const dialog = await screen.findByRole("dialog", { name: "New task" });
      return { ...view, dialog };
    }

    it("offers the five reminder choices", async () => {
      const { user, dialog } = await openNew();

      await user.click(within(dialog).getByRole("combobox", { name: "Reminder" }));

      expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
        "None",
        "At due time",
        "1 hour before",
        "1 day before",
        "Custom date and time",
      ]);
    });

    it("needs a title, and a due date for a reminder that counts back from it", async () => {
      const { user, dialog } = await openNew();

      await user.click(within(dialog).getByRole("combobox", { name: "Reminder" }));
      await user.click(await screen.findByRole("option", { name: "1 hour before" }));
      await user.click(within(dialog).getByRole("button", { name: "Add task" }));

      expect(await within(dialog).findByText("Enter a title.")).toBeInTheDocument();
      expect(
        within(dialog).getByText("Set a due date first, or choose a custom date and time."),
      ).toBeInTheDocument();
      expect(createTask).not.toHaveBeenCalled();
    });

    it("creates a task for the viewer, with the reminder an hour before it is due", async () => {
      vi.mocked(createTask).mockResolvedValue(sendQuote);
      const { user, dialog } = await openNew();

      await user.type(within(dialog).getByLabelText("Title"), "Send the revised quote");
      fireEvent.change(within(dialog).getByLabelText("Due date and time"), {
        target: { value: "2026-10-20T09:00" },
      });
      await user.click(within(dialog).getByRole("combobox", { name: "Reminder" }));
      await user.click(await screen.findByRole("option", { name: "1 hour before" }));
      await user.click(within(dialog).getByRole("button", { name: "Add task" }));

      await waitFor(() => {
        expect(createTask).toHaveBeenCalledWith({
          title: "Send the revised quote",
          dueAt: new Date("2026-10-20T09:00").toISOString(),
          assigneeId: adminUser.id,
          reminderAt: new Date("2026-10-20T08:00").toISOString(),
        });
      });
      expect(toast.success).toHaveBeenCalledWith("Task added.");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("takes a custom reminder moment, and another assignee", async () => {
      vi.mocked(createTask).mockResolvedValue(callBack);
      const { user, dialog } = await openNew();

      await user.type(within(dialog).getByLabelText("Title"), "Call back");
      await user.click(within(dialog).getByRole("combobox", { name: "Assignee" }));
      await user.click(await screen.findByRole("option", { name: repUser.name }));
      await user.click(within(dialog).getByRole("combobox", { name: "Reminder" }));
      await user.click(await screen.findByRole("option", { name: "Custom date and time" }));
      await user.click(within(dialog).getByRole("button", { name: "Add task" }));
      expect(await within(dialog).findByText("Enter when to be reminded.")).toBeInTheDocument();

      fireEvent.change(within(dialog).getByLabelText("Remind at"), {
        target: { value: "2026-10-19T17:30" },
      });
      await user.click(within(dialog).getByRole("button", { name: "Add task" }));

      await waitFor(() => {
        expect(createTask).toHaveBeenCalledWith({
          title: "Call back",
          assigneeId: repUser.id,
          reminderAt: new Date("2026-10-19T17:30").toISOString(),
        });
      });
    });

    it("needs the record once a record type is chosen", async () => {
      const { user, dialog } = await openNew();

      await user.type(within(dialog).getByLabelText("Title"), "Call back");
      await user.click(within(dialog).getByRole("combobox", { name: "Linked to" }));
      await user.click(await screen.findByRole("option", { name: "Opportunity" }));
      expect(within(dialog).getByRole("button", { name: "Opportunity: none" })).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Add task" }));

      expect(
        await within(dialog).findByText("Choose the opportunity, or link the task to nothing."),
      ).toBeInTheDocument();
      expect(createTask).not.toHaveBeenCalled();
    });

    it("puts the server's message on the field it names, and any other error above the form", async () => {
      vi.mocked(createTask)
        .mockRejectedValueOnce({
          code: "VALIDATION_FAILED",
          message: "Invalid",
          details: [{ path: "assigneeId", message: "Choose a user you can assign tasks to" }],
        })
        .mockRejectedValueOnce(forbidden);
      const { user, dialog } = await openNew();

      await user.type(within(dialog).getByLabelText("Title"), "Call back");
      await user.click(within(dialog).getByRole("button", { name: "Add task" }));
      expect(
        await within(dialog).findByText("Choose a user you can assign tasks to"),
      ).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Add task" }));
      expect(
        await within(dialog).findByText("You do not have permission to do that."),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Title")).toHaveValue("Call back");
    });

    it("opens a task from its title and sends only what changed", async () => {
      vi.mocked(updateTask).mockResolvedValue({ ...sendQuote, title: "Send the final quote" });
      const { user } = await renderTasks();

      await user.click(await screen.findByRole("button", { name: sendQuote.title }));
      const dialog = await screen.findByRole("dialog", { name: "Edit task" });
      expect(within(dialog).getByLabelText("Title")).toHaveValue(sendQuote.title);
      expect(within(dialog).getByLabelText("Description")).toHaveValue(sendQuote.description);
      expect(within(dialog).getByRole("combobox", { name: "Reminder" })).toHaveTextContent(
        "1 hour before",
      );
      expect(within(dialog).getByRole("button", { name: "Lead: Marcus Chen" })).toBeInTheDocument();

      await user.clear(within(dialog).getByLabelText("Title"));
      await user.type(within(dialog).getByLabelText("Title"), "Send the final quote");
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

      await waitFor(() => {
        expect(updateTask).toHaveBeenCalledWith(sendQuote.id, { title: "Send the final quote" });
      });
      expect(toast.success).toHaveBeenCalledWith("Task saved.");
    });

    it("clears the link and the reminder with null", async () => {
      vi.mocked(updateTask).mockResolvedValue(sendQuote);
      const { user } = await renderTasks();

      await user.click(await screen.findByRole("button", { name: sendQuote.title }));
      const dialog = await screen.findByRole("dialog", { name: "Edit task" });
      await user.click(within(dialog).getByRole("combobox", { name: "Linked to" }));
      await user.click(await screen.findByRole("option", { name: "Nothing" }));
      await user.click(within(dialog).getByRole("combobox", { name: "Reminder" }));
      await user.click(await screen.findByRole("option", { name: "None" }));
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

      await waitFor(() => {
        expect(updateTask).toHaveBeenCalledWith(sendQuote.id, { record: null, reminderAt: null });
      });
    });

    it("deletes a task after asking", async () => {
      vi.mocked(deleteTask).mockResolvedValue();
      const { user } = await renderTasks();

      await user.click(await screen.findByRole("button", { name: sendQuote.title }));
      const dialog = await screen.findByRole("dialog", { name: "Edit task" });
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      const confirm = await screen.findByRole("alertdialog");
      await user.click(within(confirm).getByRole("button", { name: /Delete/ }));

      await waitFor(() => {
        expect(deleteTask).toHaveBeenCalledWith(sendQuote.id);
      });
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens the task named by ?open= and takes it out of the address when closed", async () => {
      vi.mocked(getTask).mockResolvedValue(prepareDeck);
      const { user } = await renderTasks(adminUser, `open=${prepareDeck.id}`);

      const dialog = await screen.findByRole("dialog", { name: "Edit task" });
      expect(getTask).toHaveBeenCalledWith(prepareDeck.id);
      expect(within(dialog).getByLabelText("Title")).toHaveValue(prepareDeck.title);

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(mockRouter.replace).toHaveBeenLastCalledWith("/tasks", { scroll: false });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("says so when the task of ?open= is gone, and clears the address", async () => {
      vi.mocked(getTask).mockRejectedValue({ code: "NOT_FOUND", message: "x", details: null });
      await renderTasks(adminUser, "open=missing&due=today");

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "That task no longer exists, or is not yours to see.",
        );
      });
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/tasks?due=today", { scroll: false });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows a Read-only user the task without a form", async () => {
      vi.mocked(getTask).mockResolvedValue(sendQuote);
      await renderTasks(readOnlyUser, `open=${sendQuote.id}`);

      const dialog = await screen.findByRole("dialog", { name: sendQuote.title });
      expect(within(dialog).getByText("Include the volume discount.")).toBeInTheDocument();
      expect(within(dialog).getByRole("link", { name: "Marcus Chen" })).toBeInTheDocument();
      expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Save changes" }),
      ).not.toBeInTheDocument();
    });
  });
});
