import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/actions/workflows", () => ({ workflowCommand: vi.fn() }));
import { WorkflowOwner } from "./workflow-owner";

const resource = {
  ownerId: "owner", fetchedAt: "2026-09-19T00:00:00.000000Z",
  workflows: [{
    id: "22222222-2222-4222-8222-222222222222", subject_id: "subject", version_id: "33333333-3333-4333-8333-333333333333",
    objective: "Review changes and propose cited priorities", timezone: "America/New_York", local_time: "09:00", weekday: null,
    status: "paused", pause_reason: "insufficient_credit", next_at: null,
    model: { provider: "offline", model: "test", model_version: "1", data_route: "https://example.invalid" },
    rate_card_version: "offline.v1", method_version: "brand-update.v1", allowed_tools: [],
    customer_max: { currency: "USD", microusd: 1000 }, upstream_max: { currency: "USD", microusd: 1000 },
    recipients: ["44444444-4444-4444-8444-444444444444"], run_granted: true, schedule_granted: false, delivery_granted: [],
    occurrences: [{
      id: "55555555-5555-4555-8555-555555555555", version_id: "33333333-3333-4333-8333-333333333333",
      context_version_id: "66666666-6666-4666-8666-666666666666", scheduled_at: "2026-09-20T13:00:00.000000Z", state: "awaiting_admission",
      audit_id: null, artifact_version_id: null,
      deliveries: [{ id: "77777777-7777-4777-8777-777777777777", recipient_id: "44444444-4444-4444-8444-444444444444", artifact_version_id: "artifact", status: "reconciling", sent_at: null }],
    }],
  }],
} as never;

it("shows run, schedule and delivery permissions as separate decisions", () => {
  const html = renderToStaticMarkup(<WorkflowOwner ownerId="owner" resource={resource} />);
  expect(html).toContain("Run allowed");
  expect(html).toContain("Schedule not authorized");
  expect(html).toContain("No recipient authorized");
  expect(html).toContain("Review before send");
});

it("explains a recovered pause truthfully and keeps dispatch stopped", () => {
  const html = renderToStaticMarkup(<WorkflowOwner ownerId="owner" resource={resource} />);
  expect(html).toContain("insufficient credit");
  expect(html).toContain("No paid work is running");
  expect(html).toContain("Resume after grants");
});

it("labels ambiguous delivery as reconciling rather than sent or failed", () => {
  const html = renderToStaticMarkup(<WorkflowOwner ownerId="owner" resource={resource} />);
  expect(html).toContain("reconciling");
  expect(html).not.toContain("Sent");
});

it("never renders provider receipts, storage paths or recipient emails", () => {
  const extra = { provider_receipt: "secret", report_path: "private/x.html", recipient_email: "a@b.test" };
  const polluted = { ownerId: "owner", fetchedAt: "2026-09-19T00:00:00.000000Z", workflows: [(resource as { workflows: Record<string, unknown>[] }).workflows[0], extra] };
  const html = renderToStaticMarkup(<WorkflowOwner ownerId="owner" resource={polluted as never} />);
  expect(html).not.toContain("secret");
  expect(html).not.toContain("private/x.html");
  expect(html).not.toContain("a@b.test");
});
