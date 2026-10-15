import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import type { ApiError } from "@/lib/api/http";
import { formatDateTime } from "@/lib/format";
import { saveFile } from "@/lib/save-file";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { InvoiceDetailPage } from "./invoice-detail-page";
import { changeInvoiceStatus, downloadInvoicePdf, getInvoice, updateInvoice } from "./invoices.api";
import { draft, markedOverdue, overdue, paid, sent, voided } from "./invoices.fixtures";
import type { Invoice } from "./invoices.types";

vi.mock("./invoices.api");
vi.mock("sonner");
vi.mock("@/lib/save-file");

type TestUser = ReturnType<typeof renderWithStore>["user"];

// Past its due date whenever the tests run.
const pastDue: Invoice = { ...overdue, dueDate: "2020-01-15", issueDate: "2019-12-16" };

const STATUS_BUTTONS = ["Mark sent", "Mark paid", "Mark overdue", "Mark unpaid", "Void", "Restore"];

async function renderInvoice(invoice: Invoice, me: Me = adminUser) {
  vi.mocked(getInvoice).mockResolvedValue(invoice);
  const view = renderWithStore(<InvoiceDetailPage id={invoice.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: invoice.number });
  return view;
}

// What the header offers: the main button, and the items of the "More actions" menu.
async function offered(user: TestUser) {
  const main = STATUS_BUTTONS.filter((name) => screen.queryByRole("button", { name }));
  const more = screen.queryByRole("button", { name: "More actions" });
  if (!more) {
    return { main, menu: [] };
  }
  await user.click(more);
  const menu = within(await screen.findByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  return { main, menu };
}

async function chooseFromMenu(user: TestUser, name: string) {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name }));
}

describe("InvoiceDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the invoice: header facts, links, buyer, dates, lines, totals, notes and terms", async () => {
    await renderInvoice(sent);

    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Sent")).toBeInTheDocument();
    expect(header.getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${sent.company?.id ?? ""}`,
    );
    expect(header.getByText("Total: $5,253.10")).toBeInTheDocument();
    expect(header.getByText("Due: Nov 4, 2099")).toBeInTheDocument();
    expect(header.getByRole("link", { name: "From quote Q-0003" })).toHaveAttribute(
      "href",
      `/quotes/${sent.quote.id}`,
    );
    expect(header.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${sent.opportunity.id}`,
    );
    expect(screen.getByRole("link", { name: "Back to invoices" })).toHaveAttribute(
      "href",
      "/invoices",
    );

    const buyer = within(screen.getByRole("region", { name: "Bill to" }));
    expect(buyer.getByText("Northwind Logistics")).toBeInTheDocument();
    expect(buyer.getByText("Marcus Chen")).toBeInTheDocument();
    expect(buyer.getByText("m.chen@northwind.example")).toBeInTheDocument();
    expect(screen.getByText("Issue date").nextSibling).toHaveTextContent("Oct 5, 2026");
    expect(screen.getByText("Due date").nextSibling).toHaveTextContent("Nov 4, 2099");

    const lines = within(screen.getByRole("table", { name: "Line items" }));
    expect(lines.getAllByRole("row")).toHaveLength(sent.lines.length + 1);
    expect(lines.getByRole("row", { name: /Fleet tracking licence/ })).toHaveTextContent(
      "Fleet tracking licence120$29.0010%8.25%$3,132.00",
    );
    expect(screen.getByText("Subtotal", { selector: "dt" }).nextSibling).toHaveTextContent(
      "$5,257.00",
    );
    expect(screen.getByText("Discount", { selector: "dt" }).nextSibling).toHaveTextContent(
      "−$250.00",
    );
    expect(screen.getByText("Tax", { selector: "dt" }).nextSibling).toHaveTextContent("$246.10");
    expect(screen.getByText("Total", { selector: "dt" }).nextSibling).toHaveTextContent(
      "$5,253.10",
    );
    expect(screen.getByText("Please quote PO 4417.")).toBeInTheDocument();
    expect(screen.getByText("Payment is due within 30 days.")).toBeInTheDocument();
  });

  it("says when a sent invoice was sent, and when a paid one was paid", async () => {
    const first = await renderInvoice(sent);
    expect(screen.getByRole("region", { name: "Status" })).toHaveTextContent(
      `Sent on ${formatDateTime(sent.sentAt ?? "")}. Payment is due on Nov 4, 2099.`,
    );
    first.unmount();

    await renderInvoice(paid);
    const when = formatDateTime(paid.paidAt ?? "");
    expect(screen.getByRole("region", { name: "Status" })).toHaveTextContent(`Paid on ${when}.`);
    expect(screen.getByText("Paid", { selector: "dt" }).nextSibling).toHaveTextContent(when);
  });

  it("says overdue in words, and that marking a draft as sent emails nothing", async () => {
    const first = await renderInvoice(pastDue);
    expect(within(screen.getByRole("banner")).getByText("Overdue")).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByText(/Overdue · due Jan 15, 2020/),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Status" })).toHaveTextContent(
      "Overdue: payment was due on Jan 15, 2020.",
    );
    first.unmount();

    const second = await renderInvoice(markedOverdue);
    expect(screen.getByRole("region", { name: "Status" })).toHaveTextContent(
      "Overdue: marked overdue by hand. Its due date is Nov 4, 2099.",
    );
    second.unmount();

    const third = await renderInvoice(draft);
    expect(screen.getByRole("region", { name: "Status" })).toHaveTextContent(
      "Nothing is emailed from here.",
    );
    third.unmount();

    await renderInvoice(voided);
    expect(screen.getByRole("region", { name: "Status" })).toHaveTextContent(
      "It keeps its number, and quote Q-0003 still cannot be reopened or invoiced again.",
    );
    expect(screen.getByText("No buyer on this invoice.")).toBeInTheDocument();
  });

  describe("what each status offers", () => {
    const EDIT = "Edit due date and notes";
    const cases: [string, Invoice, string[], string[]][] = [
      ["a draft", draft, ["Mark sent"], [EDIT, "Mark paid", "Void"]],
      ["a sent invoice", sent, ["Mark paid"], [EDIT, "Mark overdue", "Void"]],
      // Reads as overdue because its due date passed: it is stored as SENT, so no "Mark unpaid".
      ["an invoice past its due date", pastDue, ["Mark paid"], [EDIT, "Void"]],
      // Marked overdue by hand before its due date: stored as OVERDUE.
      ["an invoice marked overdue", markedOverdue, ["Mark paid"], [EDIT, "Mark unpaid", "Void"]],
      ["a paid invoice", paid, ["Mark unpaid"], [EDIT]],
      // Nothing on a void invoice can be edited.
      ["a void invoice", voided, ["Restore"], []],
    ];

    it.each(cases)("%s, for everyone who may change it", async (_name, invoice, main, menu) => {
      for (const me of [adminUser, managerUser, repUser]) {
        const { user, unmount } = await renderInvoice(invoice, me);
        expect(await offered(user)).toEqual({ main, menu });
        expect(screen.getByRole("link", { name: "Print" })).toHaveAttribute(
          "href",
          `/invoices/${invoice.id}/print`,
        );
        unmount();
      }
    });

    it.each(cases)("%s: a Read-only user only reads and prints", async (_name, invoice) => {
      const { user } = await renderInvoice(invoice, readOnlyUser);

      expect(await offered(user)).toEqual({ main: [], menu: [] });
      expect(screen.getByRole("link", { name: "Print" })).toHaveAttribute(
        "href",
        `/invoices/${invoice.id}/print`,
      );
      expect(screen.getByRole("table", { name: "Line items" })).toBeInTheDocument();
    });
  });

  it("downloads the invoice's PDF for every role, a Read-only user too", async () => {
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    vi.mocked(downloadInvoicePdf).mockResolvedValue({
      blob,
      filename: `${sent.number}.pdf`,
      truncated: false,
    });
    const { user } = await renderInvoice(sent, readOnlyUser);

    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(blob, `${sent.number}.pdf`);
    });
    expect(downloadInvoicePdf).toHaveBeenCalledWith(sent.id, sent.number);
  });

  describe("status changes", () => {
    it("marks a draft as sent at once, and says nothing was emailed", async () => {
      vi.mocked(changeInvoiceStatus).mockResolvedValue({ ...draft, status: "SENT" });
      const { user } = await renderInvoice(draft);

      await user.click(screen.getByRole("button", { name: "Mark sent" }));

      expect(changeInvoiceStatus).toHaveBeenCalledWith(draft.id, "mark-sent", undefined);
      expect(await within(screen.getByRole("banner")).findByText("Sent")).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith(
        "INV-0002 was marked as sent. Nothing was emailed.",
      );
    });

    it.each([
      ["Mark overdue", "mark-overdue", sent, "OVERDUE"],
      ["Mark unpaid", "mark-unpaid", markedOverdue, "SENT"],
    ] as const)("%s from the menu calls its action", async (name, action, invoice, status) => {
      vi.mocked(changeInvoiceStatus).mockResolvedValue({ ...invoice, status });
      const { user } = await renderInvoice(invoice);

      await chooseFromMenu(user, name);

      await waitFor(() => {
        expect(changeInvoiceStatus).toHaveBeenCalledWith(invoice.id, action, undefined);
      });
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it("marks a paid invoice unpaid and restores a void one with their main buttons", async () => {
      vi.mocked(changeInvoiceStatus).mockResolvedValue({ ...paid, status: "SENT", paidAt: null });
      const first = await renderInvoice(paid);
      await first.user.click(screen.getByRole("button", { name: "Mark unpaid" }));
      expect(changeInvoiceStatus).toHaveBeenCalledWith(paid.id, "mark-unpaid", undefined);
      expect(await screen.findByRole("button", { name: "Mark paid" })).toBeInTheDocument();
      first.unmount();

      vi.mocked(changeInvoiceStatus).mockResolvedValue({ ...voided, status: "DRAFT" });
      const second = await renderInvoice(voided);
      await second.user.click(screen.getByRole("button", { name: "Restore" }));
      expect(changeInvoiceStatus).toHaveBeenLastCalledWith(voided.id, "restore", undefined);
      expect(await screen.findByRole("button", { name: "Mark sent" })).toBeInTheDocument();
    });

    it("marks as paid now when the paid date is left empty", async () => {
      vi.mocked(changeInvoiceStatus).mockResolvedValue({
        ...sent,
        status: "PAID",
        paidAt: "2026-10-08T10:30:00.000Z",
      });
      const { user } = await renderInvoice(sent);

      await user.click(screen.getByRole("button", { name: "Mark paid" }));
      const dialog = within(await screen.findByRole("dialog"));
      expect(dialog.getByLabelText("Paid on (optional)")).toHaveValue("");
      await user.click(dialog.getByRole("button", { name: "Mark paid" }));

      await waitFor(() => {
        expect(changeInvoiceStatus).toHaveBeenCalledWith(sent.id, "mark-paid", undefined);
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(within(screen.getByRole("banner")).getByText("Paid")).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith("INV-0003 was marked as paid.");
    });

    it("sends a chosen paid date as an exact moment", async () => {
      vi.mocked(changeInvoiceStatus).mockResolvedValue({ ...sent, status: "PAID" });
      const { user } = await renderInvoice(sent);

      await user.click(screen.getByRole("button", { name: "Mark paid" }));
      const dialog = within(await screen.findByRole("dialog"));
      fireEvent.change(dialog.getByLabelText("Paid on (optional)"), {
        target: { value: "2026-10-08T10:30" },
      });
      await user.click(dialog.getByRole("button", { name: "Mark paid" }));

      await waitFor(() => {
        expect(changeInvoiceStatus).toHaveBeenCalledWith(
          sent.id,
          "mark-paid",
          // The input is local time; the API gets the moment it stands for.
          new Date(2026, 9, 8, 10, 30).toISOString(),
        );
      });
    });

    it("refuses a paid date in the future without asking the API, and shows the API's own refusal on the field", async () => {
      const { user } = await renderInvoice(sent);

      await user.click(screen.getByRole("button", { name: "Mark paid" }));
      const dialog = within(await screen.findByRole("dialog"));
      const input = dialog.getByLabelText("Paid on (optional)");
      fireEvent.change(input, { target: { value: "2999-01-01T09:00" } });
      await user.click(dialog.getByRole("button", { name: "Mark paid" }));

      expect(await dialog.findByText("A payment cannot be in the future.")).toBeInTheDocument();
      expect(changeInvoiceStatus).not.toHaveBeenCalled();

      vi.mocked(changeInvoiceStatus).mockRejectedValue({
        code: "VALIDATION_FAILED",
        message: "Invalid",
        details: [{ path: "paidAt", message: "A payment cannot be in the future" }],
      } satisfies ApiError);
      fireEvent.change(input, { target: { value: "2026-10-08T10:30" } });
      await user.click(dialog.getByRole("button", { name: "Mark paid" }));

      expect(await dialog.findByText("A payment cannot be in the future")).toBeInTheDocument();
      // The dialog stays open with what was typed.
      expect(input).toHaveValue("2026-10-08T10:30");
    });

    it("asks before voiding, says what a void invoice keeps, and voids only on confirmation", async () => {
      vi.mocked(changeInvoiceStatus).mockResolvedValue({ ...sent, status: "VOID" });
      const { user } = await renderInvoice(sent);

      await chooseFromMenu(user, "Void");
      const dialog = within(await screen.findByRole("dialog"));
      expect(dialog.getByRole("heading", { name: "Void INV-0003?" })).toBeInTheDocument();
      expect(
        dialog.getByText(
          /It keeps its number, and its quote Q-0003 still cannot be reopened or invoiced again/,
        ),
      ).toBeInTheDocument();
      expect(changeInvoiceStatus).not.toHaveBeenCalled();

      await user.click(dialog.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(changeInvoiceStatus).not.toHaveBeenCalled();

      await chooseFromMenu(user, "Void");
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Void invoice" }),
      );
      await waitFor(() => {
        expect(changeInvoiceStatus).toHaveBeenCalledWith(sent.id, "void", undefined);
      });
      expect(await within(screen.getByRole("banner")).findByText("Void")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
    });

    it("keeps the void dialog open with the reason when the API refuses", async () => {
      vi.mocked(changeInvoiceStatus).mockRejectedValue({
        code: "FORBIDDEN",
        message: "No",
        details: null,
      } satisfies ApiError);
      const { user } = await renderInvoice(sent);

      await chooseFromMenu(user, "Void");
      const dialog = within(await screen.findByRole("dialog"));
      await user.click(dialog.getByRole("button", { name: "Void invoice" }));

      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "You do not have permission to do that.",
      );
      expect(dialog.getByRole("button", { name: "Void invoice" })).toBeEnabled();
    });

    it("on INVALID_STATUS_CHANGE says so and loads the invoice again, so the page shows its real status", async () => {
      const refused: ApiError = {
        code: "INVALID_STATUS_CHANGE",
        message: "An invoice that is PAID cannot be marked overdue",
        details: { status: "PAID" },
      };
      vi.mocked(changeInvoiceStatus).mockRejectedValue(refused);
      const { user } = await renderInvoice(sent);
      vi.mocked(getInvoice).mockResolvedValue(paid);

      await chooseFromMenu(user, "Mark overdue");

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "That is no longer possible: the status has changed in the meantime. The page now shows the current status.",
        );
      });
      expect(getInvoice).toHaveBeenCalledTimes(2);
      expect(await within(screen.getByRole("banner")).findByText("Paid")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Mark unpaid" })).toBeInTheDocument();
    });

    it("closes the paid dialog and reloads on INVALID_STATUS_CHANGE too", async () => {
      vi.mocked(changeInvoiceStatus).mockRejectedValue({
        code: "INVALID_STATUS_CHANGE",
        message: "Void",
        details: { status: "VOID" },
      } satisfies ApiError);
      const { user } = await renderInvoice(sent);
      vi.mocked(getInvoice).mockResolvedValue({ ...sent, status: "VOID" });

      await user.click(screen.getByRole("button", { name: "Mark paid" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Mark paid" }),
      );

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
    });

    it("shows any other failure of a direct action as a toast, and changes nothing", async () => {
      vi.mocked(changeInvoiceStatus).mockRejectedValue({
        code: "NETWORK_ERROR",
        message: "x",
        details: null,
      } satisfies ApiError);
      const { user } = await renderInvoice(draft);

      await user.click(screen.getByRole("button", { name: "Mark sent" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "The server cannot be reached. Check your connection and try again.",
        );
      });
      expect(getInvoice).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Mark sent" })).toBeEnabled();
    });
  });

  describe("editing the due date and the notes", () => {
    async function openEdit(invoice: Invoice = sent) {
      const view = await renderInvoice(invoice);
      await chooseFromMenu(view.user, "Edit due date and notes");
      const dialog = within(await screen.findByRole("dialog"));
      return { ...view, dialog };
    }

    it("starts from the invoice and sends only what changed", async () => {
      vi.mocked(updateInvoice).mockResolvedValue({ ...sent, dueDate: "2099-12-01" });
      const { user, dialog } = await openEdit();

      expect(dialog.getByLabelText("Due date")).toHaveValue("2099-11-04");
      expect(dialog.getByLabelText("Notes")).toHaveValue("Please quote PO 4417.");
      fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: "2099-12-01" } });
      await user.click(dialog.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(updateInvoice).toHaveBeenCalledWith(sent.id, { dueDate: "2099-12-01" });
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(within(screen.getByRole("banner")).getByText("Due: Dec 1, 2099")).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith("INV-0003 was saved.");
    });

    it("sends emptied notes as null, and nothing at all when nothing changed", async () => {
      vi.mocked(updateInvoice).mockResolvedValue({ ...sent, notes: null });
      const { user, dialog } = await openEdit();

      await user.clear(dialog.getByLabelText("Notes"));
      await user.click(dialog.getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(updateInvoice).toHaveBeenCalledWith(sent.id, { notes: null });
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      vi.mocked(updateInvoice).mockClear();
      await chooseFromMenu(user, "Edit due date and notes");
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }),
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(updateInvoice).not.toHaveBeenCalled();
    });

    it("refuses a due date before the issue date without asking the API", async () => {
      const { user, dialog } = await openEdit();

      fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: "2026-10-04" } });
      await user.click(dialog.getByRole("button", { name: "Save" }));

      expect(
        await dialog.findByText("The due date cannot be before the issue date (Oct 5, 2026)."),
      ).toBeInTheDocument();

      fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: "" } });
      await user.click(dialog.getByRole("button", { name: "Save" }));
      expect(await dialog.findByText("Choose a due date.")).toBeInTheDocument();
      expect(updateInvoice).not.toHaveBeenCalled();
    });

    it("accepts the issue date itself as the due date", async () => {
      vi.mocked(updateInvoice).mockResolvedValue({ ...sent, dueDate: sent.issueDate });
      const { user, dialog } = await openEdit();

      fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: sent.issueDate } });
      await user.click(dialog.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(updateInvoice).toHaveBeenCalledWith(sent.id, { dueDate: sent.issueDate });
      });
    });

    it("puts the API's dueDate error on the field and keeps what was typed", async () => {
      vi.mocked(updateInvoice).mockRejectedValue({
        code: "VALIDATION_FAILED",
        message: "Invalid",
        details: [{ path: "dueDate", message: "An invoice cannot be due before its issue date" }],
      } satisfies ApiError);
      const { user, dialog } = await openEdit();

      fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: "2099-12-24" } });
      await user.type(dialog.getByLabelText("Notes"), " Thanks.");
      await user.click(dialog.getByRole("button", { name: "Save" }));

      expect(
        await dialog.findByText("An invoice cannot be due before its issue date"),
      ).toBeInTheDocument();
      expect(dialog.getByLabelText("Due date")).toHaveValue("2099-12-24");
      expect(dialog.getByLabelText("Notes")).toHaveValue("Please quote PO 4417. Thanks.");
      // Nothing above the form: the problem is on its field.
      expect(dialog.queryByText(/Some of the details are not valid/)).not.toBeInTheDocument();
    });

    it("shows any other failure above the form", async () => {
      vi.mocked(updateInvoice).mockRejectedValue({
        code: "FORBIDDEN",
        message: "No",
        details: null,
      } satisfies ApiError);
      const { user, dialog } = await openEdit();

      await user.type(dialog.getByLabelText("Notes"), " More.");
      await user.click(dialog.getByRole("button", { name: "Save" }));

      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "You do not have permission to do that.",
      );
    });
  });

  it("shows not found for an invoice that does not exist or is out of reach, and a failed load with Retry", async () => {
    vi.mocked(getInvoice).mockRejectedValueOnce({
      code: "NOT_FOUND",
      message: "x",
      details: null,
    } satisfies ApiError);
    const first = renderWithStore(<InvoiceDetailPage id={sent.id} />, { me: adminUser });
    expect(await screen.findByText("Invoice not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to invoices" })).toHaveAttribute(
      "href",
      "/invoices",
    );
    first.unmount();

    vi.mocked(getInvoice)
      .mockRejectedValueOnce({
        code: "SERVICE_UNAVAILABLE",
        message: "x",
        details: null,
      } satisfies ApiError)
      .mockResolvedValue(sent);
    const { user } = renderWithStore(<InvoiceDetailPage id={sent.id} />, { me: adminUser });
    expect(screen.getByText("Loading invoice...")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "INV-0003" })).toBeInTheDocument();
  });
});
