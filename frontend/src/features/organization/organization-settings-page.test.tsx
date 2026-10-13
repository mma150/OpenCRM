import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { getOrganization, saveOrganization } from "./organization.api";
import { organization, unsavedOrganization } from "./organization.fixtures";
import type { OrganizationSettings } from "./organization.types";
import { OrganizationSettingsPage } from "./organization-settings-page";

vi.mock("./organization.api");

async function renderOrganization(settings: OrganizationSettings = organization) {
  vi.mocked(getOrganization).mockResolvedValue(settings);
  const view = renderWithStore(<OrganizationSettingsPage />, { me: adminUser });
  await screen.findByLabelText("Name");
  return view;
}

describe("OrganizationSettingsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["a Sales Manager", managerUser],
    ["a Sales Rep", repUser],
    ["a Read-only user", readOnlyUser],
  ])("tells %s they have no access", (_label, me) => {
    renderWithStore(<OrganizationSettingsPage />, { me });

    expect(screen.getByText("You do not have access to Organization")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(getOrganization).not.toHaveBeenCalled();
  });

  it("shows loading, then the saved settings in the form", async () => {
    vi.mocked(getOrganization).mockResolvedValue(organization);
    renderWithStore(<OrganizationSettingsPage />, { me: adminUser });

    expect(screen.getByText("Loading organisation settings...")).toBeInTheDocument();
    expect(await screen.findByLabelText("Name")).toHaveValue("Northwind Fleet Solutions");
    expect(screen.getByLabelText("Address")).toHaveValue(
      "4200 Commerce Park Drive\nAustin, TX 78744",
    );
    expect(screen.getByLabelText("Email")).toHaveValue("sales@northwind.example");
    expect(screen.getByLabelText("Phone")).toHaveValue("+1 512 555 0148");
    expect(screen.getByLabelText("Tax ID")).toHaveValue("EIN 74-1234567");
    expect(screen.getByLabelText("Quote validity (days)")).toHaveValue("30");
    expect(screen.getByLabelText("Default tax rate (%)")).toHaveValue("8.25");
    expect(screen.getByLabelText("Invoice payment terms (days)")).toHaveValue("14");
    expect(screen.getByLabelText("Default quote terms")).toHaveValue("Payment within 30 days.");
  });

  it("says that changes never alter existing quotes and invoices", async () => {
    await renderOrganization();

    expect(
      screen.getByText(/Changes here never alter quotes and invoices that already exist/),
    ).toBeInTheDocument();
  });

  it("starts from the defaults before anything was saved", async () => {
    await renderOrganization(unsavedOrganization);

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Quote validity (days)")).toHaveValue("30");
    expect(screen.getByLabelText("Default tax rate (%)")).toHaveValue("0");
    expect(screen.getByLabelText("Invoice payment terms (days)")).toHaveValue("30");
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(getOrganization)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(organization);
    const { user } = renderWithStore(<OrganizationSettingsPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
  });

  it("sends the whole form on every save, numbers as numbers and emptied text as null", async () => {
    vi.mocked(saveOrganization).mockResolvedValue({ ...organization, phone: null });
    const { user } = await renderOrganization();

    // One field is emptied and one number changed; everything else is sent as it is.
    await user.clear(screen.getByLabelText("Phone"));
    await user.clear(screen.getByLabelText("Default tax rate (%)"));
    await user.type(screen.getByLabelText("Default tax rate (%)"), "7.5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveOrganization).toHaveBeenCalledWith({
        name: "Northwind Fleet Solutions",
        address: "4200 Commerce Park Drive\nAustin, TX 78744",
        email: "sales@northwind.example",
        phone: null,
        taxId: "EIN 74-1234567",
        defaultQuoteTerms: "Payment within 30 days.",
        defaultValidityDays: 30,
        defaultTaxRate: 7.5,
        invoicePaymentTermsDays: 14,
      });
    });
  });

  it("shows what the API stored after a save", async () => {
    vi.mocked(saveOrganization).mockResolvedValue({
      ...organization,
      email: "billing@northwind.example",
    });
    const { user, store } = await renderOrganization();

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "  Billing@Northwind.example ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toHaveValue("billing@northwind.example");
    });
    expect(store.getState().organization.data?.email).toBe("billing@northwind.example");
  });

  it("sends nothing while a field is not valid", async () => {
    const { user } = await renderOrganization();

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.clear(screen.getByLabelText("Quote validity (days)"));
    await user.type(screen.getByLabelText("Quote validity (days)"), "0");
    await user.clear(screen.getByLabelText("Default tax rate (%)"));
    await user.type(screen.getByLabelText("Default tax rate (%)"), "8.255");
    await user.clear(screen.getByLabelText("Invoice payment terms (days)"));
    await user.type(screen.getByLabelText("Invoice payment terms (days)"), "366");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a whole number from 1 to 365.")).toBeInTheDocument();
    expect(
      screen.getByText("Enter a rate from 0 to 100, with at most two decimals."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a whole number from 0 to 365.")).toBeInTheDocument();
    expect(saveOrganization).not.toHaveBeenCalled();
  });

  it("accepts the edges of each number", async () => {
    vi.mocked(saveOrganization).mockResolvedValue(organization);
    const { user } = await renderOrganization();

    await user.clear(screen.getByLabelText("Quote validity (days)"));
    await user.type(screen.getByLabelText("Quote validity (days)"), "365");
    await user.clear(screen.getByLabelText("Default tax rate (%)"));
    await user.type(screen.getByLabelText("Default tax rate (%)"), "100");
    await user.clear(screen.getByLabelText("Invoice payment terms (days)"));
    await user.type(screen.getByLabelText("Invoice payment terms (days)"), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultValidityDays: 365,
          defaultTaxRate: 100,
          invoicePaymentTermsDays: 0,
        }),
      );
    });
  });

  it("puts the API's field errors on their fields and keeps what was typed", async () => {
    vi.mocked(saveOrganization).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [
        { path: "email", message: "Enter a valid email" },
        { path: "defaultTaxRate", message: "Use at most two decimal places" },
      ],
    });
    const { user } = await renderOrganization();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Northwind Ltd");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Use at most two decimal places")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Name")).toHaveValue("Northwind Ltd");
    // Every problem landed on a field, so nothing is said above the form.
    expect(screen.queryByText(/Some of the details/)).not.toBeInTheDocument();
  });

  it("explains any other refusal above the form and keeps the draft", async () => {
    vi.mocked(saveOrganization).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderOrganization();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Northwind Ltd");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Northwind Ltd");
  });
});
