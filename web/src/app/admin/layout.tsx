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
      <div className="border-b border-border bg-[color:var(--panel)]">
        <div className="alm-shell flex items-center gap-5 overflow-x-auto py-3 text-xs">
          <span className="font-semibold uppercase tracking-widest text-[color:var(--accent)]">
            Operations
          </span>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
            Clients & audits
          </Link>
          <Link href="/admin/users" className="text-muted-foreground hover:text-foreground transition-colors">
            Users
          </Link>
          <Link href="/admin/trials" className="text-muted-foreground hover:text-foreground transition-colors">
            Trials
          </Link>
          <Link href="/admin/benchmarks" className="text-muted-foreground hover:text-foreground transition-colors">
            Benchmarks
          </Link>
          <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            Worker config
          </Link>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
