import { LeadDetailPage } from "@/features/leads/lead-detail-page";

export default async function LeadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetailPage id={id} />;
}
