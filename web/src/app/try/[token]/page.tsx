import { cookies } from "next/headers";
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

  // ── Valid token — set cookie and render landing ──
  const cookieStore = await cookies();
  cookieStore.set("alm_trial_token", token, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  const auditsGranted = result.auditsGranted;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--bg)] px-6">
      <div className="w-full max-w-md">
        {/* ALM badge */}
        <div className="mb-6 flex justify-center">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="grid size-7 place-items-center rounded-md bg-[#1c1917] text-xs font-bold text-white">
              ALM
            </span>
            AuditLayerMedia
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-[calc(var(--radius)+4px)] border border-border bg-card p-8 shadow-[var(--shadow-md)]">
          <div className="text-center">
            <h1 className="text-xl font-bold leading-tight tracking-[-0.01em]">
              You&rsquo;ve been invited to try AuditLayerMedia
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Sign up and get{" "}
              <span className="font-semibold text-foreground">
                {auditsGranted} free audit{auditsGranted !== 1 ? "s" : ""}
              </span>{" "}
              to explore your social media presence.
            </p>
          </div>

          <div className="mt-7 space-y-3">
            <Link href={`/login?trial=${encodeURIComponent(token)}`} className="block w-full">
              <Button size="lg" className="w-full font-semibold">
                Sign up with email
              </Button>
            </Link>
            <Link href={`/login?trial=${encodeURIComponent(token)}`} className="block w-full">
              <Button size="lg" variant="outline" className="w-full font-medium">
                Already have an account? Sign in
              </Button>
            </Link>
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            No credit card required. Your free audits never expire.
          </p>
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Powered by AuditLayerMedia
        </p>
      </div>
    </main>
  );
}
