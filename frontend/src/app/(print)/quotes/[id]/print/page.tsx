import { QuotePrintPage } from "@/features/quotes/quote-print-page";

export default async function QuotePrintRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuotePrintPage id={id} />;
}
