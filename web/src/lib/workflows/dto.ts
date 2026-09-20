/**
 * TEMPORARY local view of the SQL `brand_workflow_resource` projection.
 *
 * There is no validator, catalog or wire contract here — it is a TypeScript
 * shape for one server response so this lane typechecks before the parent's
 * generated `WorkflowResource` lands. Parent port: add the fields listed in
 * docs/workspace-workflow-integration-20260919.md to contracts/workspace-v1,
 * then delete this file and import the generated type from
 * `@/lib/workspace-contracts`. Do not extend it into a second public schema.
 */
export interface WorkflowModelPin {
  provider: string;
  model: string;
  model_version: string;
  data_route: string;
}

export interface WorkflowDeliveryView {
  id: string;
  recipient_id: string;
  artifact_version_id: string;
  status: "queued" | "dispatching" | "reconciling" | "sent";
  sent_at: string | null;
}

export interface WorkflowOccurrenceView {
  id: string;
  version_id: string;
  context_version_id: string;
  scheduled_at: string;
  state: "awaiting_admission" | "queued" | "review" | "failed";
  audit_id: string | null;
  artifact_version_id: string | null;
  deliveries: WorkflowDeliveryView[];
}

export interface WorkflowSummaryView {
  id: string;
  subject_id: string;
  version_id: string;
  objective: string;
  timezone: string;
  local_time: string;
  weekday: number | null;
  status: "draft" | "active" | "paused" | "cancelled";
  pause_reason: string | null;
  next_at: string | null;
  model: WorkflowModelPin;
  rate_card_version: string;
  method_version: string;
  allowed_tools: string[];
  customer_max: { currency: "USD"; microusd: number };
  upstream_max: { currency: "USD"; microusd: number };
  recipients: string[];
  run_granted: boolean;
  schedule_granted: boolean;
  delivery_granted: string[];
  occurrences: WorkflowOccurrenceView[];
}

export interface WorkflowResourceView {
  ownerId: string;
  fetchedAt: string;
  workflows: WorkflowSummaryView[];
}
