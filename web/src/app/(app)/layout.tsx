import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
    </div>
  );
}
