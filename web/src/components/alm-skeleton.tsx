export function AlmSkeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`alm-skeleton ${className}`}
    />
  );
}
