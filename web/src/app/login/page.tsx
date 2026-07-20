import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — AuditLayerMedia",
  description: "Sign in to your AuditLayerMedia account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; trial?: string }>;
}) {
  const { next, error, trial } = await searchParams;
  const user = await getSession();
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/accounts";
  if (user) redirect(safeNext);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[color:var(--forest)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[32rem] rounded-full bg-[color:var(--accent)]/25 blur-3xl" aria-hidden="true" />
        <Brand inverse className="relative" />
        <div className="relative max-w-xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--teal-on-forest)]">Your research desk</p>
          <h2 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.055em]">From account signal to a clear next move.</h2>
          <div className="mt-10 grid grid-cols-3 gap-px bg-white/15">
            {["Evidence", "Peer context", "Action plan"].map((item, index) => <div key={item} className="bg-[color:var(--forest)] px-4 py-5"><b className="font-mono text-xs text-[color:var(--teal-on-forest)]">0{index + 1}</b><p className="mt-8 text-sm text-white/65">{item}</p></div>)}
          </div>
        </div>
        <p className="relative max-w-md text-xs leading-5 text-white/45">Public-data research with collection limits and confidence context shown in every report.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md animate-page-in">
        <Brand className="mb-8 lg:hidden" />
        <div className="border border-border bg-card p-6 shadow-[var(--shadow-md)] sm:p-8">
          <div className="mb-7">
            <p className="alm-kicker">{trial ? "Trial access" : "Secure access"}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">{trial ? "Claim your trial" : "Welcome back"}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{trial ? "Sign in to redeem the audits included with your invite." : "Sign in to open your research desk or run a free Pulse audit."}</p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-[color:var(--red-muted)] border border-[color:var(--red)]/20 px-3 py-2 text-center text-xs text-[color:var(--red)] font-semibold">
              {error === "unconfigured"
                ? "Sign-in isn't configured yet."
                : "Something went wrong signing you in. Please try again."}
            </p>
          )}

          <LoginForm next={safeNext} trial={trial ?? undefined} />
        </div>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          By continuing, you agree to the AuditLayerMedia privacy policy.
        </p>
      </div>
      </section>
    </main>
  );
}
