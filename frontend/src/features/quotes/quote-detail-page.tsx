"use client";

import {
  Building2,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Copy,
  Ellipsis,
  FileText,
  Mail,
  Pencil,
  Printer,
  ReceiptText,
  RotateCcw,
  Send,
  Target,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { DeleteRecordDialog } from "@/components/shared/record-dialogs";
import {
  BackLink,
  DetailItem,
  DetailLink,
  DetailList,
  EmptyValue,
  RecordFact,
  RecordHeader,
} from "@/components/shared/record-layout";
import { discountLabel, DocumentLines, DocumentTotals } from "@/components/shared/sales-document";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectAuth } from "@/features/auth/auth.slice";
import type { EmailMessage } from "@/features/emails/emails.types";
import { SendEmailDialog } from "@/features/emails/send-email-dialog";
import { getOpportunity } from "@/features/opportunities/opportunities.api";
import type { Opportunity } from "@/features/opportunities/opportunities.types";
import { OpportunityDialogs } from "@/features/opportunities/opportunity-dialogs";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { formatDate, formatDay, formatMoney } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { quoteAccess, quoteActions } from "./quote-labels";
import { QuoteLoader } from "./quote-loader";
import { QuoteStatusBadge } from "./quote-status-badge";
import {
  changeQuoteStatus,
  createQuoteInvoice,
  deleteQuote,
  duplicateQuote,
  fetchQuote,
  sendQuote,
} from "./quotes.slice";
import type { Quote } from "./quotes.types";

// The codes that mean "the quote is not what this page shows any more" (someone else sent,
// accepted or invoiced it in the meantime). The page says so and loads the quote again.
const STALE_CODES = new Set<ApiError["code"]>([
  "QUOTE_NOT_EDITABLE",
  "INVALID_STATUS_CHANGE",
  "INVOICE_EXISTS",
]);

// What the email of a quote starts with. The placeholders are filled in by the API when the
// email is sent.
const EMAIL_SUBJECT = "Quote {{quote.number}} from {{sender.name}}";
const EMAIL_BODY = `Hello {{contact.firstName}},

Thank you for your interest. Please find our quote {{quote.number}} for {{opportunity.name}} below. The total is {{quote.total}}.

If you have any questions, or would like anything changed, just reply to this email.

Kind regards,
{{sender.name}}`;

// INVOICE_EXISTS names the invoice in `details.invoice`.
function invoiceOf(error: ApiError): { id: string; number: string } | null {
  const { details } = error;
  if (typeof details !== "object" || details === null || !("invoice" in details)) {
    return null;
  }
  const { invoice } = details;
  return typeof invoice === "object" &&
    invoice !== null &&
    "id" in invoice &&
    typeof invoice.id === "string" &&
    "number" in invoice &&
    typeof invoice.number === "string"
    ? { id: invoice.id, number: invoice.number }
    : null;
}

// What went wrong with the last action, above the quote. For INVOICE_EXISTS it links to the
// invoice the API named.
function ActionProblem({ error }: { error: ApiError }) {
  const invoice = error.code === "INVOICE_EXISTS" ? invoiceOf(error) : null;
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive flex min-w-0 items-start gap-3 rounded-lg border p-4 text-sm"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="wrap-anywhere">{describeApiError(error)}</p>
        {invoice ? (
          <p>
            <DetailLink href={`/invoices/${invoice.id}`}>View invoice {invoice.number}</DetailLink>
          </p>
        ) : null}
        {error.requestId ? (
          <p className="text-muted-foreground text-xs">Request id: {error.requestId}</p>
        ) : null}
      </div>
    </div>
  );
}

// Shown after a quote was accepted while its opportunity is still open. Accepting never
// closes the opportunity by itself: this only offers the close-as-won dialog.
function WonOffer({
  opportunity,
  onMarkWon,
  onDismiss,
}: {
  opportunity: Opportunity;
  onMarkWon: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Mark opportunity won"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900 dark:bg-emerald-950"
    >
      <div className="flex min-w-0 items-start gap-3">
        <CircleCheck
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"
        />
        <p className="min-w-0 text-sm wrap-anywhere">
          <span className="font-medium">The quote was accepted.</span> The opportunity{" "}
          {opportunity.name} is still open. Do you want to close it as won?
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" className="h-10 px-4" onClick={onMarkWon}>
          Mark opportunity won
        </Button>
        <Button type="button" variant="outline" className="h-10 px-4" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

// The quote as a document: who it is for, its dates, the lines, the totals, notes and terms.
// Every number is the API's.
function QuoteDocument({ quote }: { quote: Quote }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Quote {quote.number}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Block title="Prepared for">
            {quote.contact || quote.company ? (
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                {quote.contact ? (
                  <p className="font-medium wrap-anywhere">{quote.contact.name}</p>
                ) : null}
                {quote.company ? <p className="wrap-anywhere">{quote.company.name}</p> : null}
                {quote.contact?.email ? (
                  <p className="text-muted-foreground wrap-anywhere">{quote.contact.email}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No contact or company.</p>
            )}
          </Block>
          <DetailList>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Issue date">{formatDay(quote.issueDate)}</DetailItem>
              <DetailItem label="Valid until">
                {quote.validUntil ? formatDay(quote.validUntil) : <EmptyValue />}
              </DetailItem>
              <DetailItem label="Prepared by">{quote.createdBy.name}</DetailItem>
              {quote.sentAt ? (
                <DetailItem label="Sent">{formatDate(quote.sentAt)}</DetailItem>
              ) : null}
              {quote.acceptedAt ? (
                <DetailItem label="Accepted">{formatDate(quote.acceptedAt)}</DetailItem>
              ) : null}
              {quote.declinedAt ? (
                <DetailItem label="Declined">{formatDate(quote.declinedAt)}</DetailItem>
              ) : null}
            </div>
          </DetailList>
        </div>

        <DocumentLines
          lines={quote.lines}
          empty="No line items yet. A quote needs at least one before it can be sent or accepted."
        />

        <DocumentTotals
          subtotal={quote.subtotal}
          discountTotal={quote.discountTotal}
          discountLabel={discountLabel(quote.discountType, quote.discountValue)}
          taxTotal={quote.taxTotal}
          total={quote.total}
        />

        {quote.notes ? (
          <Block title="Notes">
            <p className="text-sm wrap-anywhere whitespace-pre-wrap">{quote.notes}</p>
          </Block>
        ) : null}
        {quote.terms ? (
          <Block title="Terms">
            <p className="text-sm wrap-anywhere whitespace-pre-wrap">{quote.terms}</p>
          </Block>
        ) : null}
      </CardContent>
    </Card>
  );
}

type OpenDialog = "email" | "invoice" | "delete" | "won" | null;

function QuoteDetail({ quote }: { quote: Quote }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  // The opportunity to offer "Mark opportunity won" for: set after Accept, while it is open.
  const [wonOffer, setWonOffer] = useState<Opportunity | null>(null);

  if (!me) {
    return null;
  }
  const { canWrite } = quoteAccess(me.role);
  const can = quoteActions(quote);
  const hasLines = quote.lines.length > 0;

  // Shows what went wrong and, when the quote changed under this page, loads it again so
  // the page shows the status it really has.
  function reloadIfStale(error: ApiError) {
    if (STALE_CODES.has(error.code)) {
      void dispatch(fetchQuote(quote.id));
    }
  }

  function showProblem(error: ApiError) {
    setProblem(error);
    reloadIfStale(error);
  }

  // A request whose rejection a dialog shows itself (the email composer, the delete
  // dialog): the dialog keeps what was typed, and the quote is still loaded again when it
  // changed under this page.
  async function watched<Result>(request: () => Promise<Result>): Promise<Result> {
    try {
      return await request();
    } catch (error) {
      reloadIfStale(error as ApiError);
      throw error;
    }
  }

  // The quote's own route takes `to`, `cc`, `subject` and `body` only.
  async function sendByEmail({ to, cc, subject, body }: EmailMessage): Promise<void> {
    await watched(() =>
      dispatch(sendQuote({ id: quote.id, email: { to, cc, subject, body } })).unwrap(),
    );
  }

  // One action of the page: the request, then a toast, or the problem above the quote.
  async function run<Result>(
    request: () => Promise<Result>,
    success: (result: Result) => string,
  ): Promise<Result | null> {
    setProblem(null);
    setWorking(true);
    try {
      const result = await request();
      toast.success(success(result));
      return result;
    } catch (error) {
      // The axios interceptor already turned every failure into an ApiError.
      showProblem(error as ApiError);
      return null;
    } finally {
      setWorking(false);
    }
  }

  const changeStatus = (action: "accept" | "decline" | "reopen", done: string) =>
    run(
      () => dispatch(changeQuoteStatus({ id: quote.id, action })).unwrap(),
      () => `Quote ${quote.number} ${done}.`,
    );

  // Asks for the opportunity and offers to close it as won, only while it is still open.
  async function offerWon() {
    try {
      const opportunity = await getOpportunity(quote.opportunity.id);
      setWonOffer(opportunity.status === "OPEN" ? opportunity : null);
    } catch {
      // Without the opportunity there is nothing to offer; the quote itself is fine.
      setWonOffer(null);
    }
  }

  async function accept() {
    if (await changeStatus("accept", "was accepted")) {
      await offerWon();
    }
  }

  async function duplicate() {
    const copy = await run(
      () => dispatch(duplicateQuote(quote.id)).unwrap(),
      (made) => `Quote ${made.number} was made as a draft copy of ${quote.number}.`,
    );
    if (copy) {
      router.push(`/quotes/${copy.id}`);
    }
  }

  async function createInvoice() {
    setDialog(null);
    const invoice = await run(
      () => dispatch(createQuoteInvoice({ id: quote.id })).unwrap(),
      (made) => `Invoice ${made.number} was created.`,
    );
    if (invoice) {
      router.push(`/invoices/${invoice.id}`);
    }
  }

  const company = quote.company ? (
    <DetailLink href={`/companies/${quote.company.id}`}>{quote.company.name}</DetailLink>
  ) : null;
  const contact = quote.contact ? (
    <DetailLink href={`/contacts/${quote.contact.id}`}>{quote.contact.name}</DetailLink>
  ) : null;

  const printButton = (
    <Button asChild variant="outline" className="h-10 px-4">
      <Link href={`/quotes/${quote.id}/print`}>
        <Printer aria-hidden />
        Print / PDF
      </Link>
    </Button>
  );

  // Only what the API takes for this status; a Read-only user gets Print alone.
  const actions = canWrite ? (
    <>
      {can.edit ? (
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href={`/quotes/${quote.id}/edit`}>
            <Pencil aria-hidden />
            Edit
          </Link>
        </Button>
      ) : null}
      {can.send ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" className="h-10 px-4" disabled={working || !hasLines}>
              <Send aria-hidden />
              Send
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onSelect={() =>
                void run(
                  () => dispatch(sendQuote({ id: quote.id })).unwrap(),
                  () => `Quote ${quote.number} was marked as sent.`,
                )
              }
            >
              <CircleCheck aria-hidden />
              Mark as sent
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setDialog("email");
              }}
            >
              <Mail aria-hidden />
              Send by email...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {can.sendAgain ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={working}
          onClick={() => {
            setDialog("email");
          }}
        >
          <Mail aria-hidden />
          Send by email again
        </Button>
      ) : null}
      {can.accept ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={working || !hasLines}
          onClick={() => void accept()}
        >
          <CircleCheck aria-hidden />
          Accept
        </Button>
      ) : null}
      {can.decline && !can.edit ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={working}
          onClick={() => void changeStatus("decline", "was declined")}
        >
          <CircleX aria-hidden />
          Decline
        </Button>
      ) : null}
      {can.createInvoice ? (
        <Button
          type="button"
          className="h-10 px-4"
          disabled={working}
          onClick={() => {
            setDialog("invoice");
          }}
        >
          <ReceiptText aria-hidden />
          Create invoice
        </Button>
      ) : null}
      {quote.invoice ? (
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href={`/invoices/${quote.invoice.id}`}>
            <ReceiptText aria-hidden />
            View invoice {quote.invoice.number}
          </Link>
        </Button>
      ) : null}
      {quote.status === "DECLINED" ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={working}
          onClick={() => void changeStatus("reopen", "is a draft again")}
        >
          <RotateCcw aria-hidden />
          Reopen
        </Button>
      ) : null}
      {printButton}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="size-10"
            aria-label="More actions"
            disabled={working}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* A draft keeps Decline here: its buttons are Edit, Send and Accept. */}
          {can.decline && can.edit ? (
            <DropdownMenuItem onSelect={() => void changeStatus("decline", "was declined")}>
              <CircleX aria-hidden />
              Decline
            </DropdownMenuItem>
          ) : null}
          {can.reopen && quote.status !== "DECLINED" ? (
            <DropdownMenuItem onSelect={() => void changeStatus("reopen", "is a draft again")}>
              <RotateCcw aria-hidden />
              Reopen
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void duplicate()}>
            <Copy aria-hidden />
            Duplicate
          </DropdownMenuItem>
          {can.remove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDialog("delete");
                }}
              >
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : (
    <>
      {/* The invoice is a record a Read-only user may open too. */}
      {quote.invoice ? (
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href={`/invoices/${quote.invoice.id}`}>
            <ReceiptText aria-hidden />
            View invoice {quote.invoice.number}
          </Link>
        </Button>
      ) : null}
      {printButton}
    </>
  );

  return (
    <>
      <BackLink href="/quotes" label="Back to quotes" />
      <RecordHeader
        title={quote.number}
        badge={<QuoteStatusBadge status={quote.status} />}
        meta={
          <>
            <RecordFact icon={<Target aria-hidden />}>
              <DetailLink href={`/opportunities/${quote.opportunity.id}`}>
                {quote.opportunity.name}
              </DetailLink>
            </RecordFact>
            {company ? <RecordFact icon={<Building2 aria-hidden />}>{company}</RecordFact> : null}
            {contact ? <RecordFact icon={<User aria-hidden />}>{contact}</RecordFact> : null}
            <RecordFact icon={<CircleDollarSign aria-hidden />}>
              Total: {formatMoney(quote.total)}
            </RecordFact>
            {quote.validUntil ? (
              <RecordFact icon={<CalendarDays aria-hidden />}>
                Valid until: {formatDay(quote.validUntil)}
              </RecordFact>
            ) : null}
          </>
        }
        actions={actions}
      />

      {problem ? <ActionProblem error={problem} /> : null}
      {canWrite && can.send && !hasLines ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <FileText aria-hidden className="size-4 shrink-0" />
          Add at least one line before you send or accept this quote.
        </p>
      ) : null}
      {wonOffer && canWrite ? (
        <WonOffer
          opportunity={wonOffer}
          onMarkWon={() => {
            setDialog("won");
          }}
          onDismiss={() => {
            setWonOffer(null);
          }}
        />
      ) : null}

      <QuoteDocument quote={quote} />

      {canWrite ? (
        <SendEmailDialog
          open={dialog === "email"}
          onOpenChange={(open) => {
            setDialog(open ? "email" : null);
          }}
          record={{ type: "OPPORTUNITY", id: quote.opportunity.id }}
          recordName={quote.opportunity.name}
          title={`Email quote ${quote.number}`}
          note="The email carries a text summary of the quote's lines and totals below your message. There is no attachment."
          initial={{ subject: EMAIL_SUBJECT, body: EMAIL_BODY }}
          withQuotePlaceholders
          send={sendByEmail}
        />
      ) : null}

      {dialog === "invoice" ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
        >
          <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Create an invoice from {quote.number}?</AlertDialogTitle>
              <AlertDialogDescription>
                The invoice is a copy of this quote: its buyer, lines, totals and terms. It is dated
                today and due after the organisation&apos;s payment terms; you can change the due
                date and the notes on the invoice. An invoice cannot be deleted, only voided, and
                once it exists this quote can no longer be reopened.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-10 px-4">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-10 px-4" onClick={() => void createInvoice()}>
                Create invoice
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {dialog === "delete" ? (
        <DeleteRecordDialog
          name={quote.number}
          description="The draft is removed for everyone, and its number is not used again. The opportunity keeps a note of it on its timeline. This cannot be undone."
          onDelete={() => watched(() => dispatch(deleteQuote(quote.id)).unwrap())}
          onClose={() => {
            setDialog(null);
          }}
          onDeleted={() => {
            router.replace("/quotes");
          }}
        />
      ) : null}

      <OpportunityDialogs
        dialog={
          dialog === "won" && wonOffer
            ? { kind: "close", outcome: "WON", opportunity: wonOffer }
            : null
        }
        onClose={() => {
          setDialog(null);
          // The dialog closes the same way after Cancel and after saving: ask whether the
          // opportunity is still open, and keep the offer only then.
          void offerWon();
        }}
      />
    </>
  );
}

// /quotes/[id]: the quote's header with the actions its status allows, and the quote as a
// document (QUOT-02, QUOT-03).
export function QuoteDetailPage({ id }: { id: string }) {
  return <QuoteLoader id={id}>{(quote) => <QuoteDetail quote={quote} />}</QuoteLoader>;
}
