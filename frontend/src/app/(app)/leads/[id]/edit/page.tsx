import { EditLeadPage } from "@/features/leads/lead-form-pages";

export default async function EditLeadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditLeadPage id={id} />;
}
