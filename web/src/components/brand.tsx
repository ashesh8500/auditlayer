import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({
  href = "/",
  inverse = false,
  showName = true,
  className,
  nameClassName,
}: {
  href?: string;
  inverse?: boolean;
  showName?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "alm-focus inline-flex min-h-11 w-fit shrink-0 items-center gap-2.5 font-semibold tracking-tight",
        inverse ? "text-white" : "text-foreground",
        className,
      )}
    >
      <Image
        src="/brand/alm-mark.png"
        width={36}
        height={36}
        alt={showName ? "" : "AuditLayerMedia"}
        className="size-9 shrink-0 object-contain"
        priority
      />
      {showName && (
        <span className={cn("text-sm", nameClassName)}>AuditLayerMedia</span>
      )}
    </Link>
  );
}
