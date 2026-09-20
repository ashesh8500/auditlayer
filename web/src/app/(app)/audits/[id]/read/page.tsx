import { OwnedReportReader } from "@/components/owned-report-reader";
export const metadata = { title: "Read Report — AuditLayerMedia" };
// Current owner auth remains in the layout and the private DTO route.
export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  return <OwnedReportReader id={(await params).id} />;
}
