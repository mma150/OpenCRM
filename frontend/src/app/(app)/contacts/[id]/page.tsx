import { ContactDetailPage } from "@/features/contacts/contact-detail-page";

export default async function ContactRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactDetailPage id={id} />;
}
