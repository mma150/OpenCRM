import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import {
  newStage,
  pipeline,
  proposalStage,
  qualifiedStage,
} from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { followNavigation, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  closeOpportunity,
  getBoard,
  moveOpportunity,
  reopenOpportunity,
} from "./opportunities.api";
import { board, fleet, inStage, wonDeal } from "./opportunities.fixtures";
import type { BoardColumn, Opportunity } from "./opportunities.types";
import { OpportunitiesPage } from "./opportunities-page";

vi.mock("./opportunities.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/users/users.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };

async function renderBoard(me: Me = adminUser, columns: BoardColumn[] = board()) {
  vi.mocked(getBoard).mockResolvedValue(columns);
  const view = renderWithStore(<OpportunitiesPage />, { me });
  await screen.findByRole("region", { name: "Pipeline board" });
  return view;
}

// The column of a stage, and the card of an opportunity. `hidden` finds them behind an open
// dialog too, which hides the rest of the page from assistive technology.
const column = (name: string) => screen.getByRole("region", { name, hidden: true });
function card(name: string): HTMLElement {
  const found = screen.getByRole("link", { name, hidden: true }).closest("li");
  if (!found) {
    throw new Error(`No card for ${name}`);
  }
  return found;
}
const cardNames = (stage: string) =>
  within(column(stage))
    .queryAllByRole("listitem", { hidden: true })
    .map((item) => within(item).getAllByRole("link", { hidden: true })[0]?.textContent);

async function openMoveMenu(user: TestUser, name: string) {
  await user.click(screen.getByRole("button", { name: `Move ${name} to another stage` }));
  return within(await screen.findByRole("menu"));
}

// A promise the test settles by hand, so the move stays "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: ApiError) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// What a real drag hands to every drag event.
const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };

function drag(name: string, onto: string) {
  fireEvent.dragStart(card(name), { dataTransfer });
  fireEvent.dragOver(column(onto), { dataTransfer });
  fireEvent.drop(column(onto), { dataTransfer });
}

describe("OpportunityBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    setMockLocation("/opportunities");
    followNavigation();
  });

  it("shows a column for each stage with its count and total, and the cards in it", async () => {
    await renderBoard();

    expect(getBoard).toHaveBeenCalledWith({});
    const fresh = within(column("New"));
    expect(fresh.getByRole("heading", { name: "New" })).toBeInTheDocument();
    expect(fresh.getByLabelText("2 opportunities")).toHaveTextContent("2");
    // The column's total, and the one card that is worth anything.
    expect(fresh.getAllByText("$48,000")).toHaveLength(2);
    expect(cardNames("New")).toEqual(["Fleet Expansion", "Walk-in enquiry"]);
    expect(cardNames("Qualified")).toEqual(["Vision Platform"]);
    expect(within(column("Won")).getAllByText("$96,000")).toHaveLength(2);

    const fleetCard = within(card("Fleet Expansion"));
    expect(fleetCard.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${fleet.id}`,
    );
    expect(fleetCard.getByText("Northwind Logistics")).toBeInTheDocument();
    expect(fleetCard.getByText("Nov 15, 2026")).toBeInTheDocument();
    expect(fleetCard.getByText("Rob Rep")).toBeInTheDocument();
  });

  it("moves a card from its menu at once, and confirms when the API has answered", async () => {
    const request = deferred<Opportunity>();
    vi.mocked(moveOpportunity).mockReturnValue(request.promise);
    const { user } = await renderBoard();

    const menu = await openMoveMenu(user, "Fleet Expansion");
    // Every other open stage, then the two ways to close.
    expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Qualified",
      "Proposal",
      "Negotiation",
      "Close as won",
      "Close as lost",
    ]);
    await user.click(menu.getByRole("menuitem", { name: "Proposal" }));

    // The card is in its new column before the API has answered.
    expect(cardNames("Proposal")).toEqual(["Fleet Expansion"]);
    expect(cardNames("New")).toEqual(["Walk-in enquiry"]);
    expect(within(column("Proposal")).getByLabelText("1 opportunities")).toBeInTheDocument();
    expect(moveOpportunity).toHaveBeenCalledWith(fleet.id, proposalStage.id);
    expect(toast.success).not.toHaveBeenCalled();

    request.resolve(inStage(fleet, proposalStage));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Fleet Expansion moved to Proposal.");
    });
    expect(cardNames("Proposal")).toEqual(["Fleet Expansion"]);
  });

  it("puts the card back and says so when the API refuses the move", async () => {
    const request = deferred<Opportunity>();
    vi.mocked(moveOpportunity).mockReturnValue(request.promise);
    const { user } = await renderBoard();

    const menu = await openMoveMenu(user, "Walk-in enquiry");
    await user.click(menu.getByRole("menuitem", { name: "Qualified" }));
    expect(cardNames("Qualified")).toEqual(["Walk-in enquiry", "Vision Platform"]);

    request.reject(forbidden);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Walk-in enquiry could not be moved. You do not have permission to do that.",
      );
    });
    // Back in its old column, in its old place.
    expect(cardNames("New")).toEqual(["Fleet Expansion", "Walk-in enquiry"]);
    expect(cardNames("Qualified")).toEqual(["Vision Platform"]);
  });

  it("moves a card that is dragged onto another open stage", async () => {
    vi.mocked(moveOpportunity).mockResolvedValue(inStage(fleet, qualifiedStage));
    await renderBoard();

    expect(card("Fleet Expansion")).toHaveAttribute("draggable", "true");
    drag("Fleet Expansion", "Qualified");

    expect(moveOpportunity).toHaveBeenCalledWith(fleet.id, qualifiedStage.id);
    await waitFor(() => {
      expect(cardNames("Qualified")).toEqual(["Fleet Expansion", "Vision Platform"]);
    });
  });

  it("does nothing when a card is dropped on its own column", async () => {
    await renderBoard();

    drag("Fleet Expansion", "New");

    expect(moveOpportunity).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for the reason when a card is dropped on Lost, and needs one", async () => {
    vi.mocked(closeOpportunity).mockResolvedValue({ ...fleet, status: "LOST" });
    const { user } = await renderBoard();

    drag("Fleet Expansion", "Lost");

    const dialog = within(
      await screen.findByRole("dialog", { name: "Close Fleet Expansion as lost" }),
    );
    expect(moveOpportunity).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Close as lost" }));
    expect(await dialog.findByText("Say why the opportunity was lost.")).toBeInTheDocument();
    expect(closeOpportunity).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText("Reason"), " Chose a competitor ");
    await user.click(dialog.getByRole("button", { name: "Close as lost" }));

    await waitFor(() => {
      expect(closeOpportunity).toHaveBeenCalledWith(fleet.id, {
        outcome: "LOST",
        reason: "Chose a competitor",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Fleet Expansion was closed as lost.");
  });

  it("closes as won from the card's menu, with or without a reason", async () => {
    vi.mocked(closeOpportunity).mockResolvedValue({ ...fleet, status: "WON" });
    const { user } = await renderBoard();

    const menu = await openMoveMenu(user, "Fleet Expansion");
    await user.click(menu.getByRole("menuitem", { name: "Close as won" }));
    const dialog = within(
      await screen.findByRole("dialog", { name: "Close Fleet Expansion as won" }),
    );
    await user.click(dialog.getByRole("button", { name: "Close as won" }));

    await waitFor(() => {
      expect(closeOpportunity).toHaveBeenCalledWith(fleet.id, { outcome: "WON" });
    });
  });

  it("keeps the close dialog open and explains when the API refuses", async () => {
    vi.mocked(closeOpportunity).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "x",
      details: [{ path: "reason", message: "Say why the opportunity was lost" }],
    });
    const { user } = await renderBoard();

    drag("Fleet Expansion", "Lost");
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Reason"), "x");
    await user.click(dialog.getByRole("button", { name: "Close as lost" }));

    expect(await dialog.findByText("Say why the opportunity was lost")).toBeInTheDocument();
    // The card did not move: closing is not optimistic.
    expect(cardNames("New")).toEqual(["Fleet Expansion", "Walk-in enquiry"]);
  });

  it("offers a closed card Reopen only, and does not let it be dragged", async () => {
    vi.mocked(reopenOpportunity).mockResolvedValue(inStage(wonDeal, newStage));
    const { user } = await renderBoard();

    expect(card("Guest App")).not.toHaveAttribute("draggable");
    const menu = await openMoveMenu(user, "Guest App");
    expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Reopen"]);
    await user.click(menu.getByRole("menuitem", { name: "Reopen" }));

    await waitFor(() => {
      expect(reopenOpportunity).toHaveBeenCalledWith(wonDeal.id);
    });
    expect(toast.success).toHaveBeenCalledWith("Guest App was reopened in New.");
  });

  it("shows one stage at a time on a phone, chosen with the stage buttons", async () => {
    const { user } = await renderBoard();

    const stages = within(screen.getByRole("group", { name: "Stage" }));
    expect(stages.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "New2",
      "Qualified1",
      "Proposal0",
      "Negotiation0",
      "Won1",
      "Lost1",
    ]);
    expect(stages.getByRole("button", { name: /New/ })).toHaveAttribute("aria-pressed", "true");
    // Below `md` only the chosen column is displayed; from `md` all of them are.
    expect(column("New")).not.toHaveClass("max-md:hidden");
    expect(column("Qualified")).toHaveClass("max-md:hidden");

    await user.click(stages.getByRole("button", { name: /Qualified/ }));

    expect(stages.getByRole("button", { name: /Qualified/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(column("Qualified")).not.toHaveClass("max-md:hidden");
    expect(column("New")).toHaveClass("max-md:hidden");
  });

  it("says when a column shows only some of its cards, and links to the list for the rest", async () => {
    const columns = board().map((item) =>
      item.stage.id === newStage.id ? { ...item, count: 132, totalValue: 990000 } : item,
    );
    await renderBoard(adminUser, columns);

    const fresh = within(column("New"));
    expect(fresh.getByText(/Showing 2 of 132\./)).toBeInTheDocument();
    expect(fresh.getByRole("link", { name: "View all in the list" })).toHaveAttribute(
      "href",
      `/opportunities?view=list&stageId=${newStage.id}`,
    );
    expect(within(column("Qualified")).queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("gives a Read-only user the board without anything that moves a card", async () => {
    await renderBoard(readOnlyUser);

    expect(cardNames("New")).toEqual(["Fleet Expansion", "Walk-in enquiry"]);
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    expect(card("Fleet Expansion")).not.toHaveAttribute("draggable");
    expect(screen.queryByRole("link", { name: "New opportunity" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Drop a card here/)).not.toBeInTheDocument();

    // A drag the browser starts anyway (a link, selected text) moves nothing.
    drag("Fleet Expansion", "Qualified");
    expect(moveOpportunity).not.toHaveBeenCalled();
  });

  it("gives a Sales Rep the move menu and New opportunity", async () => {
    await renderBoard(repUser);

    expect(screen.getByRole("link", { name: "New opportunity" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move Fleet Expansion to another stage" }),
    ).toBeInTheDocument();
  });

  it("sends the search text and the owner from the address to the board", async () => {
    setMockLocation("/opportunities", `search=fleet&ownerId=${repUser.id}`);
    await renderBoard();

    expect(getBoard).toHaveBeenCalledWith({ search: "fleet", ownerId: repUser.id });
  });

  it("says when there are no opportunities yet, and when none match", async () => {
    vi.mocked(getBoard).mockResolvedValue(board([]));
    const { unmount } = renderWithStore(<OpportunitiesPage />, { me: adminUser });
    expect(await screen.findByText("No opportunities yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New opportunity" })).toHaveLength(2);
    unmount();

    setMockLocation("/opportunities", "search=zzz");
    const { user } = renderWithStore(<OpportunitiesPage />, { me: adminUser });
    expect(await screen.findByText("No opportunities match your filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(getBoard).toHaveBeenLastCalledWith({});
    });
  });

  it("explains a failed load and tries again", async () => {
    vi.mocked(getBoard).mockRejectedValueOnce({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    });
    const { user } = renderWithStore(<OpportunitiesPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    vi.mocked(getBoard).mockResolvedValue(board());
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("region", { name: "Pipeline board" })).toBeInTheDocument();
  });
});
