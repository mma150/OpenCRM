import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getCompany, listCompanies } from "@/features/companies/companies.api";
import { companyList, northwind } from "@/features/companies/companies.fixtures";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import type { DownloadedFile } from "@/lib/api/download";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  downloadInvoicePdf,
  exportInvoices,
  getInvoiceSummary,
  listInvoices,
} from "./invoices.api";
import {
  allInvoices,
  defaultQuery,
  emptySummary,
  invoiceList,
  overdue,
  sent,
  summary,
  voided,
} from "./invoices.fixtures";
import { InvoicesPage } from "./invoices-page";

vi.mock("./invoices.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/lib/save-file");
vi.mock("sonner");

const unavailable: ApiError = { code: "SERVICE_UNAVAILABLE", message: "Down", details: null };
const file: DownloadedFile = { blob: new Blob(["x"]), filename: "invoices.csv", truncated: false };
const everyRole: Me[] = [adminUser, managerUser, repUser, readOnlyUser];

// The list renders the table and the phone cards together (CSS shows one), so the tests
// look inside the table.
async function renderPage(me: Me = adminUser, search = "") {
  setMockLocation("/invoices", search);
  const view = renderWithStore(<InvoicesPage />, { me });
  const table = await screen.findByRole("table", { name: "Invoices" });
  return { ...view, table };
}

const tile = (label: string) => {
  const totals = screen.getByRole("list", { name: "Invoice totals" });
  const link = within(totals).getByText(label).closest("a");
  if (!link) {
    throw new Error(`No tile labelled ${label}`);
  }
  return link;
};

async function choose(
  user: ReturnType<typeof renderWithStore>["user"],
  filter: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name: filter }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("InvoicesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listInvoices).mockResolvedValue(invoiceList());
    vi.mocked(getInvoiceSummary).mockResolvedValue(summary);
    vi.mocked(exportInvoices).mockResolvedValue(file);
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(getCompany).mockResolvedValue(northwind);
    followNavigation();
  });

  it("writes a whole total with its cents, so the column lines up", async () => {
    vi.mocked(listInvoices).mockResolvedValue(invoiceList([{ ...sent, total: 4200 }]));
    const { table } = await renderPage();

    expect(within(table).getByText("$4,200.00")).toBeInTheDocument();
  });

  it("lists the invoices: number, company, status, total, issue date and due date", async () => {
    const { table } = await renderPage();

    expect(listInvoices).toHaveBeenCalledWith(defaultQuery);
    expect(within(table).getAllByRole("row")).toHaveLength(allInvoices.length + 1);
    const row = within(within(table).getByRole("row", { name: /INV-0003/ }));
    expect(row.getByRole("link", { name: "INV-0003" })).toHaveAttribute(
      "href",
      `/invoices/${sent.id}`,
    );
    expect(row.getByText("Northwind Logistics")).toBeInTheDocument();
    expect(row.getByText("Sent")).toBeInTheDocument();
    expect(row.getByText("$5,253.10")).toBeInTheDocument();
    expect(row.getByText("Oct 5, 2026")).toBeInTheDocument();
    expect(row.getByText("Nov 4, 2099")).toBeInTheDocument();
    // An invoice without a company still has its row.
    expect(within(table).getByRole("row", { name: /INV-0006/ })).toHaveTextContent("Void");
  });

  it("says an overdue invoice is overdue in words, in the badge and beside the due date", async () => {
    const { table } = await renderPage();

    const row = within(within(table).getByRole("row", { name: /INV-0005/ }));
    expect(row.getByText("Overdue")).toBeInTheDocument();
    expect(row.getByText("Overdue · Sep 19, 2026")).toBeInTheDocument();
    // The phone card says it too.
    const cards = screen.getAllByText("Overdue · Sep 19, 2026");
    expect(cards).toHaveLength(2);
    // Nothing else is called overdue.
    expect(within(table).getAllByText(/^Overdue/)).toHaveLength(2);
  });

  it("shows the three totals, each a link to the list it counts", async () => {
    await renderPage();

    expect(tile("Outstanding")).toHaveTextContent("$13,804.20");
    expect(tile("Outstanding")).toHaveTextContent("2 sent · 1 overdue");
    expect(tile("Outstanding")).toHaveAttribute("href", "/invoices");
    expect(tile("Overdue")).toHaveTextContent("$7,547.35");
    expect(tile("Overdue")).toHaveTextContent("1 invoice");
    expect(tile("Overdue")).toHaveAttribute("href", "/invoices?status=OVERDUE");
    expect(tile("Paid this month")).toHaveTextContent("$14,491.50");
    expect(tile("Paid this month")).toHaveTextContent("4 paid invoices in all");
    expect(tile("Paid this month")).toHaveAttribute("href", "/invoices?status=PAID");
  });

  it("keeps the list when the totals fail, with their own message and Retry", async () => {
    vi.mocked(getInvoiceSummary).mockRejectedValueOnce(unavailable).mockResolvedValue(summary);
    const { user, table } = await renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The invoice totals could not be loaded. The service is temporarily unavailable. Try again in a moment.",
    );
    expect(within(table).getAllByRole("row")).toHaveLength(allInvoices.length + 1);

    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list", { name: "Invoice totals" })).toBeInTheDocument();
  });

  it("reads the search, the filters, the sort and the page from the address", async () => {
    await renderPage(
      adminUser,
      `search=north&status=OVERDUE&companyId=${northwind.id}&sort=dueDate&order=asc&page=2`,
    );

    expect(listInvoices).toHaveBeenCalledWith({
      search: "north",
      status: "OVERDUE",
      companyId: northwind.id,
      sort: "dueDate",
      order: "asc",
      page: 2,
      pageSize: 25,
    });
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Overdue");
    // The Company filter asks for the name of the company in the address.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent(
        "Company:Northwind Logistics",
      );
    });
    expect(getCompany).toHaveBeenCalledWith(northwind.id);
  });

  it("writes a status filter and a sort order into the address, and asks again", async () => {
    const { user } = await renderPage();

    expect(
      within(await screen.findByRole("combobox", { name: "Status" })).queryByText("Overdue"),
    ).not.toBeInTheDocument();
    await choose(user, "Status", "Overdue");
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/invoices?status=OVERDUE", {
      scroll: false,
    });
    await waitFor(() => {
      expect(listInvoices).toHaveBeenLastCalledWith({ ...defaultQuery, status: "OVERDUE" });
    });

    await choose(user, "Sort", "Total: highest");
    await waitFor(() => {
      expect(listInvoices).toHaveBeenLastCalledWith({
        ...defaultQuery,
        status: "OVERDUE",
        sort: "total",
        order: "desc",
      });
    });
  });

  it("offers every status as a filter, and ignores one the API does not have", async () => {
    const { user } = await renderPage(adminUser, "status=LOST");

    expect(listInvoices).toHaveBeenCalledWith(defaultQuery);
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "All",
      "Draft",
      "Sent",
      "Paid",
      "Overdue",
      "Void",
    ]);
  });

  it("exports the list with its own query for every role, and offers no Import and no New", async () => {
    for (const me of everyRole) {
      vi.mocked(exportInvoices).mockClear();
      const { user, unmount } = await renderPage(me, "status=PAID&sort=total&order=asc");

      await user.click(screen.getByRole("button", { name: "Export CSV" }));

      await waitFor(() => {
        expect(exportInvoices).toHaveBeenCalledTimes(1);
      });
      expect(vi.mocked(exportInvoices).mock.calls[0]?.[0]).toEqual(
        vi.mocked(listInvoices).mock.lastCall?.[0],
      );
      expect(saveFile).toHaveBeenLastCalledWith(file.blob, "invoices.csv");
      expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /New/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /New/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("gives each row View, the PDF and Print, and nothing that changes the invoice", async () => {
    const { user, table } = await renderPage(readOnlyUser);

    await user.click(within(table).getByRole("button", { name: `Actions for ${overdue.number}` }));
    const menu = within(await screen.findByRole("menu"));
    expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "View",
      "Download PDF",
      "Print",
    ]);
    expect(menu.getByRole("menuitem", { name: "Print" })).toHaveAttribute(
      "href",
      `/invoices/${overdue.id}/print`,
    );

    const pdf: DownloadedFile = {
      blob: new Blob(["%PDF-"], { type: "application/pdf" }),
      filename: `${overdue.number}.pdf`,
      truncated: false,
    };
    vi.mocked(downloadInvoicePdf).mockResolvedValue(pdf);
    await user.click(menu.getByRole("menuitem", { name: "Download PDF" }));
    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(pdf.blob, `${overdue.number}.pdf`);
    });
    expect(downloadInvoicePdf).toHaveBeenCalledWith(overdue.id, overdue.number);
  });

  it("says where invoices come from when there are none, with a link to the quotes", async () => {
    vi.mocked(listInvoices).mockResolvedValue(invoiceList([]));
    vi.mocked(getInvoiceSummary).mockResolvedValue(emptySummary);
    setMockLocation("/invoices");
    renderWithStore(<InvoicesPage />, { me: repUser });

    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
    expect(screen.getByText(/An invoice is made from an accepted quote/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to quotes" })).toHaveAttribute("href", "/quotes");
    expect(tile("Outstanding")).toHaveTextContent("$0");
    expect(tile("Overdue")).toHaveTextContent("0 invoices");
  });

  it("offers Clear filters when the filters match nothing", async () => {
    vi.mocked(listInvoices).mockResolvedValue(invoiceList([]));
    setMockLocation("/invoices", "status=VOID");
    const { user } = renderWithStore(<InvoicesPage />, { me: adminUser });

    expect(await screen.findByText("No invoices match your filters")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to quotes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/invoices", { scroll: false });
  });

  it("shows a failed load with Retry", async () => {
    vi.mocked(listInvoices).mockRejectedValueOnce(unavailable).mockResolvedValue(invoiceList());
    setMockLocation("/invoices");
    const { user } = renderWithStore(<InvoicesPage />, { me: adminUser });

    // The table and the cards each show the error.
    const [alert] = await screen.findAllByRole("alert");
    expect(alert).toHaveTextContent(
      "The service is temporarily unavailable. Try again in a moment.",
    );
    await user.click(within(alert as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: "Invoices" })).toBeInTheDocument();
    expect(voided.number).toBe("INV-0006");
  });
});
