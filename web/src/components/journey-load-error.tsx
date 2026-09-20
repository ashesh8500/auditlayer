"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function JourneyLoadError({ label }: { label: string }) {
 const router = useRouter();
 const [pending, startTransition] = useTransition();
 return <section role="alert" className="alm-panel my-6 space-y-3 p-6">
   <p>{label} could not be loaded. Existing records and permissions have not been changed.</p>
   <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Loading…" : "Try again"}</Button>
 </section>;
}
