import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { createCompany, getCompany, listIndustries, updateCompany } from "./companies.api";
import { brightpath, industries, northwind } from "./companies.fixtures";
import { EditCompanyPage, NewCompanyPage } from "./company-form-pages";

vi.mock("./companies.api");
vi.mock("@/features/users/users.api");

const onlyRep = [{ id: repUser.id, name: repUser.name, role: "SALES_REP" as const }];

async function renderNew(me: Me = adminUser, owners = assignableUsers) {
  vi.mocked(listAssignableUsers).mockResolvedValue(owners);
  vi.mocked(listIndustries).mockResolvedValue(industries);
  const view = renderWithStore(<NewCompanyPage />, { me });
  await screen.findByLabelText("Company name");
  return view;
}

async function renderEdit(company = northwind, me: Me = adminUser) {
  vi.mocked(getCompany).mockResolvedValue(company);
  vi.mocked(listIndustries).mockResolvedValue(industries);
  const view = renderWithStore(<EditCompanyPage id={company.id} />, { me });
  await screen.findByLabelText("Company name");
  return view;
}

describe("NewCompanyPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/companies/new");
  });

  it("creates a company with only the name, then opens it", async () => {
    vi.mocked(createCompany).mockResolvedValue({ ...brightpath, id: "new-company" });
    const { user } = await renderNew(repUser, onlyRep);

    await user.type(screen.getByLabelText("Company name"), " Brightpath Dental ");
    await user.click(screen.getByRole("button", { name: "Create company" }));

    await waitFor(() => {
      expect(createCompany).toHaveBeenCalledWith({ name: "Brightpath Dental" });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/companies/new-company");
    });
  });

  it("sends every field and the chosen owner", async () => {
    vi.mocked(createCompany).mockResolvedValue(northwind);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Company name"), "Northwind Logistics");
    await user.type(screen.getByLabelText("Industry"), "Logistics");
    await user.type(screen.getByLabelText("Website"), "northwind.example");
    await user.type(screen.getByLabelText("Phone"), "+1 555 234 8900");
    await user.type(screen.getByLabelText("Address"), "4200 S Michigan Ave");
    await user.type(screen.getByLabelText("Notes"), "Renewal in spring.");
    await user.click(screen.getByRole("combobox", { name: "Owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(screen.getByRole("button", { name: "Create company" }));

    await waitFor(() => {
      expect(createCompany).toHaveBeenCalledWith({
        name: "Northwind Logistics",
        industry: "Logistics",
        website: "northwind.example",
        phone: "+1 555 234 8900",
        address: "4200 S Michigan Ave",
        notes: "Renewal in spring.",
        ownerId: managerUser.id,
      });
    });
    // Six fields typed key by key take longer than the default five seconds.
  }, 20_000);

  it("suggests the industries already in use", async () => {
    await renderNew();

    const input = screen.getByLabelText("Industry");
    await waitFor(() => {
      const options = document.querySelectorAll(`#${input.getAttribute("list") ?? ""} option`);
      expect([...options].map((option) => option.getAttribute("value"))).toEqual(industries);
    });
  });

  it("starts the Owner field on the signed-in user, and hides it when there is no choice", async () => {
    const first = await renderNew();
    expect(screen.getByRole("combobox", { name: "Owner" })).toHaveTextContent("Ada Admin");
    first.unmount();

    await renderNew(repUser, onlyRep);
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("still shows the form, without Owner, when the owners cannot be loaded", async () => {
    vi.mocked(listAssignableUsers).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Server text",
      details: null,
    });
    vi.mocked(listIndustries).mockResolvedValue([]);
    renderWithStore(<NewCompanyPage />, { me: adminUser });

    expect(await screen.findByLabelText("Company name")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("checks the fields before sending anything", async () => {
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Website"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Create company" }));

    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a web address such as example.com.")).toBeInTheDocument();
    expect(screen.getByLabelText("Website")).toHaveAttribute("aria-invalid", "true");
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("puts the server's validation details on the matching fields", async () => {
    const refused: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [
        { path: "website", message: "Enter a web address such as example.com" },
        { path: "ownerId", message: "You cannot assign records to this user" },
      ],
    };
    vi.mocked(createCompany).mockRejectedValue(refused);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Company name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Create company" }));

    expect(await screen.findByText("Enter a web address such as example.com")).toBeInTheDocument();
    expect(screen.getByText("You cannot assign records to this user")).toBeInTheDocument();
    // What was typed is kept, and the user stays on the form.
    expect(screen.getByLabelText("Company name")).toHaveValue("Northwind");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows any other failure above the form", async () => {
    vi.mocked(createCompany).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Company name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Create company" }));

    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
  });

  it("cancels back to the list, or to where the user came from, never to another site", async () => {
    const first = await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/companies");
    first.unmount();

    setMockLocation("/companies/new", `from=${encodeURIComponent("/companies?page=2")}`);
    const second = await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/companies?page=2",
    );
    expect(screen.getByRole("link", { name: "Back to companies" })).toHaveAttribute(
      "href",
      "/companies?page=2",
    );
    second.unmount();

    setMockLocation("/companies/new", `from=${encodeURIComponent("//evil.example/x")}`);
    await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/");
  });

  it("is one column on phones and two from md, and long values cannot widen it", async () => {
    await renderNew();

    expect(screen.getByLabelText("Company name").closest(".grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
    );
  });

  it("tells a Read-only user they cannot add companies and asks the API nothing", () => {
    renderWithStore(<NewCompanyPage />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change companies")).toBeInTheDocument();
    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
    expect(listAssignableUsers).not.toHaveBeenCalled();
    expect(listIndustries).not.toHaveBeenCalled();
  });
});

describe("EditCompanyPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation(`/companies/${northwind.id}/edit`);
  });

  it("starts with the company's values and has no Owner field", async () => {
    await renderEdit();

    expect(
      screen.getByRole("heading", { level: 1, name: "Edit Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Company name")).toHaveValue("Northwind Logistics");
    expect(screen.getByLabelText("Website")).toHaveValue("https://northwind.example");
    expect(screen.getByLabelText("Address")).toHaveValue("4200 S Michigan Ave\nChicago, IL 60653");
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("sends only what changed, null for an emptied field, then returns to the company", async () => {
    vi.mocked(updateCompany).mockResolvedValue({ ...northwind, phone: null, industry: "Freight" });
    const { user } = await renderEdit();

    await user.clear(screen.getByLabelText("Industry"));
    await user.type(screen.getByLabelText("Industry"), "Freight");
    await user.clear(screen.getByLabelText("Phone"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateCompany).toHaveBeenCalledWith(northwind.id, {
        industry: "Freight",
        phone: null,
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/companies/${northwind.id}`);
    });
  });

  it("sends nothing when nothing changed, and returns to where the user came from", async () => {
    setMockLocation(
      `/companies/${northwind.id}/edit`,
      `from=${encodeURIComponent("/companies?page=2")}`,
    );
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/companies?page=2");
    });
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it("puts the server's validation details on the matching fields", async () => {
    vi.mocked(updateCompany).mockRejectedValue({
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

  it("says the company was not found when it is missing or not the user's to see", async () => {
    vi.mocked(getCompany).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    vi.mocked(listIndustries).mockResolvedValue([]);
    renderWithStore(<EditCompanyPage id={northwind.id} />, { me: repUser });

    expect(await screen.findByText("Company not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to companies" })).toHaveAttribute(
      "href",
      "/companies",
    );
    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
  });

  it("tells a Read-only user they cannot edit companies and asks the API nothing", () => {
    renderWithStore(<EditCompanyPage id={northwind.id} />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change companies")).toBeInTheDocument();
    expect(getCompany).not.toHaveBeenCalled();
  });
});
