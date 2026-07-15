import Link from "next/link";
import { Building2, FilePlus2, LayoutDashboard, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export async function AppHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="alm-shell flex h-16 items-center justify-between gap-3">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2.5 group alm-focus"
        >
          <span className="grid size-8 place-items-center bg-[#14241f] font-mono text-[9px] font-bold text-[#9fe8dc] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
            ALM
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:block">
            AuditLayerMedia
          </span>
        </Link>

        <nav aria-label="Account navigation" className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
          <Link href="/accounts">
            <Button variant="ghost" size="sm">
              <Building2 className="size-4 sm:hidden" />
              <span className="hidden sm:inline">Accounts</span>
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <LayoutDashboard className="size-4 sm:hidden" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
          </Link>
          <Link href="/audits/new">
            <Button variant="ghost" size="sm">
              <FilePlus2 className="size-4 sm:hidden" />
              <span className="hidden sm:inline">New audit</span>
            </Button>
          </Link>
          {isAdmin && (
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                <Shield className="size-4 sm:hidden" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            </Link>
          )}
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
