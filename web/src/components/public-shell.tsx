import Link from "next/link";
import { Menu } from "lucide-react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const publicLinks = [
  ["Sample", "/#sample"],
  ["Method", "/#method"],
  ["Pricing", "/#pricing"],
] as const;

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/90 bg-background/95 backdrop-blur-xl">
      <div className="alm-shell flex min-h-16 items-center justify-between gap-3 py-2">
        <Brand />
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
          {publicLinks.map(([label, href]) => (
            <Link key={label} href={href} className="alm-focus px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              {label}
            </Link>
          ))}
          <Button asChild variant="ghost" className="min-h-10 px-3">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="min-h-10 px-4">
            <Link href="/login">Run a Free Pulse Audit</Link>
          </Button>
        </nav>
        <details className="group relative md:hidden">
          <summary className="alm-focus grid min-h-11 min-w-11 cursor-pointer list-none place-items-center border border-border bg-card text-foreground [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Open navigation</span>
            <Menu className="size-5" />
          </summary>
          <nav aria-label="Mobile navigation" className="absolute right-0 top-[calc(100%+0.5rem)] grid min-w-56 gap-1 border border-border bg-card p-2 shadow-[var(--shadow-md)]">
            {publicLinks.map(([label, href]) => (
              <Link key={label} href={href} className="alm-focus px-3 py-2.5 text-sm hover:bg-muted">
                {label}
              </Link>
            ))}
            <Link href="/login" className="alm-focus px-3 py-2.5 text-sm hover:bg-muted">Sign in</Link>
            <Link href="/login" className="alm-focus mt-1 bg-[color:var(--accent)] px-3 py-2.5 text-sm font-semibold text-white">Run a Free Pulse Audit</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card/40 py-10">
      <div className="alm-shell grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Brand />
          <p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">
            Competitive intelligence for evidence-led social growth.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex max-w-lg flex-wrap gap-x-5 gap-y-3 text-xs text-muted-foreground sm:justify-end">
          <Link className="inline-flex min-h-10 items-center" href="/#sample">Sample</Link>
          <Link className="inline-flex min-h-10 items-center" href="/#method">Method</Link>
          <Link className="inline-flex min-h-10 items-center" href="/#pricing">Pricing</Link>
          <Link className="inline-flex min-h-10 items-center" href="/support">Support</Link>
          <Link className="inline-flex min-h-10 items-center" href="/privacy">Privacy</Link>
          <Link className="inline-flex min-h-10 items-center" href="/data-deletion">Data deletion</Link>
          <span>© {new Date().getFullYear()}</span>
        </nav>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
