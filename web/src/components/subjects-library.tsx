"use client";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspaceQuery } from "./workspace-resources";
import { ResourceStatus } from "./resource-status";
import type { SubjectSummary } from "@/lib/intelligence/types";




export function SubjectsLibrary() {
  const query = useWorkspaceQuery<{ ownerId: string; subjects: SubjectSummary[] }>("subjects", "");
  if (!query.data) return <ResourceStatus query={query} label="Subjects" />;
  const { subjects } = query.data;

  return (
    <main data-testid="subjects-content" className="alm-shell py-8 sm:py-12 animate-page-in">
      <ResourceStatus query={query} label="Subjects" />
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
        Subjects in your workspace. <Link href="/settings/connections" className="font-semibold text-[color:var(--accent)] hover:underline">Connect or reconnect Instagram</Link>
      </p>

      {subjects.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          No subjects yet. Start a new audit to create one.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <Link
                href={`/subjects/${subject.id}`}
                className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-[var(--surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {subject.name}
                  </p>
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
      )}
    </main>
  );
}
