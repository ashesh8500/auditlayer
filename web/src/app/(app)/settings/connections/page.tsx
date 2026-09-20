import { ConnectionsLibrary } from "@/components/connections-library";
export const metadata = { title: "Connections — AuditLayerMedia" };
// Auth stays in the protected server layout and every DTO route.
// No blocking page DB read before the retained client cache can paint.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ConnectionsLibrary params={await searchParams} />;
}
