import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getInvoiceSummary } from "@/features/invoices/invoices.api";
import { emptySummary, summary as invoiceSummary } from "@/features/invoices/invoices.fixtures";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { completeTask } from "@/features/tasks/tasks.api";
import { callBack, sendQuote } from "@/features/tasks/tasks.fixtures";
import type { ApiError } from "@/lib/api/http";
import { mockRouter } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { getMyDashboard, getTeamDashboard } from "./dashboard.api";
import { busy, empty, team } from "./dashboard.fixtures";
import { teamRangeDays } from "./dashboard-labels";
import { DashboardPage } from "./dashboard-page";

vi.mock("./dashboard.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/invoices/invoices.api");
vi.mock("sonner");

const unavailable: ApiError = { code: "SERVICE_UNAVAILABLE", message: "Down", details: null };

async function renderHome(me: Me = repUser, dashboard = busy) {
  vi.mocked(getMyDashboard).mockResolvedValue(dashboard);
  vi.mocked(getTeamDashboard).mockResolvedValue(team);
  const view = renderWithStore(<DashboardPage />, { me });
  await screen.findByRole("list", { name: "Your numbers" });
  return view;
}

const tile = (label: string) => {
  const link = screen.getByText(label).closest("a");
  if (!link) {
    throw new Error(`No tile labelled ${label}`);
  }
  return link;
};

const teamTable = () => screen.findByRole("table", { name: "Team figures" });
const firstColumn = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getInvoiceSummary).mockResolvedValue(invoiceSummary);
  });

  it("greets the user and shows the headline numbers, each a link to its list", async () => {
    await renderHome();

    expect(screen.getByRole("heading", { level: 1, name: `Hello, ${repUser.name}` })).toBeVisible();
    expect(tile("Open leads")).toHaveTextContent("18");
    expect(tile("Open leads")).toHaveAttribute("href", "/leads");
    expect(tile("Pipeline value")).toHaveTextContent("$84,500");
    expect(tile("Pipeline value")).toHaveTextContent("10 open deals");
    expect(tile("Pipeline value")).toHaveAttribute("href", "/opportunities");
    expect(tile("Tasks due today")).toHaveTextContent("5");
    expect(tile("Tasks due today")).toHaveAttribute("href", "/tasks?due=today");
    expect(tile("Overdue tasks")).toHaveTextContent("2");
    expect(tile("Overdue tasks")).toHaveAttribute("href", "/tasks?due=overdue");
    expect(tile("Won this month")).toHaveTextContent("$58,200");
    expect(tile("Won this month")).toHaveTextContent("3 deals");
    expect(tile("Won this month")).toHaveAttribute("href", "/opportunities?view=list&status=WON");
  });

  // At text-2xl a half-width tile on a 375px phone broke "$126,000.50" onto two lines.
  it("sets the headline numbers smaller on a phone so a money value fits its tile", async () => {
    await renderHome();

    const value = tile("Pipeline value").querySelector("[data-slot=stat-value]");
    expect(value).toHaveClass("text-lg", "sm:text-2xl");
  });

  it("narrows the lists to the user's own records for someone who sees the team's too", async () => {
    await renderHome(adminUser);

    expect(tile("Open leads")).toHaveAttribute("href", `/leads?ownerId=${adminUser.id}`);
    expect(tile("Won this month")).toHaveAttribute(
      "href",
      `/opportunities?view=list&status=WON&ownerId=${adminUser.id}`,
    );
  });

  it("lists the pipeline by stage and the open leads by status, with value and count in words", async () => {
    await renderHome();

    const stages = within(screen.getByRole("list", { name: "Pipeline by stage" })).getAllByRole(
      "listitem",
    );
    expect(stages.map((row) => row.textContent)).toEqual([
      "New6 deals · $14,000",
      "Proposal4 deals · $70,500",
      "Negotiation0 deals · $0",
    ]);
    expect(within(stages[1] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      "/opportunities?view=list&stageId=stage-proposal",
    );

    const statuses = within(
      screen.getByRole("list", { name: "Open leads by status" }),
    ).getAllByRole("listitem");
    expect(statuses.map((row) => row.textContent)).toEqual([
      "New10 leads",
      "Contacted6 leads",
      "Qualified2 leads",
    ]);
    expect(within(statuses[0] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      "/leads?status=NEW",
    );
  });

  it("lists the follow-ups that are due, each a link to its record", async () => {
    await renderHome();

    const list = screen.getByRole("list", { name: "Follow-ups due" });
    expect(within(list).getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      "/leads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    );
    expect(within(list).getByRole("link", { name: "Northwind - Fleet Expansion" })).toHaveAttribute(
      "href",
      "/opportunities/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    );
    expect(within(list).getByText("Ask about the budget")).toBeInTheDocument();
    expect(within(list).getAllByText(/^Overdue · /)).toHaveLength(2);
  });

  it("completes a task from the Tasks due list and loads the numbers again", async () => {
    vi.mocked(completeTask).mockResolvedValue({ ...sendQuote, status: "DONE" });
    const { user } = await renderHome();
    const list = screen.getByRole("list", { name: "Tasks due" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    await user.click(within(list).getByRole("checkbox", { name: `Complete ${sendQuote.title}` }));

    expect(within(list).queryByText(sendQuote.title)).not.toBeInTheDocument();
    expect(completeTask).toHaveBeenCalledWith(sendQuote.id);
    await waitFor(() => {
      expect(getMyDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it("opens a task from the list on the Tasks page", async () => {
    const { user } = await renderHome();

    await user.click(screen.getByRole("button", { name: callBack.title }));

    expect(mockRouter.push).toHaveBeenCalledWith(`/tasks?open=${callBack.id}`);
  });

  it("has sensible empty states for a brand-new install", async () => {
    await renderHome(repUser, empty);

    expect(tile("Open leads")).toHaveTextContent("0");
    expect(tile("Pipeline value")).toHaveTextContent("$0");
    expect(tile("Won this month")).toHaveTextContent("0 deals");
    expect(screen.getByText("Nothing is due today.")).toBeInTheDocument();
    expect(screen.getByText(/No follow-ups are due/)).toBeInTheDocument();
    expect(screen.getByText(/No open opportunities yet/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Open leads by status" })).toBeInTheDocument();
  });

  it("shows a loading state, then a failed load with Retry", async () => {
    vi.mocked(getMyDashboard).mockRejectedValueOnce(unavailable).mockResolvedValue(busy);
    const { user } = renderWithStore(<DashboardPage />, { me: repUser });

    expect(screen.getByRole("status", { name: "Loading your dashboard" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The service is temporarily unavailable. Try again in a moment.",
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list", { name: "Your numbers" })).toBeInTheDocument();
  });

  describe("the Invoices card", () => {
    const invoiceTile = (label: string) => {
      const link = within(screen.getByRole("list", { name: "Invoice totals" }))
        .getByText(label)
        .closest("a");
      if (!link) {
        throw new Error(`No invoice tile labelled ${label}`);
      }
      return link;
    };

    it("shows what is outstanding and overdue for every role, each a link to the invoices", async () => {
      for (const me of [repUser, readOnlyUser, managerUser, adminUser]) {
        const { unmount } = await renderHome(me);

        await screen.findByRole("list", { name: "Invoice totals" });
        expect(invoiceTile("Outstanding")).toHaveTextContent("$13,804.20");
        expect(invoiceTile("Outstanding")).toHaveTextContent("2 sent · 1 overdue");
        expect(invoiceTile("Outstanding")).toHaveAttribute("href", "/invoices");
        expect(invoiceTile("Overdue")).toHaveTextContent("$7,547.35");
        expect(invoiceTile("Overdue")).toHaveTextContent("1 invoice");
        expect(invoiceTile("Overdue")).toHaveAttribute("href", "/invoices?status=OVERDUE");
        // Home shows two of the three totals; "Paid this month" is on the invoices page.
        expect(screen.queryByText("Paid this month")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "All invoices" })).toHaveAttribute(
          "href",
          "/invoices",
        );
        // The totals are not the user's own figures like the rest of the dashboard.
        expect(screen.getByText(/Across every invoice you can see/)).toBeInTheDocument();
        unmount();
      }
    });

    it("shows zeros on a brand-new install", async () => {
      vi.mocked(getInvoiceSummary).mockResolvedValue(emptySummary);
      await renderHome(repUser, empty);

      await screen.findByRole("list", { name: "Invoice totals" });
      expect(invoiceTile("Outstanding")).toHaveTextContent("$0");
      expect(invoiceTile("Overdue")).toHaveTextContent("0 invoices");
    });

    it("has its own loading state and its own error with Retry, and leaves the rest of Home alone", async () => {
      vi.mocked(getInvoiceSummary).mockRejectedValueOnce(unavailable);
      const { user } = await renderHome();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "The invoice totals could not be loaded. The service is temporarily unavailable. Try again in a moment.",
      );
      expect(screen.getByRole("list", { name: "Your numbers" })).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Tasks due" })).toBeInTheDocument();

      await user.click(within(alert).getByRole("button", { name: "Retry" }));
      expect(await screen.findByRole("list", { name: "Invoice totals" })).toBeInTheDocument();
      expect(getMyDashboard).toHaveBeenCalledTimes(1);
    });

    it("stays a placeholder while the totals are on their way", async () => {
      vi.mocked(getInvoiceSummary).mockReturnValue(new Promise(() => undefined));
      await renderHome();

      expect(screen.getByRole("status", { name: "Loading invoice totals" })).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Your numbers" })).toBeInTheDocument();
    });
  });

  describe("the Team section", () => {
    it("is never shown to a Sales Rep, and never asked for", async () => {
      await renderHome(repUser);

      expect(screen.queryByRole("region", { name: "Team" })).not.toBeInTheDocument();
      expect(getTeamDashboard).not.toHaveBeenCalled();
    });

    it("gives a Read-only user the lists without checkboxes", async () => {
      await renderHome(readOnlyUser);

      expect(screen.getByRole("list", { name: "Tasks due" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("shows an Admin, a Sales Manager and a Read-only user each person's figures for this month, with totals", async () => {
      for (const me of [adminUser, managerUser, readOnlyUser]) {
        const { unmount } = await renderHome(me);
        const table = await teamTable();
        expect(firstColumn(table)).toEqual([
          "Alex RiveraSales Rep",
          "Marcus ChenSales Rep",
          "Zoe OldSales Rep · Deactivated",
          "Total",
        ]);
        const marcus = within(table).getAllByRole("row")[2] as HTMLElement;
        expect(
          within(marcus)
            .getAllByRole("cell")
            .slice(1)
            .map((cell) => cell.textContent),
        ).toEqual(["4", "22", "48", "5", "1", "$24,500", "$80,000", "1"]);
        const totals = within(table).getAllByRole("row").at(-1) as HTMLElement;
        expect(
          within(totals)
            .getAllByRole("cell")
            .slice(1)
            .map((cell) => cell.textContent),
        ).toEqual(["9", "40", "87", "9", "3", "$43,700", "$150,000", "4"]);
        unmount();
      }
      expect(getTeamDashboard).toHaveBeenCalledWith(
        teamRangeDays("this-month", { from: "", to: "" }),
      );
    });

    it("sorts in the browser by a column heading, highest first, then the other way", async () => {
      const { user } = await renderHome(adminUser);
      const table = await teamTable();

      await user.click(within(table).getByRole("button", { name: "Won value" }));
      expect(firstColumn(table).slice(0, 3)).toEqual([
        "Marcus ChenSales Rep",
        "Zoe OldSales Rep · Deactivated",
        "Alex RiveraSales Rep",
      ]);
      expect(within(table).getByRole("columnheader", { name: "Won value" })).toHaveAttribute(
        "aria-sort",
        "descending",
      );

      await user.click(within(table).getByRole("button", { name: "Won value" }));
      expect(firstColumn(table)[0]).toBe("Alex RiveraSales Rep");
      // The totals stay at the bottom, and nothing was asked of the API again.
      expect(firstColumn(table).at(-1)).toBe("Total");
      expect(getTeamDashboard).toHaveBeenCalledTimes(1);
    });

    it("shows the same figures as cards for narrow screens", async () => {
      await renderHome(adminUser);

      const cards = within(await screen.findByRole("list", { name: "Team figures" })).getAllByRole(
        "listitem",
      );
      expect(cards).toHaveLength(4);
      expect(cards[1]).toHaveTextContent("Marcus Chen");
      expect(cards[1]).toHaveTextContent("Won value$24,500");
      expect(cards[3]).toHaveTextContent("Total");
    });

    it("asks again for another range, and for custom dates", async () => {
      const { user } = await renderHome(managerUser);
      await teamTable();

      await user.click(screen.getByRole("combobox", { name: "Date range" }));
      await user.click(await screen.findByRole("option", { name: "Last month" }));
      await waitFor(() => {
        expect(getTeamDashboard).toHaveBeenLastCalledWith(
          teamRangeDays("last-month", { from: "", to: "" }),
        );
      });

      fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-05" } });
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-02-01" } });
      await waitFor(() => {
        expect(getTeamDashboard).toHaveBeenLastCalledWith({ from: "2026-01-05", to: "2026-02-01" });
      });
      expect(screen.getByRole("combobox", { name: "Date range" })).toHaveTextContent("Custom");
    });

    it("has its own error with Retry, and leaves the user's own dashboard on screen", async () => {
      vi.mocked(getMyDashboard).mockResolvedValue(busy);
      vi.mocked(getTeamDashboard).mockRejectedValueOnce(unavailable).mockResolvedValue(team);
      const { user } = renderWithStore(<DashboardPage />, { me: adminUser });

      const section = await screen.findByRole("region", { name: "Team" });
      expect(await within(section).findByRole("alert")).toHaveTextContent(
        "The service is temporarily unavailable. Try again in a moment.",
      );
      expect(screen.getByRole("list", { name: "Your numbers" })).toBeInTheDocument();

      await user.click(within(section).getByRole("button", { name: "Retry" }));
      expect(await teamTable()).toBeInTheDocument();
    });

    it("says so when the team is empty", async () => {
      vi.mocked(getMyDashboard).mockResolvedValue(empty);
      vi.mocked(getTeamDashboard).mockResolvedValue({ ...team, reps: [] });
      renderWithStore(<DashboardPage />, { me: managerUser });

      expect(await screen.findByText("No one on your team yet")).toBeInTheDocument();
    });
  });
});
