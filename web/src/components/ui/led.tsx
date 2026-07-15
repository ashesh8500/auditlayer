import { cn } from "@/lib/utils";

export type LedColor = "green" | "red" | "amber" | "blue";

const LED_COLORS: Record<LedColor, { bg: string; glow: string }> = {
  green: {
    bg: "bg-[var(--led-green)]",
    glow: "shadow-[var(--shadow-glow-green)]",
  },
  red: {
    bg: "bg-[var(--led-red)]",
    glow: "shadow-[var(--shadow-glow-red)]",
  },
  amber: {
    bg: "bg-[var(--led-amber)]",
    glow: "shadow-[var(--shadow-glow-amber)]",
  },
  blue: {
    bg: "bg-[var(--led-blue)]",
    glow: "shadow-[var(--shadow-glow-blue)]",
  },
};

interface LedProps {
  color?: LedColor;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function LedIndicator({
  color = "green",
  pulse = true,
  size = "sm",
  className,
}: LedProps) {
  const { bg, glow } = LED_COLORS[color];
  const sizeClass = size === "sm" ? "size-2.5" : "size-3.5";

  return (
    <span
      className={cn(
        "inline-block rounded-full",
        sizeClass,
        bg,
        glow,
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}

interface LedLabelProps {
  color?: LedColor;
  pulse?: boolean;
  label: string;
  className?: string;
}

export function LedLabel({
  color = "green",
  pulse = true,
  label,
  className,
}: LedLabelProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]",
        className,
      )}
    >
      <LedIndicator color={color} pulse={pulse} size="sm" />
      {label}
    </span>
  );
}
