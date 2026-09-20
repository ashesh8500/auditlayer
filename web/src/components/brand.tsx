import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Approved ALM. wordmark. Outlined SVGs need no downloaded or installed font. */
export function Brand({
  href = "/",
  inverse = false,
  showName = false,
  className,
  nameClassName,
}: {
  href?: string;
  inverse?: boolean;
  /** Optional full-name lockup; the link always has its full accessible name. */
  showName?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="AuditLayerMedia"
      className={cn(
        "alm-focus inline-flex min-h-11 w-fit shrink-0 items-center gap-2.5 font-semibold tracking-tight",
        inverse ? "text-[color:var(--surface)]" : "text-[color:var(--text)]",
        className,
      )}
    >
      <Image
        src={inverse ? "/brand/alm-wordmark-inverse.svg" : "/brand/alm-wordmark.svg"}
        width={55}
        height={30}
        alt=""
        aria-hidden="true"
        className="h-[30px] w-auto shrink-0 object-contain"
        unoptimized
      />
      {showName && (
        <span aria-hidden="true" className={cn("text-sm", nameClassName)}>
          AuditLayerMedia
        </span>
      )}
    </Link>
  );
}
