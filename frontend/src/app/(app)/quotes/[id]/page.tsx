import { QuoteDetailPage } from "@/features/quotes/quote-detail-page";

export default async function QuoteRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuoteDetailPage id={id} />;
}
