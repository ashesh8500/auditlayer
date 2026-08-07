import * as React from "react";

import { cn } from "@/lib/utils";

export type ExperienceBannerTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const BANNER_TONE_CLASSES: Record<
  ExperienceBannerTone,
  { panel: string; title: string; body: string }
> = {
  neutral: {
    panel: "border border-border bg-card",
    title: "text-foreground",
    body: "text-muted-foreground",
  },
  info: {
    panel: "border-[color:var(--blue)]/30 bg-[color:var(--blue-muted)]",
    title: "text-[color:var(--blue)]",
    body: "text-[color:var(--blue)]",
  },
  success: {
    panel: "border-[color:var(--green)]/30 bg-[color:var(--green-muted)]",
    title: "text-[color:var(--green)]",
    body: "text-[color:var(--green)]",
  },
  warning: {
    panel: "border-[color:var(--amber)]/30 bg-[color:var(--amber-muted)]",
    title: "text-[color:var(--amber)]",
    body: "text-[color:var(--amber)]",
  },
  danger: {
    panel: "border-[color:var(--red)]/30 bg-[color:var(--red-muted)]",
    title: "text-[color:var(--red)]",
    body: "text-[color:var(--red)]",
  },
};

interface ExperienceBannerProps {
  tone?: ExperienceBannerTone;
  title?: string;
  children?: React.ReactNode;
  /** Optional trailing action slot (e.g. a Button). Must be 44px+ aware. */
  action?: React.ReactNode;
  className?: string;
  /** Defaults to "status"; use "alert" for destructive/blocking notices. */
  role?: "status" | "alert";
  "aria-label"?: string;
}

/**
 * Canonical banner/notice surface. All tones resolve to the light-theme
 * semantic tokens in globals.css — no raw colors are introduced.
 */
export function ExperienceBanner({
  tone = "neutral",
  title,
  children,
  action,
  className,
  role = "status",
  ...rest
}: ExperienceBannerProps &
  Omit<React.ComponentProps<"div">, "role" | "title">) {
  const tones = BANNER_TONE_CLASSES[tone];
  return (
    <div
      data-slot="experience-banner"
      data-tone={tone}
      role={role}
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm",
        tones.panel,
        className,
      )}
      {...rest}
    >
      <div className="min-w-0 space-y-1">
        {title && <p className={cn("text-xs font-semibold", tones.title)}>{title}</p>}
        {children && <div className={cn("text-sm leading-6", tones.body)}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
