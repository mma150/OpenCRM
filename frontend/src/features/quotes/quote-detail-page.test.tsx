import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import type { SendEmailDialogProps } from "@/features/emails/send-email-dialog";
import { sent as sentInvoice } from "@/features/invoices/invoices.fixtures";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { closeOpportunity, getOpportunity } from "@/features/opportunities/opportunities.api";
import { fleet, wonDeal } from "@/features/opportunities/opportunities.fixtures";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";
import { mockRouter } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { QuoteDetailPage } from "./quote-detail-page";
import {
  changeQuoteStatus,
  createInvoice,
  deleteQuote,
  downloadQuotePdf,
  duplicateQuote,
  getQuote,
  sendQuote,
} from "./quotes.api";
import { accepted, bare, declined, draft, expired, invoiced, sent } from "./quotes.fixtures";
import type { Quote } from "./quotes.types";

vi.mock("./quotes.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("sonner");
vi.mock("@/lib/save-file");

// The composer belongs to the emails feature and has its own tests. Here a small stand-in
// shows what the quote page hands it and calls `send` the way the real one does.
vi.mock("@/features/emails/send-email-dialog", () => ({
  SendEmailDialog: function FakeSendEmailDialog(props: SendEmailDialogProps) {
    const [error, setError] = useState<string | null>(null);
    if (!props.open) {
      return null;
    }
    return (
      <div role="dialog" aria-label={props.title}>
        <p>{props.note}</p>
        <p>record: {`${props.record.type} ${props.record.id}`}</p>
        <p>subject: {props.initial?.subject}</p>
        <p>body: {props.initial?.body}</p>
        <p>quote placeholders: {String(props.withQuotePlaceholders)}</p>
        {error ? <p>refused: {error}</p> : null}
        <button
          type="button"
          onClick={() => {
            props
              .send?.({
                to: ["m.chen@northwind.example"],
                cc: ["boss@northwind.example"],
                subject: "Your quote",
                body: "Hello Marcus",
                templateId: "template-1",
              })
              .then(
                () => {
                  props.onOpenChange(false);
                },
                (refused: unknown) => {
                  setError((refused as ApiError).code);
                },
              );
          }}
        >
          Send email
        </button>
      </div>
    );
  },
}));

type TestUser = ReturnType<typeof renderWithStore>["user"];

async function renderQuote(quote: Quote = draft, me: Me = adminUser) {
  vi.mocked(getQuote).mockResolvedValue(quote);
  const view = renderWithStore(<QuoteDetailPage id={quote.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: quote.number });
  return view;
}

function header(): HTMLElement {
  const found = document.querySelector("header");
  if (!found) {
    throw new Error("No header");
  }
  return found;
}

// The names in a menu that a button of the header opens.
async function menuOf(user: TestUser, button: string): Promise<string[]> {
  await user.click(within(header()).getByRole("button", { name: button }));
  const names = within(await screen.findByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  return names;
}

// Every action the page offers: the header's buttons and links (without the links to the
// opportunity, the company and the contact), then what its menus hold.
async function offered(user: TestUser) {
  const controls = [...header().querySelectorAll("button, a")]
    .filter(
      (control) =>
        !/^\/(opportunities|companies|contacts)\//.test(control.getAttribute("href") ?? ""),
    )
    .map((control) => control.getAttribute("aria-label") ?? control.textContent);
  return {
    buttons: controls.filter((name) => name !== "More actions"),
    send: controls.includes("Send") ? await menuOf(user, "Send") : [],
    more: controls.includes("More actions") ? await menuOf(user, "More actions") : [],
  };
}

async function chooseFromMenu(user: TestUser, button: string, item: string) {
  await user.click(within(header()).getByRole("button", { name: button }));
  await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: item }));
}

// The document actions every role gets: the API's PDF and the print view.
const FILE = ["Download PDF", "Print"];

describe("QuoteDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOpportunity).mockResolvedValue(fleet);
  });

  it("shows the quote as a document: buyer, dates, lines, the API's totals, notes and terms", async () => {
    await renderQuote();

    const top = within(header());
    expect(top.getByText("Draft")).toBeInTheDocument();
    expect(top.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${draft.opportunity.id}`,
    );
    expect(top.getByRole("link", { name: "Northwind Logistics" })).toBeInTheDocument();
    expect(top.getByRole("link", { name: "Marcus Chen" })).toBeInTheDocument();
    expect(top.getByText("Total: $2,003.78")).toBeInTheDocument();
    expect(top.getByText("Valid until: Nov 4, 2099")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to quotes" })).toHaveAttribute("href", "/quotes");

    expect(screen.getByRole("heading", { level: 2, name: "Quote Q-0001" })).toBeInTheDocument();
    expect(screen.getByText("m.chen@northwind.example")).toBeInTheDocument();
    expect(screen.getByText("Oct 5, 2026")).toBeInTheDocument();
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
    const table = within(screen.getByRole("table", { name: "Line items" }));
    expect(table.getAllByRole("row")).toHaveLength(3);
    expect(table.getByText("On-site installation day")).toBeInTheDocument();
    expect(table.getByText("$1,912.50")).toBeInTheDocument();
    expect(screen.getByText("Discount (10%)")).toBeInTheDocument();
    expect(screen.getByText("−$220.25")).toBeInTheDocument();
    expect(screen.getByText("$21.53")).toBeInTheDocument();
    expect(screen.getByText("$2,003.78")).toBeInTheDocument();
    expect(screen.getByText("Installation in the first week of November.")).toBeInTheDocument();
    expect(screen.getByText("Payment within 30 days.")).toBeInTheDocument();
  });

  it("shows an expired quote as Expired, in words, and when it was sent", async () => {
    await renderQuote(expired);

    expect(within(header()).getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Oct 7, 2026")).toBeInTheDocument();
  });

  it("shows not found for a quote that is gone or out of reach", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "No", details: null };
    vi.mocked(getQuote).mockRejectedValue(notFound);
    renderWithStore(<QuoteDetailPage id="missing" />, { me: repUser });

    expect(await screen.findByText("Quote not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to quotes" })).toBeInTheDocument();
  });

  // The transition table of the API: each status offers exactly what the API will take.
  it.each([
    {
      quote: draft,
      buttons: ["Edit", "Send", "Accept", ...FILE],
      send: ["Mark as sent", "Send by email..."],
      more: ["Decline", "Duplicate", "Delete"],
    },
    {
      quote: sent,
      buttons: ["Send by email again", "Accept", "Decline", ...FILE],
      send: [],
      more: ["Reopen", "Duplicate"],
    },
    {
      // An expired quote takes every action a sent one takes.
      quote: expired,
      buttons: ["Send by email again", "Accept", "Decline", ...FILE],
      send: [],
      more: ["Reopen", "Duplicate"],
    },
    {
      quote: accepted,
      buttons: ["Create invoice", ...FILE],
      send: [],
      more: ["Reopen", "Duplicate"],
    },
    {
      // With an invoice there is nothing to create and no way back to a draft.
      quote: invoiced,
      buttons: ["View invoice INV-0001", ...FILE],
      send: [],
      more: ["Duplicate"],
    },
    { quote: declined, buttons: ["Reopen", ...FILE], send: [], more: ["Duplicate"] },
  ])("offers a writer the actions of a $quote.status quote", async ({ quote, ...expected }) => {
    const { user } = await renderQuote(quote, managerUser);

    expect(await offered(user)).toEqual(expected);
  });

  it.each([
    { quote: draft, buttons: FILE },
    { quote: sent, buttons: FILE },
    { quote: expired, buttons: FILE },
    { quote: accepted, buttons: FILE },
    { quote: invoiced, buttons: ["View invoice INV-0001", ...FILE] },
    { quote: declined, buttons: FILE },
  ])(
    "offers a Read-only user only the PDF and Print for a $quote.status quote",
    async ({ quote, buttons }) => {
      const { user } = await renderQuote(quote, readOnlyUser);

      expect(await offered(user)).toEqual({ buttons, send: [], more: [] });
      expect(within(header()).getByRole("link", { name: "Print" })).toHaveAttribute(
        "href",
        `/quotes/${quote.id}/print`,
      );
    },
  );

  it("downloads the quote's PDF under the name the API gave it", async () => {
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    vi.mocked(downloadQuotePdf).mockResolvedValue({
      blob,
      filename: "Q-0002.pdf",
      truncated: false,
    });
    const { user } = await renderQuote(sent, readOnlyUser);

    await user.click(within(header()).getByRole("button", { name: "Download PDF" }));

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(blob, "Q-0002.pdf");
    });
    expect(downloadQuotePdf).toHaveBeenCalledWith(sent.id, "Q-0002");
    expect(toast.success).toHaveBeenCalledWith("Q-0002.pdf was downloaded.");
  });

  it("says why the PDF could not be downloaded", async () => {
    const refused: ApiError = { code: "NOT_FOUND", message: "Quote not found", details: null };
    vi.mocked(downloadQuotePdf).mockRejectedValue(refused);
    const { user } = await renderQuote();

    await user.click(within(header()).getByRole("button", { name: "Download PDF" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/^The PDF could not be downloaded\. /),
      );
    });
    expect(saveFile).not.toHaveBeenCalled();
    expect(within(header()).getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  it("switches Send and Accept off for a draft without lines, and says why", async () => {
    await renderQuote(bare);

    expect(within(header()).getByRole("button", { name: "Send" })).toBeDisabled();
    expect(within(header()).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByText(/Add at least one line before you send or accept/)).toBeInTheDocument();
    expect(screen.getByText(/No line items yet/)).toBeInTheDocument();
  });

  it("links Edit to the editor", async () => {
    await renderQuote();

    expect(within(header()).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/quotes/${draft.id}/edit`,
    );
  });

  it("marks a draft as sent without an email", async () => {
    vi.mocked(sendQuote).mockResolvedValue({ ...draft, status: "SENT" });
    const { user } = await renderQuote();

    await chooseFromMenu(user, "Send", "Mark as sent");

    await waitFor(() => {
      expect(sendQuote).toHaveBeenCalledWith(draft.id, undefined);
    });
    expect(await within(header()).findByText("Sent")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Quote Q-0001 was marked as sent.");
    // Nothing offers to close the opportunity: that is for an accepted quote only.
    expect(getOpportunity).not.toHaveBeenCalled();
  });

  it("sends a draft by email through the composer, from the quote's opportunity", async () => {
    vi.mocked(sendQuote).mockResolvedValue({ ...draft, status: "SENT" });
    const { user } = await renderQuote();

    await chooseFromMenu(user, "Send", "Send by email...");
    const dialog = within(await screen.findByRole("dialog", { name: "Email quote Q-0001" }));
    expect(dialog.getByText(/Q-0001.pdf will be attached/)).toBeInTheDocument();
    expect(dialog.getByText(/A short summary \(the dates and the totals\)/)).toBeInTheDocument();
    expect(dialog.getByText(/Please find our quote {{quote.number}} .* attached/)).toBeVisible();
    expect(dialog.getByText(`record: OPPORTUNITY ${draft.opportunity.id}`)).toBeInTheDocument();
    expect(dialog.getByText(/subject: Quote {{quote.number}} from {{sender.name}}/)).toBeVisible();
    expect(dialog.getByText(/The total is {{quote.total}}/)).toBeInTheDocument();
    expect(dialog.getByText("quote placeholders: true")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Send email" }));

    // The quote's route takes to, cc, subject and body: the template id is left out.
    await waitFor(() => {
      expect(sendQuote).toHaveBeenCalledWith(draft.id, {
        to: ["m.chen@northwind.example"],
        cc: ["boss@northwind.example"],
        subject: "Your quote",
        body: "Hello Marcus",
      });
    });
    expect(await within(header()).findByText("Sent")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("emails a sent quote again, and leaves a refused email to the composer", async () => {
    const refused: ApiError = { code: "EMAIL_SEND_FAILED", message: "Refused", details: null };
    vi.mocked(sendQuote).mockRejectedValue(refused);
    const { user } = await renderQuote(sent);

    await user.click(within(header()).getByRole("button", { name: "Send by email again" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Email quote Q-0002" }));
    await user.click(dialog.getByRole("button", { name: "Send email" }));

    // The composer shows the rejection and keeps the draft; the quote is as it was.
    expect(await dialog.findByText("refused: EMAIL_SEND_FAILED")).toBeInTheDocument();
    expect(within(header()).getByText("Sent")).toBeInTheDocument();
    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it("loads the quote again when the email is refused because its status changed", async () => {
    const refused: ApiError = {
      code: "INVALID_STATUS_CHANGE",
      message: "No",
      details: { status: "ACCEPTED" },
    };
    vi.mocked(sendQuote).mockRejectedValue(refused);
    const { user } = await renderQuote(sent);
    vi.mocked(getQuote).mockResolvedValue(accepted);

    await user.click(within(header()).getByRole("button", { name: "Send by email again" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Email quote Q-0002" }));
    await user.click(dialog.getByRole("button", { name: "Send email" }));

    expect(await dialog.findByText("refused: INVALID_STATUS_CHANGE")).toBeInTheDocument();
    expect(await within(header()).findByText("Accepted")).toBeInTheDocument();
  });

  it.each([
    { quote: sent, button: "Decline", action: "decline", status: "DECLINED", word: "Declined" },
    { quote: declined, button: "Reopen", action: "reopen", status: "DRAFT", word: "Draft" },
  ] as const)("sends $action from its button", async ({ quote, button, action, status, word }) => {
    vi.mocked(changeQuoteStatus).mockResolvedValue({ ...quote, status });
    const { user } = await renderQuote(quote);

    await user.click(within(header()).getByRole("button", { name: button }));

    await waitFor(() => {
      expect(changeQuoteStatus).toHaveBeenCalledWith(quote.id, action);
    });
    expect(await within(header()).findByText(word)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Mark opportunity won" })).not.toBeInTheDocument();
  });

  it.each([
    { quote: draft, item: "Decline", action: "decline" },
    { quote: sent, item: "Reopen", action: "reopen" },
    { quote: accepted, item: "Reopen", action: "reopen" },
  ] as const)("sends $action for a $quote.status quote from the menu", async (example) => {
    vi.mocked(changeQuoteStatus).mockResolvedValue({ ...example.quote, status: "DRAFT" });
    const { user } = await renderQuote(example.quote);

    await chooseFromMenu(user, "More actions", example.item);

    await waitFor(() => {
      expect(changeQuoteStatus).toHaveBeenCalledWith(example.quote.id, example.action);
    });
  });

  it("offers to mark the opportunity won after Accept, and never closes it by itself", async () => {
    vi.mocked(changeQuoteStatus).mockResolvedValue({ ...sent, status: "ACCEPTED" });
    const { user } = await renderQuote(sent);
    expect(screen.queryByRole("region", { name: "Mark opportunity won" })).not.toBeInTheDocument();

    await user.click(within(header()).getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(changeQuoteStatus).toHaveBeenCalledWith(sent.id, "accept");
    });
    const offer = within(await screen.findByRole("region", { name: "Mark opportunity won" }));
    expect(getOpportunity).toHaveBeenCalledWith(sent.opportunity.id);
    expect(offer.getByText(/Fleet Expansion is still open/)).toBeInTheDocument();
    expect(within(header()).getByText("Accepted")).toBeInTheDocument();
    // Accepting only offers: nothing was closed.
    expect(closeOpportunity).not.toHaveBeenCalled();

    // The button opens the usual close-as-won dialog; saving it closes the opportunity.
    await user.click(offer.getByRole("button", { name: "Mark opportunity won" }));
    const dialog = within(
      await screen.findByRole("dialog", { name: "Close Fleet Expansion as won" }),
    );
    expect(closeOpportunity).not.toHaveBeenCalled();
    vi.mocked(closeOpportunity).mockResolvedValue({ ...wonDeal, id: fleet.id });
    vi.mocked(getOpportunity).mockResolvedValue({ ...wonDeal, id: fleet.id });
    await user.click(dialog.getByRole("button", { name: "Close as won" }));

    await waitFor(() => {
      expect(closeOpportunity).toHaveBeenCalledWith(fleet.id, { outcome: "WON" });
    });
    // Once it is won there is nothing left to offer.
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Mark opportunity won" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the offer when the close dialog is cancelled, and drops it on Dismiss", async () => {
    vi.mocked(changeQuoteStatus).mockResolvedValue({ ...draft, status: "ACCEPTED" });
    const { user } = await renderQuote(draft);

    await user.click(within(header()).getByRole("button", { name: "Accept" }));
    const offer = () => screen.findByRole("region", { name: "Mark opportunity won" });
    await user.click(within(await offer()).getByRole("button", { name: "Mark opportunity won" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(closeOpportunity).not.toHaveBeenCalled();
    await user.click(within(await offer()).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Mark opportunity won" })).not.toBeInTheDocument();
  });

  it("makes no offer when the opportunity is already closed, or cannot be loaded", async () => {
    vi.mocked(changeQuoteStatus).mockResolvedValue({ ...sent, status: "ACCEPTED" });
    vi.mocked(getOpportunity).mockResolvedValue({ ...wonDeal, id: fleet.id });
    const { user } = await renderQuote(sent);

    await user.click(within(header()).getByRole("button", { name: "Accept" }));

    expect(await within(header()).findByText("Accepted")).toBeInTheDocument();
    await waitFor(() => {
      expect(getOpportunity).toHaveBeenCalled();
    });
    expect(screen.queryByRole("region", { name: "Mark opportunity won" })).not.toBeInTheDocument();
  });

  it("duplicates a quote into a new draft and opens it", async () => {
    vi.mocked(duplicateQuote).mockResolvedValue({ ...draft, id: "copy", number: "Q-0009" });
    const { user } = await renderQuote(declined);

    await chooseFromMenu(user, "More actions", "Duplicate");

    await waitFor(() => {
      expect(duplicateQuote).toHaveBeenCalledWith(declined.id);
    });
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith("/quotes/copy");
    });
    expect(toast.success).toHaveBeenCalledWith("Quote Q-0009 was made as a draft copy of Q-0006.");
  });

  it("deletes a draft after asking, and goes back to the list", async () => {
    vi.mocked(deleteQuote).mockResolvedValue();
    const { user } = await renderQuote();

    await chooseFromMenu(user, "More actions", "Delete");
    const dialog = within(await screen.findByRole("alertdialog", { name: "Delete Q-0001?" }));
    expect(deleteQuote).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteQuote).toHaveBeenCalledWith(draft.id);
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/quotes");
    });
  });

  it("creates the invoice after asking, and opens it", async () => {
    const invoice = { ...sentInvoice, quote: { id: accepted.id, number: accepted.number } };
    vi.mocked(createInvoice).mockResolvedValue(invoice);
    const { user } = await renderQuote(accepted);

    await user.click(within(header()).getByRole("button", { name: "Create invoice" }));
    const dialog = within(
      await screen.findByRole("alertdialog", { name: "Create an invoice from Q-0004?" }),
    );
    expect(dialog.getByText(/cannot be deleted, only\s+voided/)).toBeInTheDocument();
    expect(createInvoice).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Create invoice" }));

    await waitFor(() => {
      expect(createInvoice).toHaveBeenCalledWith(accepted.id, undefined);
    });
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(`/invoices/${invoice.id}`);
    });
    expect(toast.success).toHaveBeenCalledWith(`Invoice ${invoice.number} was created.`);
  });

  it("links to the invoice a quote already has", async () => {
    await renderQuote(invoiced);

    expect(within(header()).getByRole("link", { name: "View invoice INV-0001" })).toHaveAttribute(
      "href",
      `/invoices/${invoiced.invoice?.id ?? ""}`,
    );
  });

  it("says that the invoice exists, links to it and reloads the quote", async () => {
    const exists: ApiError = {
      code: "INVOICE_EXISTS",
      message: "No",
      details: { invoice: { id: "invoice-7", number: "INV-0007" } },
    };
    vi.mocked(createInvoice).mockRejectedValue(exists);
    const { user } = await renderQuote(accepted);
    // Someone else made the invoice in the meantime: the reload shows it.
    vi.mocked(getQuote).mockResolvedValue({
      ...accepted,
      invoice: { id: "invoice-7", number: "INV-0007" },
    });

    await user.click(within(header()).getByRole("button", { name: "Create invoice" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Create invoice",
      }),
    );

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText(/already has an invoice/)).toBeInTheDocument();
    expect(alert.getByRole("link", { name: "View invoice INV-0007" })).toHaveAttribute(
      "href",
      "/invoices/invoice-7",
    );
    expect(
      await within(header()).findByRole("link", { name: "View invoice INV-0007" }),
    ).toBeInTheDocument();
    expect(within(header()).queryByRole("button", { name: "Create invoice" })).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("says that the status changed and shows the status the quote really has", async () => {
    const changed: ApiError = {
      code: "INVALID_STATUS_CHANGE",
      message: "No",
      details: { status: "DECLINED" },
      requestId: "req-42",
    };
    vi.mocked(changeQuoteStatus).mockRejectedValue(changed);
    const { user } = await renderQuote(sent);
    vi.mocked(getQuote).mockResolvedValue(declined);

    await user.click(within(header()).getByRole("button", { name: "Accept" }));

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText(/the status has changed in the meantime/)).toBeInTheDocument();
    expect(alert.getByText("Request id: req-42")).toBeInTheDocument();
    expect(await within(header()).findByText("Declined")).toBeInTheDocument();
    expect(getQuote).toHaveBeenCalledTimes(2);
    // No offer after an Accept that did not happen.
    expect(getOpportunity).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains a refused delete in the dialog and reloads a quote that is no longer a draft", async () => {
    const refused: ApiError = { code: "QUOTE_NOT_EDITABLE", message: "No", details: null };
    vi.mocked(deleteQuote).mockRejectedValue(refused);
    const { user } = await renderQuote();
    vi.mocked(getQuote).mockResolvedValue({ ...draft, status: "SENT" });

    await chooseFromMenu(user, "More actions", "Delete");
    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    expect(await dialog.findByText(/no longer a draft/)).toBeInTheDocument();
    expect(await within(header()).findByText("Sent")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows any other failure above the quote without loading it again", async () => {
    const forbidden: ApiError = { code: "FORBIDDEN", message: "No", details: null };
    vi.mocked(changeQuoteStatus).mockRejectedValue(forbidden);
    const { user } = await renderQuote(sent);

    await user.click(within(header()).getByRole("button", { name: "Decline" }));

    expect(
      await within(await screen.findByRole("alert")).findByText(
        "You do not have permission to do that.",
      ),
    ).toBeInTheDocument();
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(within(header()).getByText("Sent")).toBeInTheDocument();
  });
});
