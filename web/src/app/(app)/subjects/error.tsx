"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExperienceError } from "@/components/ui/experience-state";

export default function SubjectsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="alm-shell space-y-4 py-12">
    <h1 className="text-2xl font-semibold">Subject data could not be loaded</h1>
    <ExperienceError title="Please try again">We could not load your subjects and their history. Retry to load a complete view.</ExperienceError>
    <div className="flex flex-wrap gap-4 items-center">
      <Button onClick={reset}>Retry</Button>
      <Link className="text-sm underline" href="/settings/connections">Manage connections</Link>
      <Link className="text-sm underline" href="/subjects">All subjects</Link>
    </div>
  </main>;
}
