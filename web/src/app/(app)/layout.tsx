import { Suspense } from "react";
import { cookies } from "next/headers";
import { WorkspaceResources } from "@/components/workspace-resources";

import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { NavigationProgress } from "@/components/navigation-progress";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const jar = await cookies();
  const revisions = { subjects: jar.get("alm-subjects-revision")?.value ?? "0", reports: jar.get("alm-reports-revision")?.value ?? "0", connections: jar.get("alm-connections-revision")?.value ?? "0" };
  return (
    <WorkspaceResources ownerId={user.id} revisions={revisions}><div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <AppHeader />
      <div className="flex-1">{children}</div>
    </div></WorkspaceResources>
  );
}
