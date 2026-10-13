import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listCompanies } from "@/features/companies/companies.api";
import { brightpath, companyList, northwind } from "@/features/companies/companies.fixtures";
import { listContacts } from "@/features/contacts/contacts.api";
import { contactList, marcus } from "@/features/contacts/contacts.fixtures";
import { readOnlyUser } from "@/features/leads/leads.fixtures";
import { getOpportunity, listOpportunities } from "@/features/opportunities/opportunities.api";
import { fleet, opportunityList, walkIn } from "@/features/opportunities/opportunities.fixtures";
import { getOrganization } from "@/features/organization/organization.api";
import { organization } from "@/features/organization/organization.fixtures";
import { getProduct, listProducts } from "@/features/products/products.api";
import { licence, productList, tracker } from "@/features/products/products.fixtures";
import type { Product } from "@/features/products/products.types";
import type { ApiError } from "@/lib/api/http";
import { toDateInputValue } from "@/lib/format";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { EditQuotePage, NewQuotePage } from "./quote-form-pages";
import { createQuote, getQuote, updateQuote } from "./quotes.api";
import { bare, draft, sent } from "./quotes.fixtures";
import type { Quote } from "./quotes.types";

vi.mock("./quotes.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("@/features/organization/organization.api");
vi.mock("@/features/products/products.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

const line = (position: number) =>
  within(screen.getByRole("group", { name: `Line ${String(position)}` }));
const totals = () => within(screen.getByRole("region", { name: "Totals" }));
const lineCount = () => screen.queryAllByRole("group", { name: /^Line \d+$/ }).length;
const descriptions = () =>
  screen
    .getAllByRole("group", { name: /^Line \d+$/ })
    .map((group) => within(group).getByLabelText<HTMLTextAreaElement>("Description").value);

async function renderNew(me: Me = adminUser, search = `opportunityId=${fleet.id}`) {
  setMockLocation("/quotes/new", search);
  const view = renderWithStore(<NewQuotePage />, { me });
  await screen.findByRole("button", { name: "Create quote" });
  return view;
}

async function renderEdit(quote: Quote = draft, me: Me = adminUser) {
  vi.mocked(getQuote).mockResolvedValue(quote);
  setMockLocation(`/quotes/${quote.id}/edit`);
  const view = renderWithStore(<EditQuotePage id={quote.id} />, { me });
  await screen.findByRole("button", { name: "Save changes" });
  return view;
}

async function retype(user: TestUser, input: HTMLElement, text: string) {
  await user.clear(input);
  if (text) {
    await user.type(input, text);
  }
}

// Opens the product picker of a line and chooses a product in it.
async function pickProduct(user: TestUser, position: number, product: Product) {
  vi.mocked(getProduct).mockResolvedValue(product);
  await user.click(line(position).getByRole("button", { name: /^Product: / }));
  const dialog = await screen.findByRole("dialog", { name: "Choose a product" });
  await user.click(await within(dialog).findByRole("button", { name: new RegExp(product.name) }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

describe("NewQuotePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOpportunity).mockResolvedValue(fleet);
    vi.mocked(listOpportunities).mockResolvedValue(opportunityList([fleet, walkIn]));
    vi.mocked(getOrganization).mockResolvedValue(organization);
    vi.mocked(listProducts).mockResolvedValue(productList([licence, tracker]));
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(listContacts).mockResolvedValue(contactList());
  });

  it("gives a Read-only user the no-access page and asks the API for nothing", () => {
    setMockLocation("/quotes/new", `opportunityId=${fleet.id}`);
    renderWithStore(<NewQuotePage />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change quotes")).toBeInTheDocument();
    expect(getOpportunity).not.toHaveBeenCalled();
  });

  it("asks for the opportunity first when the address names none, then opens the editor for it", async () => {
    setMockLocation("/quotes/new", "from=%2Fquotes%3Fstatus%3DSENT");
    const { user } = renderWithStore(<NewQuotePage />, { me: adminUser });

    expect(
      await screen.findByRole("heading", { name: "Which opportunity is this quote for?" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create quote" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Opportunity: none" }));
    await user.click(await screen.findByRole("button", { name: /Fleet Expansion/ }));

    // The choice goes into the address, and where the user came from is kept.
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/quotes/new?from=%2Fquotes%3Fstatus%3DSENT&opportunityId=${fleet.id}`,
    );
    setMockLocation("/quotes/new", `opportunityId=${fleet.id}`);
    expect(await screen.findByRole("button", { name: "Create quote" })).toBeInTheDocument();
    expect(getOpportunity).toHaveBeenCalledWith(fleet.id);
  });

  it("asks again when the opportunity in the address is not this user's to see", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "No", details: null };
    vi.mocked(getOpportunity).mockRejectedValue(notFound);
    setMockLocation("/quotes/new", `opportunityId=${fleet.id}`);
    renderWithStore(<NewQuotePage />, { me: repUser });

    expect(await screen.findByText(/does not exist or is not yours to see/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opportunity: none" })).toBeInTheDocument();
  });

  it("starts with the opportunity's buyer, today, the organisation's validity, terms and tax rate", async () => {
    await renderNew();

    expect(screen.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${fleet.id}`,
    );
    expect(screen.getByRole("button", { name: "Contact: Marcus Chen" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Company: Northwind Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Issue date")).toHaveValue(dayFromToday(0));
    expect(screen.getByLabelText("Valid until")).toHaveValue(dayFromToday(30));
    expect(screen.getByLabelText("Terms")).toHaveValue("Payment within 30 days.");
    expect(screen.getByLabelText("Notes")).toHaveValue("");
    // One empty line, taxed at the organisation's default rate.
    expect(lineCount()).toBe(1);
    expect(line(1).getByLabelText("Quantity")).toHaveValue("1");
    expect(line(1).getByLabelText("Tax %")).toHaveValue("8.25");
    expect(screen.getByRole("combobox", { name: "Quote discount" })).toHaveTextContent(
      "No discount",
    );
    expect(screen.queryByLabelText("Discount (%)")).not.toBeInTheDocument();
  });

  it("still opens, with the API's own defaults, when the organisation settings cannot be loaded", async () => {
    const failure: ApiError = { code: "NETWORK_ERROR", message: "offline", details: null };
    vi.mocked(getOrganization).mockRejectedValue(failure);
    await renderNew();

    expect(screen.getByLabelText("Valid until")).toHaveValue(dayFromToday(30));
    expect(screen.getByLabelText("Terms")).toHaveValue("");
    expect(line(1).getByLabelText("Tax %")).toHaveValue("0");
  });

  it("copies a picked product's name, price and tax rate into the line, which stays editable", async () => {
    const { user } = await renderNew();

    await pickProduct(user, 1, licence);

    await waitFor(() => {
      expect(line(1).getByLabelText("Description")).toHaveValue("Fleet tracking licence");
    });
    expect(getProduct).toHaveBeenCalledWith(licence.id);
    expect(line(1).getByLabelText("Unit price (USD)")).toHaveValue("29.00");
    expect(line(1).getByLabelText("Tax %")).toHaveValue("20");
    expect(
      line(1).getByRole("button", { name: "Product: Fleet tracking licence" }),
    ).toBeInTheDocument();

    // A product without a rate of its own takes the organisation's default.
    await pickProduct(user, 1, tracker);
    await waitFor(() => {
      expect(line(1).getByLabelText("Unit price (USD)")).toHaveValue("149.99");
    });
    expect(line(1).getByLabelText("Tax %")).toHaveValue("8.25");

    // Clearing the product keeps the text: the line is free text from here.
    await user.click(line(1).getByRole("button", { name: "Clear product" }));
    expect(line(1).getByRole("button", { name: "Product: none" })).toBeInTheDocument();
    expect(line(1).getByLabelText("Description")).toHaveValue("GPS tracker hardware");
  });

  it("says so when the picked product cannot be loaded, and leaves the line as it was", async () => {
    const { user } = await renderNew();
    await user.type(line(1).getByLabelText("Description"), "Typed by hand");
    const failure: ApiError = { code: "NOT_FOUND", message: "Gone", details: null };
    vi.mocked(getProduct).mockRejectedValue(failure);

    await user.click(line(1).getByRole("button", { name: "Product: none" }));
    await user.click(await screen.findByRole("button", { name: /Fleet tracking licence/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("could not be loaded"));
    });
    expect(line(1).getByLabelText("Description")).toHaveValue("Typed by hand");
    expect(line(1).getByRole("button", { name: "Product: none" })).toBeInTheDocument();
  });

  it("adds, removes and reorders lines with buttons", async () => {
    const { user } = await renderNew();
    await user.type(line(1).getByLabelText("Description"), "First");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(line(2).getByLabelText("Description"), "Second");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(line(3).getByLabelText("Description"), "Third");
    expect(descriptions()).toEqual(["First", "Second", "Third"]);

    // The ends of the list cannot move further.
    expect(line(1).getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(line(3).getByRole("button", { name: "Move down" })).toBeDisabled();

    await user.click(line(3).getByRole("button", { name: "Move up" }));
    expect(descriptions()).toEqual(["First", "Third", "Second"]);
    // The focus follows the line, so it can be moved again with Enter alone.
    expect(line(2).getByRole("button", { name: "Move up" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(descriptions()).toEqual(["Third", "First", "Second"]);
    // At the top "Move up" is switched off, so the focus goes to its neighbour.
    expect(line(1).getByRole("button", { name: "Move down" })).toHaveFocus();

    await user.click(line(2).getByRole("button", { name: "Remove" }));
    expect(descriptions()).toEqual(["Third", "Second"]);

    await user.click(line(1).getByRole("button", { name: "Remove" }));
    await user.click(line(1).getByRole("button", { name: "Remove" }));
    expect(lineCount()).toBe(0);
    expect(screen.getByText(/No lines yet/)).toBeInTheDocument();
  });

  it("counts the line totals and the totals live, as the server will", async () => {
    const { user } = await renderNew();

    await pickProduct(user, 1, licence);
    await retype(user, line(1).getByLabelText("Quantity"), "2");
    await waitFor(() => {
      expect(line(1).getByRole("status", { name: "Line 1 total" })).toHaveTextContent("$58.00");
    });
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(line(2).getByLabelText("Description"), "Installation");
    await retype(user, line(2).getByLabelText("Quantity"), "1.5");
    await user.type(line(2).getByLabelText("Unit price (USD)"), "100");
    await user.type(line(2).getByLabelText("Discount %"), "10");
    expect(line(2).getByRole("status", { name: "Line 2 total" })).toHaveTextContent("$135.00");

    await user.click(screen.getByRole("combobox", { name: "Quote discount" }));
    await user.click(await screen.findByRole("option", { name: "Percent" }));
    await user.type(screen.getByLabelText("Discount (%)"), "10");

    // 58.00 + 135.00; 10% off; 20% tax on 52.20 and 8.25% on 121.50 (10.02375, rounded).
    expect(totals().getByText("$193.00")).toBeInTheDocument();
    expect(totals().getByText("Discount (10%)")).toBeInTheDocument();
    expect(totals().getByText("−$19.30")).toBeInTheDocument();
    expect(totals().getByText("Tax 20% on $52.20")).toBeInTheDocument();
    expect(totals().getByText("$10.44")).toBeInTheDocument();
    expect(totals().getByText("Tax 8.25% on $121.50")).toBeInTheDocument();
    expect(totals().getByText("$10.02")).toBeInTheDocument();
    expect(totals().getByText("$194.16")).toBeInTheDocument();
    expect(totals().getByText(/live preview/i)).toBeInTheDocument();

    // An amount discount never takes more than the subtotal.
    await user.click(screen.getByRole("combobox", { name: "Quote discount" }));
    await user.click(await screen.findByRole("option", { name: "Amount" }));
    await retype(user, screen.getByLabelText("Discount amount (USD)"), "5000");
    expect(totals().getByText("−$193.00")).toBeInTheDocument();
    expect(totals().getAllByText("$0.00").length).toBeGreaterThan(0);
  });

  it("sends the whole quote on create, numbers as numbers, then opens the quote", async () => {
    vi.mocked(createQuote).mockResolvedValue({ ...draft, id: "new-quote", number: "Q-0008" });
    const { user } = await renderNew();

    await pickProduct(user, 1, licence);
    await retype(user, line(1).getByLabelText("Quantity"), "2");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(line(2).getByLabelText("Description"), " Installation ");
    await retype(user, line(2).getByLabelText("Quantity"), "1.5");
    await user.type(line(2).getByLabelText("Unit price (USD)"), "100");
    await user.type(line(2).getByLabelText("Discount %"), "10");
    await user.click(screen.getByRole("combobox", { name: "Quote discount" }));
    await user.click(await screen.findByRole("option", { name: "Percent" }));
    await user.type(screen.getByLabelText("Discount (%)"), "10");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    await waitFor(() => {
      expect(createQuote).toHaveBeenCalledWith({
        opportunityId: fleet.id,
        contactId: marcus.id,
        companyId: northwind.id,
        issueDate: dayFromToday(0),
        validUntil: dayFromToday(30),
        lines: [
          {
            productId: licence.id,
            description: "Fleet tracking licence",
            quantity: 2,
            unitPrice: 29,
            discountPercent: 0,
            taxRate: 20,
          },
          {
            description: "Installation",
            quantity: 1.5,
            unitPrice: 100,
            discountPercent: 10,
            taxRate: 8.25,
          },
        ],
        discountType: "PERCENT",
        discountValue: 10,
        notes: null,
        terms: "Payment within 30 days.",
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/quotes/new-quote");
    });
    expect(toast.success).toHaveBeenCalledWith("Quote Q-0008 created.");
  });

  it("sends null for a buyer, a day and terms that were emptied, and no lines when there are none", async () => {
    vi.mocked(createQuote).mockResolvedValue(bare);
    const { user } = await renderNew();

    await user.click(screen.getByRole("button", { name: "Clear contact" }));
    await user.click(screen.getByRole("button", { name: "Clear company" }));
    await user.clear(screen.getByLabelText("Valid until"));
    await user.clear(screen.getByLabelText("Terms"));
    await user.click(line(1).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    await waitFor(() => {
      expect(createQuote).toHaveBeenCalledWith({
        opportunityId: fleet.id,
        contactId: null,
        companyId: null,
        issueDate: dayFromToday(0),
        validUntil: null,
        lines: [],
        discountType: "NONE",
        discountValue: 0,
        notes: null,
        terms: null,
      });
    });
  });

  it("sends nothing while a line or the discount is not valid, and says what is wrong", async () => {
    const { user } = await renderNew();

    await retype(user, line(1).getByLabelText("Quantity"), "0");
    await user.type(line(1).getByLabelText("Unit price (USD)"), "12.345");
    await user.type(line(1).getByLabelText("Discount %"), "101");
    await user.click(screen.getByRole("combobox", { name: "Quote discount" }));
    await user.click(await screen.findByRole("option", { name: "Amount" }));
    await retype(user, screen.getByLabelText("Valid until"), "2020-01-01");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    expect(await line(1).findByText("Describe the line.")).toBeInTheDocument();
    expect(line(1).getByText(/Enter a quantity above 0/)).toBeInTheDocument();
    expect(line(1).getByText(/Enter a price such as/)).toBeInTheDocument();
    expect(line(1).getByText("Enter a percentage from 0 to 100.")).toBeInTheDocument();
    expect(screen.getByText(/Enter an amount such as/)).toBeInTheDocument();
    expect(screen.getByText("Choose a day on or after the issue date.")).toBeInTheDocument();
    expect(line(1).getByLabelText("Quantity")).toHaveAttribute("aria-invalid", "true");
    expect(createQuote).not.toHaveBeenCalled();
  });

  it("puts the API's line errors on that line's field and keeps the draft", async () => {
    const refused: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: [
        { path: "lines.1.quantity", message: "Enter a quantity above 0" },
        { path: "lines.0.productId", message: "This product is archived" },
        { path: "validUntil", message: "The quote cannot stop being valid before its issue date" },
        { path: "contactId", message: "Choose a contact you can see" },
      ],
    };
    vi.mocked(createQuote).mockRejectedValue(refused);
    const { user } = await renderNew();
    await pickProduct(user, 1, licence);
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(line(2).getByLabelText("Description"), "Installation");
    await user.type(line(2).getByLabelText("Unit price (USD)"), "100");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    expect(await line(2).findByText("Enter a quantity above 0")).toBeInTheDocument();
    expect(line(2).getByLabelText("Quantity")).toHaveAttribute("aria-invalid", "true");
    // A problem with a line's product shows beside its picker, under the description.
    expect(line(1).getByText("This product is archived")).toBeInTheDocument();
    expect(
      screen.getByText("The quote cannot stop being valid before its issue date"),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose a contact you can see")).toBeInTheDocument();
    // Every problem landed on a field: nothing is left to say above the form.
    expect(screen.queryByText(/Some of the details are not valid/)).not.toBeInTheDocument();
    expect(line(2).getByLabelText("Description")).toHaveValue("Installation");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows any other failure above the form and keeps the draft", async () => {
    const forbidden: ApiError = { code: "FORBIDDEN", message: "No", details: null };
    vi.mocked(createQuote).mockRejectedValue(forbidden);
    const { user } = await renderNew();
    await user.type(line(1).getByLabelText("Description"), "Installation");
    await user.type(line(1).getByLabelText("Unit price (USD)"), "100");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    expect(await screen.findByText("You do not have permission to do that.")).toBeInTheDocument();
    expect(line(1).getByLabelText("Description")).toHaveValue("Installation");
  });
});

describe("EditQuotePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOrganization).mockResolvedValue(organization);
    vi.mocked(listProducts).mockResolvedValue(productList([licence, tracker]));
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(listContacts).mockResolvedValue(contactList());
  });

  it("gives a Read-only user the no-access page", () => {
    renderWithStore(<EditQuotePage id={draft.id} />, { me: readOnlyUser });

    expect(screen.getByText("You cannot change quotes")).toBeInTheDocument();
    expect(getQuote).not.toHaveBeenCalled();
  });

  it("says that a quote that is not a draft must be reopened first, with the way back", async () => {
    vi.mocked(getQuote).mockResolvedValue(sent);
    renderWithStore(<EditQuotePage id={sent.id} />, { me: adminUser });

    expect(await screen.findByText("Quote Q-0002 is not a draft")).toBeInTheDocument();
    expect(screen.getByText(/It is sent, so it cannot be changed. Reopen it/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the quote" })).toHaveAttribute(
      "href",
      `/quotes/${sent.id}`,
    );
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("opens with the quote as it is stored", async () => {
    await renderEdit();

    expect(screen.getByRole("heading", { level: 1, name: "Edit quote Q-0001" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Contact: Marcus Chen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Issue date")).toHaveValue("2026-10-05");
    expect(screen.getByLabelText("Valid until")).toHaveValue("2099-11-04");
    expect(lineCount()).toBe(2);
    expect(
      line(1).getByRole("button", { name: "Product: Fleet tracking licence" }),
    ).toBeInTheDocument();
    expect(line(1).getByLabelText("Unit price (USD)")).toHaveValue("29.00");
    expect(line(2).getByRole("button", { name: "Product: none" })).toBeInTheDocument();
    expect(line(2).getByLabelText("Quantity")).toHaveValue("2.5");
    expect(line(2).getByLabelText("Discount %")).toHaveValue("10");
    expect(screen.getByLabelText("Discount (%)")).toHaveValue("10");
    // The preview counts the stored quote exactly as the API did.
    expect(totals().getByText("$2,202.50")).toBeInTheDocument();
    expect(totals().getByText("−$220.25")).toBeInTheDocument();
    expect(totals().getByText("$21.53")).toBeInTheDocument();
    expect(totals().getByText("$2,003.78")).toBeInTheDocument();
  });

  it("sends nothing when nothing changed, and goes back to the quote", async () => {
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/quotes/${draft.id}`);
    });
    expect(updateQuote).not.toHaveBeenCalled();
  });

  it("sends only the keys that changed, null for what was emptied", async () => {
    vi.mocked(updateQuote).mockResolvedValue(draft);
    const { user } = await renderEdit();

    await user.click(screen.getByRole("button", { name: "Company: Northwind Logistics" }));
    await user.click(await screen.findByRole("button", { name: "Brightpath Dental" }));
    await user.click(screen.getByRole("button", { name: "Clear contact" }));
    await user.clear(screen.getByLabelText("Notes"));
    await retype(user, screen.getByLabelText("Discount (%)"), "12.5");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateQuote).toHaveBeenCalledWith(draft.id, {
        contactId: null,
        companyId: brightpath.id,
        discountValue: 12.5,
        notes: null,
      });
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(`/quotes/${draft.id}`);
    });
    expect(toast.success).toHaveBeenCalledWith("Changes saved.");
  });

  it("sends every line when one changed, and the discount going back to none", async () => {
    vi.mocked(updateQuote).mockResolvedValue(draft);
    const { user } = await renderEdit();

    await retype(user, line(2).getByLabelText("Quantity"), "3");
    await user.click(screen.getByRole("combobox", { name: "Quote discount" }));
    await user.click(await screen.findByRole("option", { name: "No discount" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateQuote).toHaveBeenCalledWith(draft.id, {
        lines: [
          {
            productId: licence.id,
            description: "Fleet tracking licence",
            quantity: 10,
            unitPrice: 29,
            discountPercent: 0,
            taxRate: 8.25,
          },
          {
            description: "On-site installation day",
            quantity: 3,
            unitPrice: 850,
            discountPercent: 10,
            taxRate: 0,
          },
        ],
        discountType: "NONE",
        discountValue: 0,
      });
    });
  });

  it("sends the lines when they were only moved", async () => {
    vi.mocked(updateQuote).mockResolvedValue(draft);
    const { user } = await renderEdit();

    await user.click(line(1).getByRole("button", { name: "Move down" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateQuote).toHaveBeenCalledTimes(1);
    });
    const [, changes] = vi.mocked(updateQuote).mock.calls[0] ?? [];
    expect(Object.keys(changes ?? {})).toEqual(["lines"]);
    expect(changes?.lines?.map((sentLine) => sentLine.description)).toEqual([
      "On-site installation day",
      "Fleet tracking licence",
    ]);
  });

  it("says that the quote is no longer a draft when the API refuses, with the way back", async () => {
    const refused: ApiError = { code: "QUOTE_NOT_EDITABLE", message: "No", details: null };
    vi.mocked(updateQuote).mockRejectedValue(refused);
    const { user } = await renderEdit();

    await user.type(screen.getByLabelText("Notes"), " More.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/no longer a draft/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the quote" })).toHaveAttribute(
      "href",
      `/quotes/${draft.id}`,
    );
    // What was typed is still there.
    expect(screen.getByLabelText("Notes")).toHaveValue(`${draft.notes ?? ""} More.`);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
