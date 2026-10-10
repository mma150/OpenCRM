import { type BoundFunctions, type queries, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listCompanies } from "@/features/companies/companies.api";
import { brightpath, companyList } from "@/features/companies/companies.fixtures";
import { listContacts } from "@/features/contacts/contacts.api";
import { contactList, elena } from "@/features/contacts/contacts.fixtures";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import { pipeline, proposalStage } from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { listTimeline } from "@/features/timeline/timeline.api";
import { call, created, timelinePage } from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { LeadDetailPage } from "./lead-detail-page";
import { EditLeadPage } from "./lead-form-pages";
import { convertLead, getLead, listLeads } from "./leads.api";
import { allLeads, assignableUsers, converted, leadList, liam, marcus } from "./leads.fixtures";
import type { Lead } from "./leads.types";
import { LeadsPage } from "./leads-page";

vi.mock("./leads.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("sonner");

// The lead page with the convert dialog open.
async function openConvert(lead: Lead = marcus, me: Me = adminUser) {
  vi.mocked(getLead).mockResolvedValue(lead);
  const view = renderWithStore(<LeadDetailPage id={lead.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: lead.name });
  await view.user.click(screen.getByRole("button", { name: "Convert" }));
  const dialog = within(await screen.findByRole("dialog", { name: `Convert ${lead.name}` }));
  // The stages arrive a moment after the dialog opens.
  await dialog.findByRole("combobox", { name: "Stage" });
  return { ...view, dialog };
}

// The queries of one part of the page: what `within` returns.
type Scope = BoundFunctions<typeof queries>;

// The choices of a section: "Create new" / "Use existing", and for a company also "None".
const source = (dialog: Scope, of: "Contact" | "Company") =>
  within(dialog.getByRole("group", { name: `${of} source` }));

const convertButton = (dialog: Scope) => dialog.getByRole("button", { name: "Convert lead" });

describe("ConvertLeadDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(listContacts).mockResolvedValue(contactList());
    vi.mocked(listLeads).mockResolvedValue(leadList());
    vi.mocked(convertLead).mockResolvedValue(converted);
    setMockLocation(`/leads/${marcus.id}`);
  });

  it("starts from the lead: a new contact, a new company with its name, an opportunity with its value", async () => {
    const { dialog } = await openConvert();

    for (const of of ["Contact", "Company"] as const) {
      expect(source(dialog, of).getByRole("button", { name: "Create new" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    expect(
      source(dialog, "Company")
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Create new", "Use existing", "None"]);
    expect(dialog.getByLabelText("Company name")).toHaveValue("Northwind Logistics");
    expect(dialog.getByRole("checkbox", { name: "Create an opportunity" })).toBeChecked();
    expect(dialog.getByLabelText("Opportunity name")).toHaveValue("Northwind Logistics");
    expect(dialog.getByLabelText("Value (USD)")).toHaveValue("48000");
    expect(dialog.getByRole("combobox", { name: "Stage" })).toHaveTextContent("New");
    // The new records belong to the lead's owner, whoever converts it.
    expect(dialog.getByText(/creates the records below for Rob Rep/)).toBeInTheDocument();
  });

  it("converts with the defaults and opens the new opportunity", async () => {
    const { user, dialog } = await openConvert();

    await user.click(convertButton(dialog));

    await waitFor(() => {
      expect(convertLead).toHaveBeenCalledWith(marcus.id, {
        company: { mode: "create", name: "Northwind Logistics" },
        contact: { mode: "create" },
        opportunity: { create: true, name: "Northwind Logistics", value: 48000 },
      });
    });
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/opportunities/${converted.convertedTo?.opportunity?.id ?? ""}`,
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Marcus Chen was converted.");
  });

  it("links an existing company and contact, and sends what was typed for the opportunity", async () => {
    const { user, dialog } = await openConvert();

    await user.click(source(dialog, "Contact").getByRole("button", { name: "Use existing" }));
    await user.click(screen.getByRole("button", { name: "Contact: none" }));
    await user.click(await screen.findByRole("button", { name: /Elena Rostova/ }));
    await user.click(source(dialog, "Company").getByRole("button", { name: "Use existing" }));
    await user.click(await screen.findByRole("button", { name: "Company: none" }));
    await user.click(await screen.findByRole("button", { name: "Brightpath Dental" }));

    const name = dialog.getByLabelText("Opportunity name");
    await user.clear(name);
    await user.type(name, "Fleet deal");
    await user.clear(dialog.getByLabelText("Value (USD)"));
    await user.type(dialog.getByLabelText("Value (USD)"), "1250.50");
    await user.type(dialog.getByLabelText("Expected close date"), "2026-12-01");
    await user.click(dialog.getByRole("combobox", { name: "Stage" }));
    expect(screen.queryByRole("option", { name: "Won" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Proposal" }));
    await user.click(convertButton(dialog));

    await waitFor(() => {
      expect(convertLead).toHaveBeenCalledWith(marcus.id, {
        company: { mode: "existing", id: brightpath.id },
        contact: { mode: "existing", id: elena.id },
        opportunity: {
          create: true,
          name: "Fleet deal",
          value: 1250.5,
          expectedCloseDate: "2026-12-01",
          stageId: proposalStage.id,
        },
      });
    });
  }, 20_000);

  it("converts without a company or an opportunity, and then opens the contact", async () => {
    vi.mocked(convertLead).mockResolvedValue({
      ...converted,
      convertedTo: {
        contact: converted.convertedTo?.contact ?? null,
        company: null,
        opportunity: null,
      },
    });
    const { user, dialog } = await openConvert();

    await user.click(source(dialog, "Company").getByRole("button", { name: "None" }));
    await user.click(dialog.getByRole("checkbox", { name: "Create an opportunity" }));
    expect(dialog.queryByLabelText("Opportunity name")).not.toBeInTheDocument();
    await user.click(convertButton(dialog));

    await waitFor(() => {
      expect(convertLead).toHaveBeenCalledWith(marcus.id, {
        company: { mode: "none" },
        contact: { mode: "create" },
        opportunity: { create: false },
      });
    });
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/contacts/${converted.convertedTo?.contact?.id ?? ""}`,
      );
    });
  });

  it("starts with no company for a lead that names none, and names the opportunity after the lead", async () => {
    const { dialog } = await openConvert(liam);

    expect(source(dialog, "Company").getByRole("button", { name: "None" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(dialog.getByLabelText("Opportunity name")).toHaveValue("Liam Gallagher");
    expect(dialog.getByLabelText("Value (USD)")).toHaveValue("");
  });

  it("asks for what the chosen options need, and sends nothing until it is there", async () => {
    const { user, dialog } = await openConvert();

    await user.clear(dialog.getByLabelText("Company name"));
    await user.clear(dialog.getByLabelText("Opportunity name"));
    await user.click(source(dialog, "Contact").getByRole("button", { name: "Use existing" }));
    await user.click(convertButton(dialog));

    expect(await dialog.findByText("Choose a contact.")).toBeInTheDocument();
    expect(dialog.getByText("Enter the company's name.")).toBeInTheDocument();
    expect(dialog.getByText("Enter a name.")).toBeInTheDocument();
    expect(convertLead).not.toHaveBeenCalled();

    // A field that is no longer needed no longer blocks.
    await user.click(source(dialog, "Contact").getByRole("button", { name: "Create new" }));
    await user.click(source(dialog, "Company").getByRole("button", { name: "None" }));
    await user.click(dialog.getByRole("checkbox", { name: "Create an opportunity" }));
    await user.click(convertButton(dialog));
    await waitFor(() => {
      expect(convertLead).toHaveBeenCalled();
    });
  });

  it("puts the API's nested field errors on the fields, and keeps the dialog open", async () => {
    vi.mocked(convertLead).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "x",
      details: [
        { path: "company.name", message: "Another company has this name" },
        { path: "opportunity.value", message: "Use at most two decimal places" },
      ],
    });
    const { user, dialog } = await openConvert();

    await user.click(convertButton(dialog));

    expect(await dialog.findByText("Another company has this name")).toBeInTheDocument();
    expect(dialog.getByText("Use at most two decimal places")).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("explains a lead that was converted meanwhile above the form", async () => {
    vi.mocked(convertLead).mockRejectedValue({
      code: "LEAD_CONVERTED",
      message: "x",
      details: null,
    });
    const { user, dialog } = await openConvert();

    await user.click(convertButton(dialog));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "This lead has been converted and can no longer be changed.",
    );
  });

  it("turns the lead page into the converted lead once it is done", async () => {
    vi.mocked(convertLead).mockResolvedValue({ ...converted, id: marcus.id });
    const { user, dialog } = await openConvert();

    await user.click(convertButton(dialog));

    expect(await screen.findByRole("region", { name: "Converted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });
});

describe("converting from the lead list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    setMockLocation("/leads");
  });

  it("opens the convert dialog from an open lead's row menu", async () => {
    vi.mocked(listLeads).mockResolvedValue(leadList());
    const { user } = renderWithStore(<LeadsPage />, { me: repUser });
    const table = await screen.findByRole("table", { name: "Leads" });

    await user.click(within(table).getByRole("button", { name: "Actions for Marcus Chen" }));
    await user.click(await screen.findByRole("menuitem", { name: "Convert" }));

    expect(await screen.findByRole("dialog", { name: "Convert Marcus Chen" })).toBeInTheDocument();
  });

  it("marks a converted lead in the list with the contact it became", async () => {
    vi.mocked(listLeads).mockResolvedValue(leadList([...allLeads, converted]));
    renderWithStore(<LeadsPage />, { me: adminUser });
    const table = await screen.findByRole("table", { name: "Leads" });

    const row = within(
      within(table)
        .getAllByRole("row")
        .find((candidate) => within(candidate).queryByText(/Now contact/)) as HTMLElement,
    );
    expect(row.getByText("Converted")).toBeInTheDocument();
    expect(row.getAllByRole("link").map((link) => link.getAttribute("href"))).toContain(
      `/contacts/${converted.convertedTo?.contact?.id ?? ""}`,
    );
  });
});

describe("editing a converted lead", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation(`/leads/${converted.id}/edit`);
  });

  it("shows no form, says why, and links back to the lead", async () => {
    vi.mocked(getLead).mockResolvedValue(converted);
    renderWithStore(<EditLeadPage id={converted.id} />, { me: adminUser });

    expect(await screen.findByText("This lead was converted")).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the lead" })).toHaveAttribute(
      "href",
      `/leads/${converted.id}`,
    );
  });
});
