import { AlmSkeleton } from "@/components/alm-skeleton";

export default function SubjectDetailLoading() {
  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <AlmSkeleton className="h-4 w-28" />
      <div className="mt-5 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
          <div className="flex items-center gap-4">
            <AlmSkeleton className="size-14 rounded-full" />
            <div className="space-y-2">
              <AlmSkeleton className="h-9 w-56 max-w-full" />
              <AlmSkeleton className="h-4 w-36" />
            </div>
          </div>
          <AlmSkeleton className="h-9 w-28" />
        </div>
        <div className="flex gap-2 border-b border-border pb-px">
          <AlmSkeleton className="h-9 w-20" />
          <AlmSkeleton className="h-9 w-28" />
          <AlmSkeleton className="h-9 w-20" />
          <AlmSkeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AlmSkeleton className="h-28 w-full" />
          <AlmSkeleton className="h-28 w-full" />
          <AlmSkeleton className="h-28 w-full" />
          <AlmSkeleton className="h-28 w-full" />
        </div>
      </div>
    </main>
  );
}
