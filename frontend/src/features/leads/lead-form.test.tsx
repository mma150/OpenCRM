import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { EditLeadPage, NewLeadPage } from "./lead-form-pages";
import { createLead, getLead, updateLead } from "./leads.api";
import { assignableUsers, liam, managerUser, marcus, readOnlyUser } from "./leads.fixtures";

vi.mock("./leads.api");
vi.mock("@/features/users/users.api");

async function renderNew(me: Me = adminUser, owners = assignableUsers) {
  vi.mocked(listAssignableUsers).mockResolvedValue(owners);
  const view = renderWithStore(<NewLeadPage />, { me });
  await screen.findByLabelText("First name");
  return view;
}

async function renderEdit(lead = marcus, me: Me = adminUser) {
  vi.mocked(getLead).mockResolvedValue(lead);
  const view = renderWithStore(<EditLeadPage id={lead.id} />, { me });
  await screen.findByLabelText("First name");
  return view;
}

describe("NewLeadPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/leads/new");
  });

  it("creates a lead with only the fields that were filled in, then opens it", async () => {
    vi.mocked(createLead).mockResolvedValue({ ...liam, id: "new-lead" });
    const { user } = await renderNew(repUser, [
      { id: repUser.id, name: repUser.name, role: "SALES_REP" },
    ]);

    await user.type(screen.getByLabelText("First name"), "Liam");
    await user.type(screen.getByLabelText("Last name"), " Gallagher ");
    await user.click(screen.getByRole("button", { name: "Create lead" }));

    await waitFor(() => {
      expect(createLead).toHaveBeenCalledWith({
        firstName: "Liam",
        lastName: "Gallagher",
        source: "WEBSITE",
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/leads/new-lead");
    });
  });

  it("sends every field, the amount as a number and the chosen owner", async () => {
    vi.mocked(createLead).mockResolvedValue(marcus);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await user.type(screen.getByLabelText("Company"), "Northwind Logistics");
    await user.type(screen.getByLabelText("Job title"), "Director");
    await user.type(screen.getByLabelText("Email"), "m.chen@northwind.example");
    await user.type(screen.getByLabelText("Phone"), "+1 555 234 8901");
    await user.type(screen.getByLabelText("Estimated value (USD)"), "48000.50");
    await user.type(screen.getByLabelText("Notes"), "Wants a proposal.");
    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "Referral" }));
    await user.click(screen.getByRole("combobox", { name: "Owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(screen.getByRole("button", { name: "Create lead" }));

    await waitFor(() => {
      expect(createLead).toHaveBeenCalledWith({
        firstName: "Marcus",
        lastName: "Chen",
        company: "Northwind Logistics",
        jobTitle: "Director",
        email: "m.chen@northwind.example",
        phone: "+1 555 234 8901",
        source: "REFERRAL",
        estimatedValue: 48000.5,
        notes: "Wants a proposal.",
        ownerId: managerUser.id,
      });
    });
    // Ten fields typed key by key take longer than the default five seconds.
  }, 20_000);

  it("starts the Owner field on the signed-in user when there is a choice", async () => {
    await renderNew();

    expect(screen.getByRole("combobox", { name: "Owner" })).toHaveTextContent("Ada Admin");
  });

  it("hides the Owner field when the user can only own the lead themselves", async () => {
    await renderNew(repUser, [{ id: repUser.id, name: repUser.name, role: "SALES_REP" }]);

    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("still shows the form, without Owner, when the owners cannot be loaded", async () => {
    vi.mocked(listAssignableUsers).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Server text",
      details: null,
    });
    renderWithStore(<NewLeadPage />, { me: adminUser });

    expect(await screen.findByLabelText("First name")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("checks the fields before sending anything", async () => {
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Email"), "marcus.chen@");
    await user.type(screen.getByLabelText("Estimated value (USD)"), "lots");
    await user.click(screen.getByRole("button", { name: "Create lead" }));

    expect(await screen.findByText("Enter a first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a last name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount such as 48000 or 48000.50.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(createLead).not.toHaveBeenCalled();
  });

  it("puts the server's validation details on the matching fields", async () => {
    const refused: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [
        { path: "email", message: "Enter a valid email" },
        { path: "ownerId", message: "You cannot assign leads to this user" },
      ],
    };
    vi.mocked(createLead).mockRejectedValue(refused);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await user.click(screen.getByRole("button", { name: "Create lead" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("You cannot assign leads to this user")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    // What was typed is kept, and the user stays on the form.
    expect(screen.getByLabelText("First name")).toHaveValue("Marcus");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows any other failure above the form", async () => {
    vi.mocked(createLead).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await user.click(screen.getByRole("button", { name: "Create lead" }));

    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
  });

  it("cancels back to the list, or to where the user came from", async () => {
    const first = await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/leads");
    first.unmount();

    setMockLocation("/leads/new", `from=${encodeURIComponent("/leads?status=NEW&page=2")}`);
    await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/leads?status=NEW&page=2",
    );
    expect(screen.getByRole("link", { name: "Back to leads" })).toHaveAttribute(
      "href",
      "/leads?status=NEW&page=2",
    );
  });

  it("never goes back to another site", async () => {
    setMockLocation("/leads/new", `from=${encodeURIComponent("//evil.example/leads")}`);
    await renderNew();

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/");
  });

  it("is one column on phones and two from md, and long values cannot widen it", async () => {
    await renderNew();

    // grid-cols-1 gives the column a zero minimum, so a long unbroken value stays inside.
    expect(screen.getByLabelText("First name").closest(".grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
    );
  });

  it("tells a Read-only user they cannot add leads and asks the API nothing", () => {
    renderWithStore(<NewLeadPage />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change leads")).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(listAssignableUsers).not.toHaveBeenCalled();
  });
});

describe("EditLeadPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation(`/leads/${marcus.id}/edit`);
  });

  it("starts with the lead's values and has no Owner field", async () => {
    await renderEdit();

    expect(screen.getByRole("heading", { level: 1, name: "Edit Marcus Chen" })).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveValue("Marcus");
    expect(screen.getByLabelText("Company")).toHaveValue("Northwind Logistics");
    expect(screen.getByLabelText("Estimated value (USD)")).toHaveValue("48000");
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveTextContent("Website");
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("sends only what changed, null for an emptied field, then returns to the lead", async () => {
    vi.mocked(updateLead).mockResolvedValue({ ...marcus, company: null, lastName: "Chan" });
    const { user } = await renderEdit();

    await user.clear(screen.getByLabelText("Last name"));
    await user.type(screen.getByLabelText("Last name"), "Chan");
    await user.clear(screen.getByLabelText("Company"));
    await user.clear(screen.getByLabelText("Estimated value (USD)"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateLead).toHaveBeenCalledWith(marcus.id, {
        lastName: "Chan",
        company: null,
        estimatedValue: null,
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/leads/${marcus.id}`);
    });
  });

  it("sends nothing when nothing changed, and returns to where the user came from", async () => {
    setMockLocation(`/leads/${marcus.id}/edit`, `from=${encodeURIComponent("/leads?page=2")}`);
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/leads?page=2");
    });
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("puts the server's validation details on the matching fields", async () => {
    vi.mocked(updateLead).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [{ path: "phone", message: "Too long" }],
    });
    const { user } = await renderEdit();

    await user.type(screen.getByLabelText("Phone"), "9");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Too long")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("says the lead was not found when it is missing or not the user's to see", async () => {
    vi.mocked(getLead).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    renderWithStore(<EditLeadPage id={marcus.id} />, { me: repUser });

    expect(await screen.findByText("Lead not found")).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });

  it("tells a Read-only user they cannot edit leads and asks the API nothing", () => {
    renderWithStore(<EditLeadPage id={marcus.id} />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change leads")).toBeInTheDocument();
    expect(getLead).not.toHaveBeenCalled();
  });
});
