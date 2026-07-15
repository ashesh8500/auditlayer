import Link from "next/link";
import type { Metadata } from "next";
import { AlertCircle, Clock, Ban, Users, ArrowRight } from "lucide-react";

import { validateTrialToken } from "@/lib/trials";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Trial Invite — AuditLayerMedia",
};

type ErrorState = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const ERROR_STATES: Record<string, ErrorState> = {
  expired: {
    icon: <Clock className="size-10 text-[color:var(--amber)]" />,
    title: "This invite link has expired.",
    body: "The trial period for this invite has ended.",
  },
  revoked: {
    icon: <Ban className="size-10 text-[color:var(--red)]" />,
    title: "This invite link has been revoked.",
    body: "The owner has revoked access to this trial.",
  },
  exhausted: {
    icon: <Users className="size-10 text-[color:var(--amber)]" />,
    title: "This invite link has reached its maximum uses.",
    body: "All available trial slots for this invite have been claimed.",
  },
  not_found: {
    icon: <AlertCircle className="size-10 text-muted-foreground" />,
    title: "Invite link not found.",
    body: "This link doesn't exist. It may have been deleted or mistyped.",
  },
};

export default async function TryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await validateTrialToken(token);

  // ── Invalid token — show error state ──
  if (!result.valid) {
    const err = ERROR_STATES[result.reason] ?? ERROR_STATES.not_found;

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--bg)] px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[color:var(--surface-muted)]">
            {err.icon}
          </div>
          <h1 className="text-xl font-bold tracking-tight">{err.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{err.body}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--accent)] hover:underline"
          >
            Learn more about AuditLayerMedia
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </main>
    );
  }

  const auditsGranted = result.auditsGranted;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#14241f] px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        {/* ALM badge */}
        <div className="mb-8 flex justify-center text-white">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="grid size-8 place-items-center bg-[#9fe8dc] font-mono text-[9px] font-bold text-[#14241f]">
              ALM
            </span>
            AuditLayerMedia
          </Link>
        </div>

        {/* Card */}
        <div className="grid border border-white/10 bg-card shadow-[var(--shadow-lg)] sm:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-border bg-[color:var(--accent-muted)] p-7 sm:border-b-0 sm:border-r sm:p-9">
            <p className="alm-kicker">Private trial</p>
            <p className="mt-14 font-mono text-6xl font-semibold tracking-[-0.06em]">{auditsGranted}</p>
            <p className="mt-2 text-sm text-muted-foreground">gifted audit{auditsGranted !== 1 ? "s" : ""}</p>
            <div className="mt-8 border-t border-[color:var(--accent)]/20 pt-4 text-xs leading-5 text-muted-foreground">
              {result.offerPlan} access · {result.reportTypes.join(", ")} reports · {result.accessDays} days
            </div>
          </div>
          <div className="p-7 sm:p-9">
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em]">
              Your AuditLayerMedia trial is ready.
            </h1>
            <p className="mt-4 text-sm text-muted-foreground leading-6">
              Sign in to claim your invite, open a research desk, and run your first account analysis.
            </p>

          <div className="mt-8 space-y-3">
            <Link href={`/login?trial=${encodeURIComponent(token)}`} className="block w-full">
              <Button size="lg" className="w-full font-semibold">
                Claim trial access
              </Button>
            </Link>
            <Link href={`/login?trial=${encodeURIComponent(token)}`} className="block w-full">
              <Button size="lg" variant="outline" className="w-full font-medium">
                I already have an account
              </Button>
            </Link>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            No credit card required. Credits and report access expire with the offer window.
          </p>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[0.62rem] uppercase tracking-[0.12em] text-white/40">
          Invite access · AuditLayerMedia
        </p>
      </div>
    </main>
  );
}
