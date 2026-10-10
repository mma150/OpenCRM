import { EditCompanyPage } from "@/features/companies/company-form-pages";

export default async function EditCompanyRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditCompanyPage id={id} />;
}
