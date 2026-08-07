import * as React from "react";

import { cn } from "@/lib/utils";
import { AlmSkeleton } from "@/components/alm-skeleton";
import { ExperienceBanner } from "@/components/ui/experience-banner";

/**
 * Shared route-state primitives: empty / loading / error / delayed.
 *
 * All surfaces use the light-theme semantic tokens and the canonical panel
 * styling from globals.css. They are presentational only — callers own data
 * fetching, retry callbacks, and navigation.
 */

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

interface ExperienceEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ExperienceEmpty({
  icon,
  title,
  description,
  action,
  className,
}: ExperienceEmptyProps) {
  return (
    <div
      data-slot="experience-empty"
      className={cn(
        "rounded-[var(--radius)] border border-dashed border-border bg-card p-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[color:var(--accent-muted)]">
          {icon}
        </div>
      )}
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex items-center justify-center gap-3">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface ExperienceLoadingProps {
  label?: string;
  /** Number of skeleton rows to render under the optional label. */
  rows?: number;
  className?: string;
}

export function ExperienceLoading({
  label,
  rows = 3,
  className,
}: ExperienceLoadingProps) {
  return (
    <div
      data-slot="experience-loading"
      role="status"
      aria-label={label ?? "Loading"}
      className={cn("space-y-3", className)}
    >
      {label && (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <AlmSkeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

interface ExperienceErrorProps {
  title?: string;
  children?: React.ReactNode;
  /** Retry action (e.g. a Button with onClick / form action). */
  action?: React.ReactNode;
  className?: string;
}

export function ExperienceError({
  title = "Something went wrong",
  children,
  action,
  className,
}: ExperienceErrorProps) {
  return (
    <ExperienceBanner
      tone="danger"
      role="alert"
      title={title}
      className={className}
      action={action}
    >
      {children}
    </ExperienceBanner>
  );
}

// ---------------------------------------------------------------------------
// Delayed
// ---------------------------------------------------------------------------

interface ExperienceDelayedProps {
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function ExperienceDelayed({
  title = "Taking longer than expected",
  children,
  action,
  className,
}: ExperienceDelayedProps) {
  return (
    <ExperienceBanner
      tone="warning"
      title={title}
      className={className}
      action={action}
    >
      {children}
    </ExperienceBanner>
  );
}
