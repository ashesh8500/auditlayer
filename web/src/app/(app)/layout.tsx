import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { NavigationProgress } from "@/components/navigation-progress";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <AppHeader />
      <div className="flex-1">{children}</div>
    </div>
  );
}
