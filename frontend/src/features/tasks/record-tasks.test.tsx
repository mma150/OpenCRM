import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { adminUser, renderWithStore } from "@/test/render-with-store";

import { RecordTasks } from "./record-tasks";
import { completeTask, createTask, listTasks } from "./tasks.api";
import { callBack, sendQuote, taskList } from "./tasks.fixtures";

vi.mock("./tasks.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/leads/leads.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("sonner");

const LEAD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const forbidden: ApiError = { code: "FORBIDDEN", message: "Not allowed", details: null };

function renderCard(me: Me = adminUser) {
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
  return renderWithStore(
    <RecordTasks
      record={{ type: "lead", id: LEAD_ID }}
      recordName="Marcus Chen"
      canWrite={me.role !== "READ_ONLY"}
    />,
    { me },
  );
}

describe("RecordTasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists the record's open tasks, soonest first, without repeating the record", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([sendQuote, callBack]));
    renderCard();

    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("2 open")).toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Marcus Chen" })).not.toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith({
      recordType: "LEAD",
      recordId: LEAD_ID,
      status: "OPEN",
      sort: "dueAt",
      order: "asc",
      page: 1,
      pageSize: 5,
    });
  });

  it("completes a task from the card and loads the card again", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([sendQuote, callBack]));
    vi.mocked(completeTask).mockResolvedValue({ ...sendQuote, status: "DONE" });
    const { user } = renderCard();

    await user.click(await screen.findByRole("checkbox", { name: `Complete ${sendQuote.title}` }));

    expect(screen.queryByText(sendQuote.title)).not.toBeInTheDocument();
    expect(screen.getByText("1 open")).toBeInTheDocument();
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledTimes(2);
    });
  });

  it("adds a task with the record filled in", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    vi.mocked(createTask).mockResolvedValue(sendQuote);
    const { user } = renderCard();

    expect(await screen.findByText("No open tasks.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const dialog = await screen.findByRole("dialog", { name: "New task" });
    expect(within(dialog).getByRole("button", { name: "Lead: Marcus Chen" })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Title"), "Send the revised quote");
    await user.click(within(dialog).getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        title: "Send the revised quote",
        assigneeId: adminUser.id,
        record: { type: "LEAD", id: LEAD_ID },
      });
    });
    // The card loads its tasks again to show the new one.
    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledTimes(2);
    });
  });

  it("offers the rest when the record has more tasks than it shows", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([sendQuote], 8));
    const { user } = renderCard();

    await user.click(await screen.findByRole("button", { name: "Show all 8 tasks" }));

    await waitFor(() => {
      expect(listTasks).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 100 }));
    });
  });

  it("gives a Read-only user the list without checkboxes or Add task", async () => {
    vi.mocked(listTasks).mockResolvedValue(taskList([sendQuote]));
    renderCard(readOnlyUser);

    expect(await screen.findByText(sendQuote.title)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  });

  it("shows a failed load with Retry", async () => {
    vi.mocked(listTasks)
      .mockRejectedValueOnce(forbidden)
      .mockResolvedValue(taskList([sendQuote]));
    const { user } = renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(sendQuote.title)).toBeInTheDocument();
  });
});
