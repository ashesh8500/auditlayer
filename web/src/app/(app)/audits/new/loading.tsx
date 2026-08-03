import { AlmSkeleton } from "@/components/alm-skeleton";

export default function NewAuditLoading() {
  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="mx-auto mb-8 max-w-2xl space-y-3 border-b border-border pb-6">
        <AlmSkeleton className="h-3 w-24" />
        <AlmSkeleton className="h-9 w-80 max-w-full" />
        <AlmSkeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="mx-auto max-w-2xl space-y-4">
        <AlmSkeleton className="h-12 w-full" />
        <AlmSkeleton className="h-24 w-full" />
        <AlmSkeleton className="h-24 w-full" />
        <AlmSkeleton className="h-11 w-32 ml-auto" />
      </div>
    </main>
  );
}
