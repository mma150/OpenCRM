import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getCompany, listCompanies } from "@/features/companies/companies.api";
import { brightpath, companyList, northwind } from "@/features/companies/companies.fixtures";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { ApiError } from "@/lib/api/http";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { EditContactPage, NewContactPage } from "./contact-form-pages";
import { createContact, getContact, updateContact } from "./contacts.api";
import { liam, marcus } from "./contacts.fixtures";

vi.mock("./contacts.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/users/users.api");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const onlyRep = [{ id: repUser.id, name: repUser.name, role: "SALES_REP" as const }];

async function renderNew(me: Me = adminUser, owners = assignableUsers) {
  vi.mocked(listAssignableUsers).mockResolvedValue(owners);
  const view = renderWithStore(<NewContactPage />, { me });
  await screen.findByLabelText("First name");
  return view;
}

async function renderEdit(contact = marcus, me: Me = adminUser) {
  vi.mocked(getContact).mockResolvedValue(contact);
  const view = renderWithStore(<EditContactPage id={contact.id} />, { me });
  await screen.findByLabelText("First name");
  return view;
}

// Opens the picker from the Company field and chooses a company in it.
async function pickCompany(user: TestUser, current: string, name: string) {
  await user.click(screen.getByRole("button", { name: `Company: ${current}` }));
  await user.click(await screen.findByRole("button", { name }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

describe("NewContactPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    setMockLocation("/contacts/new");
  });

  it("creates a contact with only the fields that were filled in, then opens it", async () => {
    vi.mocked(createContact).mockResolvedValue({ ...liam, id: "new-contact" });
    const { user } = await renderNew(repUser, onlyRep);

    await user.type(screen.getByLabelText("First name"), "Liam");
    await user.type(screen.getByLabelText("Last name"), " Gallagher ");
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    await waitFor(() => {
      // No company was picked, so no companyId is sent: the API refuses "".
      expect(createContact).toHaveBeenCalledWith({ firstName: "Liam", lastName: "Gallagher" });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/contacts/new-contact");
    });
    expect(getCompany).not.toHaveBeenCalled();
  });

  it("sends every field, the picked company and the chosen owner", async () => {
    vi.mocked(createContact).mockResolvedValue(marcus);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await user.type(screen.getByLabelText("Job title"), "Director");
    await user.type(screen.getByLabelText("Email"), "m.chen@northwind.example");
    await user.type(screen.getByLabelText("Phone"), "+1 555 234 8901");
    await user.type(screen.getByLabelText("Notes"), "Call before nine.");
    await pickCompany(user, "none", "Northwind Logistics");
    await user.click(screen.getByRole("combobox", { name: "Owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    await waitFor(() => {
      expect(createContact).toHaveBeenCalledWith({
        firstName: "Marcus",
        lastName: "Chen",
        jobTitle: "Director",
        email: "m.chen@northwind.example",
        phone: "+1 555 234 8901",
        notes: "Call before nine.",
        companyId: northwind.id,
        ownerId: managerUser.id,
      });
    });
    // Six fields typed key by key take longer than the default five seconds.
  }, 20_000);

  it("starts in the company named in the address, and goes back to it on Cancel", async () => {
    vi.mocked(getCompany).mockResolvedValue(northwind);
    vi.mocked(createContact).mockResolvedValue({ ...marcus, id: "new-contact" });
    const from = `/companies/${northwind.id}`;
    setMockLocation("/contacts/new", `companyId=${northwind.id}&from=${encodeURIComponent(from)}`);
    const { user } = await renderNew();

    expect(getCompany).toHaveBeenCalledWith(northwind.id);
    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", from);
    expect(screen.getByRole("link", { name: "Back to company" })).toHaveAttribute("href", from);

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    await waitFor(() => {
      expect(createContact).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: northwind.id }),
      );
    });
  });

  it("shows the form without a company when the one in the address cannot be loaded", async () => {
    vi.mocked(getCompany).mockRejectedValue({ code: "NOT_FOUND", message: "x", details: null });
    setMockLocation("/contacts/new", `companyId=${northwind.id}`);
    await renderNew();

    expect(screen.getByRole("button", { name: "Company: none" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to contacts" })).toBeInTheDocument();
  });

  it("clears a picked company again", async () => {
    vi.mocked(createContact).mockResolvedValue(liam);
    const { user } = await renderNew(repUser, onlyRep);

    await pickCompany(user, "none", "Northwind Logistics");
    await user.click(screen.getByRole("button", { name: "Clear company" }));
    await user.type(screen.getByLabelText("First name"), "Liam");
    await user.type(screen.getByLabelText("Last name"), "Gallagher");
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    await waitFor(() => {
      expect(createContact).toHaveBeenCalledWith({ firstName: "Liam", lastName: "Gallagher" });
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
    renderWithStore(<NewContactPage />, { me: adminUser });

    expect(await screen.findByLabelText("First name")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("checks the fields before sending anything", async () => {
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("Email"), "marcus.chen@");
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    expect(await screen.findByText("Enter a first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a last name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(createContact).not.toHaveBeenCalled();
  });

  it("puts the server's validation details on the matching fields, the company included", async () => {
    const refused: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [
        { path: "email", message: "Enter a valid email" },
        { path: "companyId", message: "Choose a company you can see" },
      ],
    };
    vi.mocked(createContact).mockRejectedValue(refused);
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await pickCompany(user, "none", "Northwind Logistics");
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Choose a company you can see")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Company: Northwind Logistics" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // What was typed is kept, and the user stays on the form.
    expect(screen.getByLabelText("First name")).toHaveValue("Marcus");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows any other failure above the form", async () => {
    vi.mocked(createContact).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderNew();

    await user.type(screen.getByLabelText("First name"), "Marcus");
    await user.type(screen.getByLabelText("Last name"), "Chen");
    await user.click(screen.getByRole("button", { name: "Create contact" }));

    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
  });

  it("cancels back to the list, or to where the user came from, never to another site", async () => {
    const first = await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/contacts");
    first.unmount();

    setMockLocation("/contacts/new", `from=${encodeURIComponent("/contacts?page=2")}`);
    const second = await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/contacts?page=2",
    );
    second.unmount();

    setMockLocation("/contacts/new", `from=${encodeURIComponent("//evil.example/x")}`);
    await renderNew();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/");
  });

  it("is one column on phones and two from md, and long values cannot widen it", async () => {
    await renderNew();

    expect(screen.getByLabelText("First name").closest(".grid")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-2",
    );
    // A long company name is cut short inside its button.
    const company = screen.getByRole("button", { name: "Company: none" });
    expect(company).toHaveClass("min-w-0", "flex-1");
    expect(company.querySelector("span")).toHaveClass("truncate");
  });

  it("tells a Read-only user they cannot add contacts and asks the API nothing", () => {
    setMockLocation("/contacts/new", `companyId=${northwind.id}`);
    renderWithStore(<NewContactPage />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change contacts")).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(listAssignableUsers).not.toHaveBeenCalled();
    expect(getCompany).not.toHaveBeenCalled();
  });
});

describe("EditContactPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    setMockLocation(`/contacts/${marcus.id}/edit`);
  });

  it("starts with the contact's values, shows its company and has no Owner field", async () => {
    await renderEdit();

    expect(screen.getByRole("heading", { level: 1, name: "Edit Marcus Chen" })).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveValue("Marcus");
    expect(screen.getByLabelText("Job title")).toHaveValue("Director of Operations");
    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("sends only what changed, null for an emptied field, then returns to the contact", async () => {
    vi.mocked(updateContact).mockResolvedValue({ ...marcus, jobTitle: null, lastName: "Chan" });
    const { user } = await renderEdit();

    await user.clear(screen.getByLabelText("Last name"));
    await user.type(screen.getByLabelText("Last name"), "Chan");
    await user.clear(screen.getByLabelText("Job title"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      // The company was not touched, so its key is left out and the link stays.
      expect(updateContact).toHaveBeenCalledWith(marcus.id, { lastName: "Chan", jobTitle: null });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/contacts/${marcus.id}`);
    });
  });

  it("unlinks the company with companyId null", async () => {
    vi.mocked(updateContact).mockResolvedValue({ ...marcus, company: null });
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Clear company" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith(marcus.id, { companyId: null });
    });
  });

  it("moves the contact to another company", async () => {
    vi.mocked(updateContact).mockResolvedValue({
      ...marcus,
      company: { id: brightpath.id, name: brightpath.name },
    });
    const { user } = await renderEdit();

    await pickCompany(user, "Northwind Logistics", "Brightpath Dental");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith(marcus.id, { companyId: brightpath.id });
    });
  });

  it("sends nothing when nothing changed, and returns to where the user came from", async () => {
    setMockLocation(
      `/contacts/${marcus.id}/edit`,
      `from=${encodeURIComponent("/contacts?page=2")}`,
    );
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/contacts?page=2");
    });
    expect(updateContact).not.toHaveBeenCalled();
  });

  it("puts the server's validation details on the matching fields", async () => {
    vi.mocked(updateContact).mockRejectedValue({
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

  it("says the contact was not found when it is missing or not the user's to see", async () => {
    vi.mocked(getContact).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    renderWithStore(<EditContactPage id={marcus.id} />, { me: repUser });

    expect(await screen.findByText("Contact not found")).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });

  it("tells a Read-only user they cannot edit contacts and asks the API nothing", () => {
    renderWithStore(<EditContactPage id={marcus.id} />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change contacts")).toBeInTheDocument();
    expect(getContact).not.toHaveBeenCalled();
  });
});
