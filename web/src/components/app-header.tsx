import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export async function AppHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[color:var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="grid size-6 place-items-center rounded-md bg-[color:var(--accent)] font-mono text-[10px] text-white">
            AL
          </span>
          AuditLayer
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              Dashboard
            </Button>
          </Link>
          <Link href="/audits/new">
            <Button variant="ghost" size="sm">
              New audit
            </Button>
          </Link>
          {isAdmin && (
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                Admin
              </Button>
            </Link>
          )}
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
