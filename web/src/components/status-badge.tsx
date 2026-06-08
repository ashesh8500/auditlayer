import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type AuditStatus } from "@/lib/domain";

const STATUS_TONE: Record<
  AuditStatus,
  "neutral" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  draft: "neutral",
  queued: "info",
  running: "accent",
  ready: "success",
  needs_review: "warning",
  blocked: "danger",
  failed: "danger",
};

export function StatusBadge({ status }: { status: AuditStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
