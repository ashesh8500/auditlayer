import { ExperienceLoading } from "@/components/ui/experience-state";

export default function SubjectsLoading() {
  return <main className="alm-shell py-12" role="status" aria-live="polite" aria-busy="true">
    <h1 className="text-2xl font-semibold">Loading your subjects</h1>
    <p className="mt-3 text-sm text-muted-foreground">Checking channels and linked audit history. Larger histories may take a moment.</p>
    <ExperienceLoading className="mt-6" rows={3} label="Loading subjects" />
  </main>;
}
