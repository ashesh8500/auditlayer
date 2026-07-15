import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        accent:
          "border-transparent bg-[color:var(--accent-muted)] text-[color:var(--accent)]",
        success:
          "border-transparent bg-[color:var(--green-muted)] text-[color:var(--green)]",
        warning:
          "border-transparent bg-[color:var(--amber-muted)] text-[color:var(--amber)]",
        danger:
          "border-transparent bg-[color:var(--red-muted)] text-[color:var(--red)]",
        info: "border-transparent bg-[color:var(--blue-muted)] text-[color:var(--blue)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
