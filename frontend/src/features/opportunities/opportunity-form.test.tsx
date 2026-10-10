import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getCompany, listCompanies } from "@/features/companies/companies.api";
import { brightpath, companyList, northwind } from "@/features/companies/companies.fixtures";
import { getContact, listContacts } from "@/features/contacts/contacts.api";
import { contactList, liam, marcus } from "@/features/contacts/contacts.fixtures";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import {
  newStage,
  pipeline,
  proposalStage,
} from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { createOpportunity, getOpportunity, updateOpportunity } from "./opportunities.api";
import { fleet, walkIn, wonDeal } from "./opportunities.fixtures";
import { EditOpportunityPage, NewOpportunityPage } from "./opportunity-form-pages";

vi.mock("./opportunities.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/users/users.api");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const onlyRep = [{ id: repUser.id, name: repUser.name, role: "SALES_REP" as const }];

async function renderNew(me: Me = adminUser, owners = assignableUsers) {
  vi.mocked(listAssignableUsers).mockResolvedValue(owners);
  const view = renderWithStore(<NewOpportunityPage />, { me });
  await screen.findByLabelText("Name");
  return view;
}

async function renderEdit(opportunity = fleet, me: Me = adminUser) {
  vi.mocked(getOpportunity).mockResolvedValue(opportunity);
  const view = renderWithStore(<EditOpportunityPage id={opportunity.id} />, { me });
  await screen.findByLabelText("Name");
  return view;
}

// Opens a picker from its field and chooses a record in it.
async function pick(user: TestUser, field: string, current: string, name: string | RegExp) {
  await user.click(screen.getByRole("button", { name: `${field}: ${current}` }));
  await user.click(await screen.findByRole("button", { name }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

describe("NewOpportunityPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(listContacts).mockResolvedValue(contactList());
    setMockLocation("/opportunities/new");
  });

  it("creates an opportunity with only a name, in the first stage, then opens it", async () => {
    vi.mocked(createOpportunity).mockResolvedValue({ ...walkIn, id: "new-opportunity" });
    const { user } = await renderNew(repUser, onlyRep);

    // The stage starts on the first open one; Won and Lost are not offered.
    expect(screen.getByRole("combobox", { name: "Stage" })).toHaveTextContent("New");
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), " Walk-in enquiry ");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    await waitFor(() => {
      expect(createOpportunity).toHaveBeenCalledWith({
        name: "Walk-in enquiry",
        stageId: newStage.id,
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/opportunities/new-opportunity");
    });
  });

  it("sends every field: value as a number, the day, the stage, both links and the owner", async () => {
    vi.mocked(createOpportunity).mockResolvedValue(fleet);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Name"), "Fleet Expansion");
    await user.type(screen.getByLabelText("Value (USD)"), "48000.50");
    await user.type(screen.getByLabelText("Expected close date"), "2026-11-15");
    await user.type(screen.getByLabelText("Notes"), "Pilot first.");
    await pick(user, "Company", "none", "Northwind Logistics");
    await pick(user, "Contact", "none", /Marcus Chen/);
    await user.click(screen.getByRole("combobox", { name: "Stage" }));
    expect(screen.queryByRole("option", { name: "Won" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Proposal" }));
    await user.click(screen.getByRole("combobox", { name: "Owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    await waitFor(() => {
      expect(createOpportunity).toHaveBeenCalledWith({
        name: "Fleet Expansion",
        value: 48000.5,
        expectedCloseDate: "2026-11-15",
        stageId: proposalStage.id,
        companyId: northwind.id,
        contactId: marcus.id,
        notes: "Pilot first.",
        ownerId: managerUser.id,
      });
    });
  }, 20_000);

  it("shows each contact's company in the contact picker", async () => {
    const { user } = await renderNew();

    await user.click(screen.getByRole("button", { name: "Contact: none" }));

    const row = await screen.findByRole("button", { name: /Marcus Chen/ });
    expect(row).toHaveTextContent("Northwind Logistics");
    expect(listContacts).toHaveBeenCalledWith({
      sort: "name",
      order: "asc",
      page: 1,
      pageSize: 20,
    });
  });

  it("refuses a missing name and a value that is not an amount, and sends nothing", async () => {
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Value (USD)"), "12.345");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount such as 48000 or 48000.50.")).toBeInTheDocument();
    expect(createOpportunity).not.toHaveBeenCalled();
  });

  it("puts the API's field errors on the fields, and any other error above the form", async () => {
    vi.mocked(createOpportunity)
      .mockRejectedValueOnce({
        code: "VALIDATION_FAILED",
        message: "x",
        details: [
          { path: "stageId", message: "Choose an open stage" },
          { path: "contactId", message: "Choose a contact you can see" },
        ],
      })
      .mockRejectedValueOnce({ code: "FORBIDDEN", message: "x", details: null });
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Name"), "Fleet");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(await screen.findByText("Choose an open stage")).toBeInTheDocument();
    expect(screen.getByText("Choose a contact you can see")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
    // What was typed is kept.
    expect(screen.getByLabelText("Name")).toHaveValue("Fleet");
  });

  it("starts with the company named in the address, and goes back to it on Cancel", async () => {
    vi.mocked(getCompany).mockResolvedValue(northwind);
    const from = `/companies/${northwind.id}`;
    setMockLocation(
      "/opportunities/new",
      `companyId=${northwind.id}&from=${encodeURIComponent(from)}`,
    );
    await renderNew();

    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contact: none" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", from);
    expect(screen.getByRole("link", { name: "Back to company" })).toHaveAttribute("href", from);
  });

  it("starts with the contact named in the address, and the contact's company with it", async () => {
    vi.mocked(getContact).mockResolvedValue(marcus);
    vi.mocked(createOpportunity).mockResolvedValue(fleet);
    setMockLocation("/opportunities/new", `contactId=${marcus.id}`);
    const { user } = await renderNew();

    expect(screen.getByRole("button", { name: "Contact: Marcus Chen" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to contact" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "Fleet");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    await waitFor(() => {
      expect(createOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: marcus.id, companyId: northwind.id }),
      );
    });
  });

  it("shows the form without a link when the record in the address cannot be loaded", async () => {
    vi.mocked(getContact).mockRejectedValue({ code: "NOT_FOUND", message: "x", details: null });
    setMockLocation("/opportunities/new", `contactId=${liam.id}`);
    await renderNew();

    expect(screen.getByRole("button", { name: "Contact: none" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to opportunities" })).toBeInTheDocument();
  });

  it("still offers the form when the stages cannot be loaded: the API picks the first", async () => {
    vi.mocked(listPipelineStages).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    });
    vi.mocked(createOpportunity).mockResolvedValue(walkIn);
    const { user } = await renderNew(repUser, onlyRep);

    expect(screen.queryByRole("combobox", { name: "Stage" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Walk-in");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    await waitFor(() => {
      expect(createOpportunity).toHaveBeenCalledWith({ name: "Walk-in" });
    });
  });

  it("gives a Read-only user no form", () => {
    renderWithStore(<NewOpportunityPage />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change opportunities")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(listAssignableUsers).not.toHaveBeenCalled();
  });
});

describe("EditOpportunityPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(listContacts).mockResolvedValue(contactList());
    setMockLocation(`/opportunities/${fleet.id}/edit`);
  });

  it("starts with the opportunity's values, without a stage or an owner field", async () => {
    await renderEdit();

    expect(screen.getByLabelText("Name")).toHaveValue("Fleet Expansion");
    expect(screen.getByLabelText("Value (USD)")).toHaveValue("48000");
    expect(screen.getByLabelText("Expected close date")).toHaveValue("2026-11-15");
    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contact: Marcus Chen" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Stage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("sends only what changed: a new company, no contact, no close date, an emptied value as 0", async () => {
    vi.mocked(updateOpportunity).mockResolvedValue(fleet);
    const { user } = await renderEdit();

    await user.clear(screen.getByLabelText("Value (USD)"));
    await user.clear(screen.getByLabelText("Expected close date"));
    await pick(user, "Company", "Northwind Logistics", "Brightpath Dental");
    await user.click(screen.getByRole("button", { name: "Clear contact" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateOpportunity).toHaveBeenCalledWith(fleet.id, {
        value: 0,
        expectedCloseDate: null,
        companyId: brightpath.id,
        contactId: null,
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/opportunities/${fleet.id}`);
    });
  });

  it("sends nothing when nothing changed, and goes back", async () => {
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/opportunities/${fleet.id}`);
    });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it("lets a closed opportunity be edited", async () => {
    vi.mocked(updateOpportunity).mockResolvedValue(wonDeal);
    const { user } = await renderEdit(wonDeal);

    await user.type(screen.getByLabelText("Notes"), "Renewal in 2029.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateOpportunity).toHaveBeenCalledWith(wonDeal.id, { notes: "Renewal in 2029." });
    });
  });

  it("gives a Read-only user no form, and says not found for an opportunity out of reach", async () => {
    const { unmount } = renderWithStore(<EditOpportunityPage id={fleet.id} />, {
      me: readOnlyUser,
    });
    expect(screen.getByText("You cannot change opportunities")).toBeInTheDocument();
    expect(getOpportunity).not.toHaveBeenCalled();
    unmount();

    vi.mocked(getOpportunity).mockRejectedValue({ code: "NOT_FOUND", message: "x", details: null });
    renderWithStore(<EditOpportunityPage id={fleet.id} />, { me: adminUser });
    expect(await screen.findByText("Opportunity not found")).toBeInTheDocument();
  });
});
