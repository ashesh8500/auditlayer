import { AlmSkeleton } from "@/components/alm-skeleton";

/** Instant route feedback while server components stream. */
export default function AppLoading() {
  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="space-y-6">
        <div className="space-y-3 border-b border-border pb-6">
          <AlmSkeleton className="h-3 w-24" />
          <AlmSkeleton className="h-9 w-64 max-w-full" />
          <AlmSkeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-3">
          <AlmSkeleton className="h-14 w-full" />
          <AlmSkeleton className="h-14 w-full" />
          <AlmSkeleton className="h-14 w-full" />
        </div>
      </div>
    </main>
  );
}
