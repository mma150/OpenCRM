import { InvoicePrintPage } from "@/features/invoices/invoice-print-page";

export default async function InvoicePrintRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicePrintPage id={id} />;
}
