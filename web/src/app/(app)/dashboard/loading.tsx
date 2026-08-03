import { AlmSkeleton } from "@/components/alm-skeleton";

export default function DashboardLoading() {
  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="space-y-3 border-b border-border pb-6">
        <AlmSkeleton className="h-3 w-24" />
        <AlmSkeleton className="h-9 w-56 max-w-full" />
        <AlmSkeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <AlmSkeleton className="h-8 w-16 rounded-full" />
        <AlmSkeleton className="h-8 w-20 rounded-full" />
        <AlmSkeleton className="h-8 w-24 rounded-full" />
        <AlmSkeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <AlmSkeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    </main>
  );
}
