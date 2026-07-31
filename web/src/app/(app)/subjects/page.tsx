import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { fixtureSubjects } from "@/lib/intelligence/fixtures";

export const metadata = { title: "Subjects — AuditLayerMedia" };

export default async function SubjectsPage() {
  await requireProfile();
  const subjects = fixtureSubjects();

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="alm-kicker">Intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            Subjects
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Each subject owns channels, a Living Brief, and an accumulating
            intelligence ledger. Reports are immutable snapshots.
          </p>
        </div>
        <Link href="/audits/new">
          <Button className="font-semibold">
            <Plus className="size-4" />
            New audit
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Fixture subjects until kernel tables are readable on this environment.
      </p>

      <ul className="mt-6 divide-y divide-border border-y border-border">
        {subjects.map((subject) => (
          <li key={subject.id}>
            <Link
              href={`/subjects/${subject.id}`}
              className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-[var(--surface-muted)]"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{subject.name}</p>
                <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                  {subject.type} · {subject.channelCount} channel
                  {subject.channelCount === 1 ? "" : "s"}
                  {subject.lastAuditAt
                    ? ` · last audit ${new Date(subject.lastAuditAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
