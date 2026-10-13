"use client";

import {
  Ban,
  Building2,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  Ellipsis,
  FileText,
  Info,
  type LucideIcon,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Target,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode, useState } from "react";
import { toast } from "sonner";

import { BackLink, DetailLink, RecordFact, RecordHeader } from "@/components/shared/record-layout";
import { DocumentLines, DocumentTotals } from "@/components/shared/sales-document";
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
import { describeApiError } from "@/lib/api/error-messages";
import { formatDateTime, formatDay, formatMoney, toDateInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/store/hooks";

import { type InvoiceDialog, InvoiceDialogs } from "./invoice-dialogs";
import { INVOICE_ACTION_LABELS, invoiceAccess, invoiceActions } from "./invoice-labels";
import { InvoiceLoader } from "./invoice-loader";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import type { Invoice, InvoiceAction } from "./invoices.types";
import { useInvoiceStatus } from "./use-invoice-status";

const ACTION_ICONS: Record<InvoiceAction, LucideIcon> = {
  "mark-sent": Send,
  "mark-paid": CircleCheck,
  "mark-overdue": CircleAlert,
  "mark-unpaid": Undo2,
  void: Ban,
  restore: RotateCcw,
};

const label = "text-muted-foreground text-xs font-semibold tracking-wide uppercase";

// Where the invoice stands, in a sentence, under the header so it is in view at every
// width: when it was sent or paid, that it is overdue (in words), and what a draft and a
// void invoice mean.
function StatusNote({ invoice, today }: { invoice: Invoice; today: string }) {
  const sent = invoice.sentAt ? ` It was marked as sent on ${formatDateTime(invoice.sentAt)}.` : "";
  let Icon: LucideIcon = Info;
  let text: string;

  switch (invoice.status) {
    case "DRAFT":
      text =
        "Draft: not sent yet. Marking it as sent only records that you sent it yourself. Nothing is emailed from here.";
      break;
    case "SENT":
      Icon = Send;
      text = invoice.sentAt
        ? `Sent on ${formatDateTime(invoice.sentAt)}. Payment is due on ${formatDay(invoice.dueDate)}.`
        : `Sent. Payment is due on ${formatDay(invoice.dueDate)}.`;
      break;
    case "OVERDUE":
      Icon = CircleAlert;
      text =
        invoice.dueDate < today
          ? `Overdue: payment was due on ${formatDay(invoice.dueDate)}.${sent}`
          : `Overdue: marked overdue by hand. Its due date is ${formatDay(invoice.dueDate)}.${sent}`;
      break;
    case "PAID":
      Icon = CircleCheck;
      text = invoice.paidAt ? `Paid on ${formatDateTime(invoice.paidAt)}.` : "Paid.";
      break;
    case "VOID":
      Icon = Ban;
      text = `Void: this invoice no longer counts. It keeps its number, and quote ${invoice.quote.number} still cannot be reopened or invoiced again.`;
      break;
  }

  return (
    <section
      aria-label="Status"
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-lg border p-4 text-sm",
        invoice.status === "OVERDUE"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "bg-card",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 wrap-anywhere">{text}</p>
    </section>
  );
}

function DocumentFact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 sm:justify-end">
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="font-medium sm:min-w-32 sm:text-right">{children}</dd>
    </div>
  );
}

// The invoice as a document: who it is billed to, its dates, the lines and the totals, the
// notes and the terms. All of it is the copy the invoice holds; nothing is counted here.
function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const { company, contact } = invoice;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Invoice {invoice.number}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
          <section aria-label="Bill to" className="flex min-w-0 flex-col gap-1">
            <h3 className={label}>Bill to</h3>
            {company || contact ? (
              <>
                {company ? <p className="font-semibold wrap-anywhere">{company.name}</p> : null}
                {contact ? (
                  <p className={cn("wrap-anywhere", company ? null : "font-semibold")}>
                    {contact.name}
                  </p>
                ) : null}
                {contact?.email ? (
                  <p className="text-muted-foreground wrap-anywhere">{contact.email}</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">No buyer on this invoice.</p>
            )}
          </section>
          <dl className="flex flex-col gap-1">
            <DocumentFact name="Issue date">{formatDay(invoice.issueDate)}</DocumentFact>
            <DocumentFact name="Due date">{formatDay(invoice.dueDate)}</DocumentFact>
            {invoice.status === "PAID" && invoice.paidAt ? (
              <DocumentFact name="Paid">{formatDateTime(invoice.paidAt)}</DocumentFact>
            ) : null}
          </dl>
        </div>

        <DocumentLines lines={invoice.lines} />
        <DocumentTotals
          subtotal={invoice.subtotal}
          discountTotal={invoice.discountTotal}
          taxTotal={invoice.taxTotal}
          total={invoice.total}
        />

        {invoice.notes ? (
          <section className="flex min-w-0 flex-col gap-1 text-sm">
            <h3 className={label}>Notes</h3>
            <p className="wrap-anywhere whitespace-pre-wrap">{invoice.notes}</p>
          </section>
        ) : null}
        {invoice.terms ? (
          <section className="flex min-w-0 flex-col gap-1 text-sm">
            <h3 className={label}>Terms</h3>
            <p className="text-muted-foreground wrap-anywhere whitespace-pre-wrap">
              {invoice.terms}
            </p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { data: me } = useAppSelector(selectAuth);
  const changeStatus = useInvoiceStatus();
  const [dialog, setDialog] = useState<InvoiceDialog>(null);
  // The action whose request is on its way, so a second click cannot send it twice.
  const [busy, setBusy] = useState<InvoiceAction | null>(null);

  if (!me) {
    return null;
  }
  const { canWrite } = invoiceAccess(me.role);
  // The viewer's own day, as the API counts it from the time zone sent with every request.
  const today = toDateInputValue(new Date());
  const actions = canWrite ? invoiceActions(invoice.status, invoice.dueDate, today) : [];
  const [mainAction, ...otherActions] = actions;
  // Nothing on a void invoice can be edited.
  const canEdit = canWrite && invoice.status !== "VOID";

  // "Mark paid" and "Void" ask first; the other changes are made at once.
  function run(action: InvoiceAction) {
    if (action === "mark-paid") {
      setDialog({ kind: "paid", invoice });
      return;
    }
    if (action === "void") {
      setDialog({ kind: "void", invoice });
      return;
    }
    setBusy(action);
    void changeStatus(invoice, action).then((error) => {
      setBusy(null);
      if (error) {
        toast.error(describeApiError(error));
      }
    });
  }

  const MainIcon = mainAction ? ACTION_ICONS[mainAction] : null;

  return (
    <>
      <BackLink href="/invoices" label="Back to invoices" />
      <RecordHeader
        title={invoice.number}
        badge={<InvoiceStatusBadge status={invoice.status} />}
        meta={
          <>
            {invoice.company ? (
              <RecordFact icon={<Building2 aria-hidden />}>
                <DetailLink href={`/companies/${invoice.company.id}`}>
                  {invoice.company.name}
                </DetailLink>
              </RecordFact>
            ) : null}
            <RecordFact icon={<CircleDollarSign aria-hidden />}>
              Total: {formatMoney(invoice.total)}
            </RecordFact>
            <RecordFact icon={<CalendarDays aria-hidden />}>
              {invoice.status === "OVERDUE" ? "Overdue · due " : "Due: "}
              {formatDay(invoice.dueDate)}
            </RecordFact>
            <RecordFact icon={<FileText aria-hidden />}>
              <DetailLink href={`/quotes/${invoice.quote.id}`}>
                From quote {invoice.quote.number}
              </DetailLink>
            </RecordFact>
            <RecordFact icon={<Target aria-hidden />}>
              <DetailLink href={`/opportunities/${invoice.opportunity.id}`}>
                {invoice.opportunity.name}
              </DetailLink>
            </RecordFact>
          </>
        }
        actions={
          <>
            {mainAction && MainIcon ? (
              <Button
                type="button"
                className="h-10 px-4"
                disabled={busy !== null}
                onClick={() => {
                  run(mainAction);
                }}
              >
                <MainIcon aria-hidden />
                {INVOICE_ACTION_LABELS[mainAction]}
              </Button>
            ) : null}
            <Button asChild variant="outline" className="h-10 px-4">
              <Link href={`/invoices/${invoice.id}/print`}>
                <Printer aria-hidden />
                Print / PDF
              </Link>
            </Button>
            {canEdit || otherActions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="size-10"
                    aria-label="More actions"
                    disabled={busy !== null}
                  >
                    <Ellipsis aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {canEdit ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialog({ kind: "edit", invoice });
                      }}
                    >
                      <Pencil aria-hidden />
                      Edit due date and notes
                    </DropdownMenuItem>
                  ) : null}
                  {otherActions.map((action) => {
                    const Icon = ACTION_ICONS[action];
                    return (
                      <Fragment key={action}>
                        {action === "void" ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          variant={action === "void" ? "destructive" : "default"}
                          onSelect={() => {
                            run(action);
                          }}
                        >
                          <Icon aria-hidden />
                          {INVOICE_ACTION_LABELS[action]}
                        </DropdownMenuItem>
                      </Fragment>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />
      <StatusNote invoice={invoice} today={today} />
      <InvoiceDocument invoice={invoice} />

      <InvoiceDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}

// /invoices/[id]: the header with the invoice's status and actions, where it stands in a
// sentence, and the invoice as a document. Every role may print it; every role but Read-only
// may change its status, its due date and its notes.
export function InvoiceDetailPage({ id }: { id: string }) {
  return <InvoiceLoader id={id}>{(invoice) => <InvoiceDetail invoice={invoice} />}</InvoiceLoader>;
}
