import Link from "next/link";
import { Building2, FilePlus2, Files, Shield } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";

export async function AppHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="alm-shell flex min-h-16 items-center justify-between gap-3 py-2">
        <Brand href="/accounts" nameClassName="hidden sm:block" />

        <nav aria-label="Account navigation" className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/accounts">
              <Building2 className="size-4 sm:hidden" />
              <span className="hidden sm:inline">Accounts</span>
              <span className="sr-only sm:hidden">Accounts</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <Files className="size-4 sm:hidden" />
              <span className="hidden sm:inline">Reports</span>
              <span className="sr-only sm:hidden">Reports</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/audits/new">
              <FilePlus2 className="size-4 sm:hidden" />
              <span className="hidden sm:inline">New Audit</span>
              <span className="sr-only sm:hidden">New Audit</span>
            </Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">
                <Shield className="size-4 sm:hidden" />
                <span className="hidden sm:inline">Admin</span>
                <span className="sr-only sm:hidden">Admin</span>
              </Link>
            </Button>
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
