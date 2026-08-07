import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  kicker: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional trailing action slot (buttons/links). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Canonical product page header: kicker + h1 + description with an optional
 * action cluster, separated from page content by a bottom border.
 */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="alm-kicker">{kicker}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {title}
        </h1>
        {description && (
          <div className="mt-2 max-w-xl text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
