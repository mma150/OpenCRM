import { EditContactPage } from "@/features/contacts/contact-form-pages";

export default async function EditContactRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditContactPage id={id} />;
}
