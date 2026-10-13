import { EditQuotePage } from "@/features/quotes/quote-form-pages";

export default async function EditQuoteRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditQuotePage id={id} />;
}
