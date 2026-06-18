import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export const metadata = { title: "Admin — AuditLayerMedia" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-2 text-xs">
          <span className="font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)]">
            Founder console
          </span>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            Clients & audits
          </Link>
          <Link
            href="/admin/users"
            className="text-muted-foreground hover:text-foreground"
          >
            Users
          </Link>
          <Link
            href="/admin/trials"
            className="text-muted-foreground hover:text-foreground"
          >
            Trials
          </Link>
          <Link
            href="/admin/settings"
            className="text-muted-foreground hover:text-foreground"
          >
            Worker config
          </Link>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
