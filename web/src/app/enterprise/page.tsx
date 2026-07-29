import { Building2, MessageSquareText, Route, SlidersHorizontal, UserRoundCheck } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { SupportForm } from "@/app/support/support-form";

export default function EnterprisePage() {
  return (
    <PublicShell>
      <main>
        {/* Hero */}
        <section className="border-b border-border bg-[color:var(--forest)] py-20 text-white sm:py-28">
          <div className="alm-shell grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div>
              <p className="alm-kicker text-[color:var(--teal-on-forest)]">Enterprise</p>
              <h1 className="mt-4 text-[clamp(2.8rem,7vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.065em]">
                Intelligence that fits how your team works.
              </h1>
            </div>
            <div className="flex flex-col justify-end">
              <p className="max-w-xl text-base leading-7 text-white/75">
                Enterprise engagements are built around your organization&rsquo;s decisions, accounts, and operating cadence.
                We start with a conversation to understand what you need — then shape the scope, depth, and deliverables around that.
              </p>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="alm-shell py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="alm-kicker">Who it&rsquo;s for</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em]">
                Brands, internal teams, and agencies that need deeper support.
              </h2>
            </div>
            <div className="grid border-l border-t border-border sm:grid-cols-2">
              {[
                ["Companies", "Social and marketing teams that manage multiple accounts and need consistent, calibrated intelligence across the portfolio."],
                ["Marketing agencies", "Agencies that run audits for clients and need repeatable depth, white-label delivery, and a partner who understands their workflow."],
              ].map(([title, body]) => (
                <article key={title} className="border-b border-r border-border bg-card p-6 sm:p-8">
                  <Building2 className="size-5 text-[color:var(--accent)]" />
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border bg-[color:var(--panel)] py-20 sm:py-28">
          <div className="alm-shell">
            <div className="max-w-2xl">
              <p className="alm-kicker">How it works</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">
                Every engagement starts with a conversation.
              </h2>
              <p className="mt-4 text-muted-foreground">
                We learn how your team operates, what decisions you&rsquo;re trying to make, and where you need support.
                From there, we define what AuditLayerMedia can realistically deliver.
              </p>
            </div>

            <div className="mt-12 grid border-l border-t border-border lg:grid-cols-3">
              {[
                [MessageSquareText, "01", "Discovery", "We meet to understand your team&rsquo;s structure, current workflow, and the decisions that depend on social intelligence."],
                [SlidersHorizontal, "02", "Calibration", "We set the scope together — which accounts, what depth, how often, and what deliverables match your operating rhythm."],
                [Route, "03", "Delivery", "Reports and intelligence are structured for the people who need to act on them, on a cadence that fits your process."],
              ].map(([Icon, number, title, body]) => {
                const StepIcon = Icon as typeof MessageSquareText;
                return (
                  <article key={number as string} className="border-b border-r border-border bg-card p-6 sm:p-8">
                    <div className="flex items-center justify-between">
                      <StepIcon className="size-5 text-[color:var(--accent)]" />
                      <span className="font-mono text-xs text-muted-foreground">{number as string}</span>
                    </div>
                    <h3 className="mt-10 text-xl font-semibold">{title as string}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{body as string}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* The engagement */}
        <section className="alm-shell py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="alm-kicker">The engagement</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em]">
                Built around your brief, not a preset menu.
              </h2>
              <p className="mt-4 text-muted-foreground">
                The scope is shaped during discovery. These dimensions help us calibrate the engagement to what you actually need.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                ["Goals and priorities", "We start with the decisions you need to make — growth, positioning, competitive context, or something else."],
                ["Accounts and markets", "Single account, a portfolio, or a competitive landscape. We scope to the breadth you need."],
                ["Research depth", "From focused diagnostics to deep competitive analysis with extended evidence collection."],
                ["Deliverable rhythm", "One-off deep dives, recurring reports, or an ongoing intelligence relationship."],
              ].map(([title, body]) => (
                <div key={title} className="border border-border bg-card p-5 sm:p-6">
                  <UserRoundCheck className="size-5 text-[color:var(--accent)]" />
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="border-y border-border bg-[color:var(--panel)] py-20 sm:py-24">
          <div className="alm-shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="alm-kicker">Start a conversation</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em]">
                Tell us what you need.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
                Every Enterprise engagement is discovery-led. Share a little about your company, the decisions you&rsquo;re trying to make, and where you need support. We&rsquo;ll reply within one business day.
              </p>
            </div>
            <div className="alm-panel p-6 sm:p-8">
              <SupportForm
                defaultSubject="Enterprise inquiry"
                messagePlaceholder="Tell us about your company, accounts, goals, and where you need support."
                submitLabel="Send Enterprise inquiry"
              />
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
