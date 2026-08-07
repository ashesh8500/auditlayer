import { describe, expect, it } from "vitest";

import {
  reduceStripeSubscriptionEvent,
  type NormalizedStripeSubscriptionEvent,
  type StripeSubscriptionSnapshot,
} from "./stripe-reconciliation";

// Deterministic supported price mapping (mirrors offer-pricing env lookup).
process.env.STRIPE_PRICE_PRO = "price_pro";
process.env.STRIPE_PRICE_STARTER = "price_starter";

const PROFILE_ID = "00000000-0000-0000-0000-0000000000aa";

function snapshot(overrides: Partial<StripeSubscriptionSnapshot> = {}): StripeSubscriptionSnapshot {
  return {
    id: "sub_123",
    customerId: "cus_123",
    status: "active",
    priceId: "price_pro",
    currentPeriodEndEpoch: 1_750_000_000,
    profileId: PROFILE_ID,
    ...overrides,
  };
}

function event(overrides: Partial<NormalizedStripeSubscriptionEvent> = {}): NormalizedStripeSubscriptionEvent {
  return {
    eventId: "evt_1",
    eventType: "customer.subscription.updated",
    eventCreated: 1_749_999_900,
    subscription: snapshot(),
    ...overrides,
  };
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

describe("stripe subscription reconciliation reducer", () => {
  it("reduces an active subscription to one plan_grant command", () => {
    const result = reduceStripeSubscriptionEvent(event());
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command).toMatchObject({
      eventId: "evt_1",
      eventType: "customer.subscription.updated",
      eventCreated: 1_749_999_900,
      subscriptionId: "sub_123",
      customerId: "cus_123",
      profileId: PROFILE_ID,
      status: "active",
      plan: "pro",
      commandType: "plan_grant",
      currentPeriodEndEpoch: 1_750_000_000,
    });
    expect(result.command.digest).toMatch(SHA256_HEX_RE);
  });

  it("maps the starter price id to starter", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ priceId: "price_starter" }) }),
    );
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.plan).toBe("starter");
    expect(result.command.commandType).toBe("plan_grant");
  });

  it("reduces a trialing subscription to a plan_grant command", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ status: "trialing" }) }),
    );
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.status).toBe("trialing");
    expect(result.command.plan).toBe("pro");
  });

  it("reduces a canceled subscription to a plan_revoke (free)", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ status: "canceled" }) }),
    );
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.status).toBe("canceled");
    expect(result.command.plan).toBe("free");
    expect(result.command.commandType).toBe("plan_revoke");
  });

  it("reduces a deleted event with canceled status to plan_revoke", () => {
    const result = reduceStripeSubscriptionEvent(
      event({
        eventType: "customer.subscription.deleted",
        subscription: snapshot({ status: "canceled" }),
      }),
    );
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.commandType).toBe("plan_revoke");
  });

  it("reduces checkout.session.completed with a retrieved subscription", () => {
    const result = reduceStripeSubscriptionEvent(
      event({
        eventType: "checkout.session.completed",
        eventCreated: 1_749_999_901,
        subscription: snapshot({ profileId: null }),
      }),
    );
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.eventType).toBe("checkout.session.completed");
    expect(result.command.profileId).toBeNull();
    expect(result.command.plan).toBe("pro");
  });

  it("returns unknown_price for an unknown price id and NEVER maps it to free", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ priceId: "price_unknown" }) }),
    );
    expect(result.kind).toBe("correction");
    if (result.kind !== "correction") return;
    expect(result.code).toBe("unknown_price");
    // The correction refuses the downgrade; no command with plan 'free' exists.
    expect(result.message).toContain("refusing");
  });

  it("returns unknown_price when the price id is absent", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ priceId: null }) }),
    );
    expect(result.kind).toBe("correction");
    if (result.kind !== "correction") return;
    expect(result.code).toBe("unknown_price");
  });

  it("returns unsupported_status for past_due/unpaid/bogus statuses", () => {
    for (const status of ["past_due", "unpaid", "incomplete", "bogus"]) {
      const result = reduceStripeSubscriptionEvent(
        event({ subscription: snapshot({ status }) }),
      );
      expect(result.kind).toBe("correction");
      if (result.kind !== "correction") continue;
      expect(result.code).toBe("unsupported_status");
    }
  });

  it("returns unsupported_event_type for non-subscription events", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ eventType: "invoice.paid" }),
    );
    expect(result.kind).toBe("correction");
    if (result.kind !== "correction") return;
    expect(result.code).toBe("unsupported_event_type");
  });

  it("returns malformed_subscription for missing subscription/customer identity", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ id: "", customerId: "cus_123" }) }),
    );
    expect(result.kind).toBe("correction");
    if (result.kind !== "correction") return;
    expect(result.code).toBe("malformed_subscription");
  });

  it("returns malformed_period for an active subscription without period end", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ currentPeriodEndEpoch: null }) }),
    );
    expect(result.kind).toBe("correction");
    if (result.kind !== "correction") return;
    expect(result.code).toBe("malformed_period");
  });

  it("returns malformed_subscription for an invalid profile id hint", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ profileId: "not-a-uuid" }) }),
    );
    expect(result.kind).toBe("correction");
    if (result.kind !== "correction") return;
    expect(result.code).toBe("malformed_subscription");
  });

  it("returns malformed_subscription for missing event identity or created time", () => {
    const missingId = reduceStripeSubscriptionEvent(event({ eventId: "" }));
    expect(missingId.kind).toBe("correction");
    if (missingId.kind === "correction") {
      expect(missingId.code).toBe("malformed_subscription");
    }

    const badCreated = reduceStripeSubscriptionEvent(
      event({ eventCreated: Number.NaN }),
    );
    expect(badCreated.kind).toBe("correction");
    if (badCreated.kind === "correction") {
      expect(badCreated.code).toBe("malformed_subscription");
    }
  });

  it("is deterministic: identical input yields an identical digest", () => {
    const first = reduceStripeSubscriptionEvent(event());
    const second = reduceStripeSubscriptionEvent(event());
    expect(first.kind).toBe("command");
    expect(second.kind).toBe("command");
    if (first.kind !== "command" || second.kind !== "command") return;
    expect(first.command.digest).toBe(second.command.digest);
  });

  it("produces a distinct digest when the command changes", () => {
    const active = reduceStripeSubscriptionEvent(event());
    const canceled = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ status: "canceled" }) }),
    );
    expect(active.kind).toBe("command");
    expect(canceled.kind).toBe("command");
    if (active.kind !== "command" || canceled.kind !== "command") return;
    expect(active.command.digest).not.toBe(canceled.command.digest);
  });

  it("carries the profile hint through as null when absent", () => {
    const result = reduceStripeSubscriptionEvent(
      event({ subscription: snapshot({ profileId: null }) }),
    );
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.profileId).toBeNull();
  });
});
