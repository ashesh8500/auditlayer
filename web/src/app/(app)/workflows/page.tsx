import { cookies } from "next/headers";
import { WorkflowsLibrary } from "@/components/workflows/workflows-library";

export const metadata = { title: "Brand reviews — AuditLayerMedia" };

// Auth stays in the protected server layout. This page reads no report content
// and triggers no scheduling, charging or delivery on load.
export default async function Page() {
  const jar = await cookies();
  return <WorkflowsLibrary revision={jar.get("alm-workflows-revision")?.value ?? "0"} />;
}
