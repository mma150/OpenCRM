import { EditOpportunityPage } from "@/features/opportunities/opportunity-form-pages";

export default async function EditOpportunityRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditOpportunityPage id={id} />;
}
