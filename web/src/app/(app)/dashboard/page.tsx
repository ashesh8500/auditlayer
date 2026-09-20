import { ReportsLibrary } from "@/components/reports-library";
export const metadata = { title: "Reports — AuditLayerMedia" };
// Data has one client owner; auth remains in the layout and DTO boundary.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ReportsLibrary params={await searchParams} />;
}
