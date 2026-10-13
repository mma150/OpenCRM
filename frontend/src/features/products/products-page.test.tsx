import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { getOrganization } from "@/features/organization/organization.api";
import { organization } from "@/features/organization/organization.fixtures";
import type { ApiError } from "@/lib/api/http";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  archiveProduct,
  createProduct,
  deleteProduct,
  listProducts,
  restoreProduct,
  updateProduct,
} from "./products.api";
import {
  allProducts,
  defaultQuery,
  legacy,
  licence,
  onboarding,
  productList,
  tracker,
} from "./products.fixtures";
import type { Product } from "./products.types";
import { ProductsPage } from "./products-page";

vi.mock("./products.api");
vi.mock("@/features/organization/organization.api");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const inUse: ApiError = { code: "PRODUCT_IN_USE", message: "Server text", details: null };

// The page renders the table and the phone cards together (CSS shows one), so the tests
// look inside the table.
async function renderProducts(me: Me = adminUser, products: Product[] = allProducts) {
  vi.mocked(listProducts).mockResolvedValue(productList(products));
  vi.mocked(getOrganization).mockResolvedValue(organization);
  const view = renderWithStore(<ProductsPage />, { me });
  const table = await screen.findByRole("table", { name: "Products" });
  return { ...view, table };
}

async function openAction(user: TestUser, table: HTMLElement, name: string, action: string) {
  await user.click(within(table).getByRole("button", { name: `Actions for ${name}` }));
  await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: action }));
}

describe("ProductsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/settings/products");
    followNavigation();
  });

  it("lists each product with its description, SKU, price, tax rate and status", async () => {
    const { table } = await renderProducts();

    const row = within(table).getByRole("row", { name: /Fleet tracking licence/ });
    expect(within(row).getByText("Monthly subscription per vehicle")).toBeInTheDocument();
    // In its own column, and under the name for a tablet, where that column is dropped.
    expect(within(row).getAllByText("LIC-FLT-001")).toHaveLength(2);
    expect(within(row).getByText("$29.00")).toBeInTheDocument();
    expect(within(row).getByText("20%")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();

    // No rate of its own: the organisation's default, named.
    const followsDefault = within(table).getByRole("row", { name: /GPS tracker hardware/ });
    expect(await within(followsDefault).findByText("Default (8.25%)")).toBeInTheDocument();
    expect(within(followsDefault).getByText("$149.99")).toBeInTheDocument();
    // A rate of 0 is a rate, not "the default".
    expect(
      within(within(table).getByRole("row", { name: /Onboarding package/ })).getByText("0%"),
    ).toBeInTheDocument();
    expect(
      within(within(table).getByRole("row", { name: /Legacy 3G tracker/ })).getByText("Archived"),
    ).toBeInTheDocument();
  });

  it("says Default without a number while the organisation settings are unknown", async () => {
    vi.mocked(listProducts).mockResolvedValue(productList([tracker]));
    vi.mocked(getOrganization).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Server text",
      details: null,
    });
    renderWithStore(<ProductsPage />, { me: adminUser });

    const table = await screen.findByRole("table", { name: "Products" });
    expect(within(table).getByText("Default")).toBeInTheDocument();
  });

  it("asks for the products in use at the plain address", async () => {
    await renderProducts();

    expect(listProducts).toHaveBeenCalledWith(defaultQuery);
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Status:Active");
  });

  it("keeps the status filter, the search and the sort in the address", async () => {
    const { user } = await renderProducts();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Active", "Archived", "Active and archived"]);
    await user.click(screen.getByRole("option", { name: "Archived" }));
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith(
        "/settings/products?status=archived",
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(listProducts).toHaveBeenLastCalledWith({ ...defaultQuery, active: "false" });
    });

    // Both: no `active` at all.
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Active and archived" }));
    await waitFor(() => {
      expect(listProducts).toHaveBeenLastCalledWith({
        sort: "name",
        order: "asc",
        page: 1,
        pageSize: 25,
      });
    });

    await user.type(screen.getByRole("searchbox", { name: "Search by name or SKU" }), "gps");
    await waitFor(() => {
      expect(listProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "gps", page: 1 }),
      );
    });

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Price: high to low" }));
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith(
        "/settings/products?search=gps&status=any&sort=unitPrice&order=desc",
        expect.anything(),
      );
    });
  });

  it("reads the list state from the address", async () => {
    setMockLocation("/settings/products", "search=hw&status=archived&sort=sku&order=asc&page=2");
    vi.mocked(listProducts).mockResolvedValue(
      productList([legacy], { page: 2, pageSize: 25, total: 26 }),
    );
    vi.mocked(getOrganization).mockResolvedValue(organization);
    renderWithStore(<ProductsPage />, { me: adminUser });

    await screen.findByRole("table", { name: "Products" });
    expect(listProducts).toHaveBeenCalledWith({
      search: "hw",
      active: "false",
      sort: "sku",
      order: "asc",
      page: 2,
      pageSize: 25,
    });
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Status:Archived");
  });

  it("offers Clear filters when nothing matches, and the first product otherwise", async () => {
    setMockLocation("/settings/products", "search=nothing");
    vi.mocked(listProducts).mockResolvedValue(productList([]));
    vi.mocked(getOrganization).mockResolvedValue(organization);
    const { user } = renderWithStore(<ProductsPage />, { me: adminUser });

    expect(await screen.findByText("No products match your filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New product" })).toHaveLength(2);
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(listProducts)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(productList(allProducts));
    vi.mocked(getOrganization).mockResolvedValue(organization);
    const { user } = renderWithStore(<ProductsPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table", { name: "Products" })).toBeInTheDocument();
  });

  it.each([
    ["a Sales Manager", managerUser],
    ["a Sales Rep", repUser],
    ["a Read-only user", readOnlyUser],
  ])("shows the catalog to %s without any control", async (_label, me) => {
    const { table } = await renderProducts(me);

    expect(within(table).getByText("Fleet tracking licence")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New product" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Only an Admin can change it/)).toBeInTheDocument();
  });

  it("offers an Admin Edit, Archive or Restore, and Delete", async () => {
    const { user, table } = await renderProducts();

    await user.click(within(table).getByRole("button", { name: "Actions for Onboarding package" }));
    let items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Edit", "Archive", "Delete"]);
    await user.keyboard("{Escape}");

    await user.click(within(table).getByRole("button", { name: "Actions for Legacy 3G tracker" }));
    items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Edit", "Restore", "Delete"]);
  });

  it("adds a product that follows the default tax rate as taxRate null", async () => {
    vi.mocked(createProduct).mockResolvedValue(tracker);
    const { user } = await renderProducts();

    await user.click(screen.getByRole("button", { name: "New product" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByRole("checkbox", {
        name: "Use the organisation's default tax rate (8.25%)",
      }),
    ).toBeChecked();
    expect(within(dialog).queryByLabelText("Tax rate (%)")).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Name"), "  GPS tracker hardware ");
    await user.type(within(dialog).getByLabelText("SKU"), "HW-GPS-4G");
    await user.type(within(dialog).getByLabelText("Unit price (USD)"), "149.99");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledWith({
        name: "GPS tracker hardware",
        sku: "HW-GPS-4G",
        unitPrice: 149.99,
        taxRate: null,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The list is loaded again with the query it had.
    expect(listProducts).toHaveBeenLastCalledWith(defaultQuery);
  });

  it("sends a product's own tax rate as a number", async () => {
    vi.mocked(createProduct).mockResolvedValue(onboarding);
    const { user } = await renderProducts();

    await user.click(screen.getByRole("button", { name: "New product" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Onboarding package");
    await user.type(within(dialog).getByLabelText("Unit price (USD)"), "1200");
    await user.type(within(dialog).getByLabelText("Description"), "Two days on site");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.type(await within(dialog).findByLabelText("Tax rate (%)"), "0");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledWith({
        name: "Onboarding package",
        description: "Two days on site",
        unitPrice: 1200,
        taxRate: 0,
      });
    });
  });

  it("sends nothing while the form is not valid", async () => {
    const { user } = await renderProducts();

    await user.click(screen.getByRole("button", { name: "New product" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Unit price (USD)"), "$12.999");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.type(await within(dialog).findByLabelText("Tax rate (%)"), "120");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(await within(dialog).findByText("Enter a name.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Enter a price such as 149.99, without a currency sign."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Enter a rate from 0 to 100, with at most two decimals."),
    ).toBeInTheDocument();
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("puts a SKU that is taken on the SKU field and keeps what was typed", async () => {
    vi.mocked(createProduct).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [{ path: "sku", message: "Another product already has this SKU" }],
    });
    const { user } = await renderProducts();

    await user.click(screen.getByRole("button", { name: "New product" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Second licence");
    await user.type(within(dialog).getByLabelText("SKU"), "lic-flt-001");
    await user.type(within(dialog).getByLabelText("Unit price (USD)"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(
      await within(dialog).findByText("Another product already has this SKU"),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("SKU")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Second licence");
  });

  it("explains any other refusal above the form", async () => {
    vi.mocked(createProduct).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderProducts();

    await user.click(screen.getByRole("button", { name: "New product" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Second licence");
    await user.type(within(dialog).getByLabelText("Unit price (USD)"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
  });

  it("edits a product and sends only what changed", async () => {
    vi.mocked(updateProduct).mockResolvedValue({ ...licence, unitPrice: 31.5, taxRate: null });
    const { user, table } = await renderProducts();

    await openAction(user, table, "Fleet tracking licence", "Edit");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Fleet tracking licence");
    expect(within(dialog).getByLabelText("Tax rate (%)")).toHaveValue("20");

    await user.clear(within(dialog).getByLabelText("Unit price (USD)"));
    await user.type(within(dialog).getByLabelText("Unit price (USD)"), "31.5");
    await user.clear(within(dialog).getByLabelText("Description"));
    // Back to the organisation's default.
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledWith(licence.id, {
        unitPrice: 31.5,
        description: null,
        taxRate: null,
      });
    });
  });

  it("closes an edit that changed nothing without a request", async () => {
    const { user, table } = await renderProducts();

    await openAction(user, table, "Fleet tracking licence", "Edit");
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("archives and restores from the row menu", async () => {
    vi.mocked(archiveProduct).mockResolvedValue({ ...onboarding, active: false });
    vi.mocked(restoreProduct).mockResolvedValue({ ...legacy, active: true });
    const { user, table } = await renderProducts();

    await openAction(user, table, "Onboarding package", "Archive");
    await waitFor(() => {
      expect(archiveProduct).toHaveBeenCalledWith(onboarding.id);
    });

    await openAction(user, table, "Legacy 3G tracker", "Restore");
    await waitFor(() => {
      expect(restoreProduct).toHaveBeenCalledWith(legacy.id);
    });
  });

  it("asks before deleting, then deletes", async () => {
    vi.mocked(deleteProduct).mockResolvedValue();
    const { user, table } = await renderProducts();

    await openAction(user, table, "Onboarding package", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete Onboarding package?")).toBeInTheDocument();
    expect(deleteProduct).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteProduct).toHaveBeenCalledWith(onboarding.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("does nothing when the delete is cancelled", async () => {
    const { user, table } = await renderProducts();

    await openAction(user, table, "Onboarding package", "Delete");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(deleteProduct).not.toHaveBeenCalled();
  });

  it("steers a product that is on a quote to Archive, and archives it right there", async () => {
    vi.mocked(deleteProduct).mockRejectedValue(inUse);
    vi.mocked(archiveProduct).mockResolvedValue({ ...licence, active: false });
    const { user, table } = await renderProducts();

    await openAction(user, table, "Fleet tracking licence", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This product is on a quote, so it cannot be deleted. Archive it instead.",
    );
    expect(within(dialog).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Archive instead" }));

    await waitFor(() => {
      expect(archiveProduct).toHaveBeenCalledWith(licence.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("says an archived product that is on a quote is already archived", async () => {
    vi.mocked(deleteProduct).mockRejectedValue(inUse);
    const { user, table } = await renderProducts();

    await openAction(user, table, "Legacy 3G tracker", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByText(/It is already archived/)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Archive instead" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("explains any other refused delete in the dialog, which stays open", async () => {
    vi.mocked(deleteProduct).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    const { user, table } = await renderProducts();

    await openAction(user, table, "Onboarding package", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This no longer exists.");
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});
