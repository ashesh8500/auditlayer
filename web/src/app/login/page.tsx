import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — AuditLayer",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const user = await getSession();
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(safeNext);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-md bg-[color:var(--accent)] font-mono text-xs text-white">
            AL
          </span>
          AuditLayer
        </Link>

        <div className="rounded-[calc(var(--radius)+4px)] border border-border bg-card p-7 shadow-[var(--shadow-md)]">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to view your audits, or start your first one free.
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-[var(--radius)] border border-[color:var(--red)]/30 bg-[color:var(--red-muted)] px-3 py-2 text-center text-xs text-[color:var(--red)]">
              {error === "unconfigured"
                ? "Sign-in isn't configured yet."
                : "Something went wrong signing you in. Please try again."}
            </p>
          )}

          <LoginForm next={safeNext} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our terms and privacy policy.
        </p>
      </div>
    </main>
  );
}
