import { OpportunityDetailPage } from "@/features/opportunities/opportunity-detail-page";

export default async function OpportunityRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpportunityDetailPage id={id} />;
}
