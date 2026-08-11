import { describe, expect, it, vi } from "vitest";

import {
  processWaitlistSubmission,
  type WaitlistDependencies,
} from "./waitlist";

describe("processWaitlistSubmission", () => {
  it("normalizes a valid lead, saves it, and notifies the founders", async () => {
    const save = vi.fn<WaitlistDependencies["save"]>().mockResolvedValue(undefined);
    const notify = vi.fn<WaitlistDependencies["notify"]>().mockResolvedValue(undefined);

    const result = await processWaitlistSubmission(
      {
        name: "  Narin Fazlalipour ",
        email: " NARIN@example.com ",
        organization: " AuditLayerMedia ",
        socialHandle: " @auditlayermedia ",
        primaryInterest: "competitive-intelligence",
        notes: " We want to understand our closest peers. ",
        marketingUpdates: "on",
        website: "",
      },
      { save, notify },
    );

    expect(result).toEqual({ status: "ok" });
    expect(save).toHaveBeenCalledWith({
      name: "Narin Fazlalipour",
      email: "narin@example.com",
      organization: "AuditLayerMedia",
      socialHandle: "@auditlayermedia",
      primaryInterest: "competitive-intelligence",
      notes: "We want to understand our closest peers.",
      marketingUpdates: true,
      source: "website",
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      email: "narin@example.com",
      primaryInterest: "competitive-intelligence",
    }));
  });

  it("returns a useful error without saving invalid contact details", async () => {
    const save = vi.fn<WaitlistDependencies["save"]>();
    const notify = vi.fn<WaitlistDependencies["notify"]>();

    const result = await processWaitlistSubmission(
      {
        name: "N",
        email: "not-an-email",
        organization: "",
        socialHandle: "",
        primaryInterest: "brand-strategy",
        notes: "",
        marketingUpdates: "",
        website: "",
      },
      { save, notify },
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter your name and a valid email address.",
    });
    expect(save).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("silently discards submissions that fill the hidden website field", async () => {
    const save = vi.fn<WaitlistDependencies["save"]>();
    const notify = vi.fn<WaitlistDependencies["notify"]>();

    const result = await processWaitlistSubmission(
      {
        name: "Automated Visitor",
        email: "bot@example.com",
        organization: "",
        socialHandle: "",
        primaryInterest: "account-growth",
        notes: "",
        marketingUpdates: "",
        website: "https://spam.example",
      },
      { save, notify },
    );

    expect(result).toEqual({ status: "ok" });
    expect(save).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("confirms a saved lead even when founder notification is temporarily unavailable", async () => {
    const save = vi.fn<WaitlistDependencies["save"]>().mockResolvedValue(undefined);
    const notify = vi.fn<WaitlistDependencies["notify"]>().mockRejectedValue(new Error("email unavailable"));

    const result = await processWaitlistSubmission(
      {
        name: "Prospective Client",
        email: "lead@example.com",
        organization: "Example Brand",
        socialHandle: "@example",
        primaryInterest: "ongoing-management",
        notes: "",
        marketingUpdates: "",
        website: "",
      },
      { save, notify },
    );

    expect(result).toEqual({ status: "ok" });
    expect(save).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("returns a retryable error when the lead cannot be saved", async () => {
    const save = vi.fn<WaitlistDependencies["save"]>().mockRejectedValue(new Error("database unavailable"));
    const notify = vi.fn<WaitlistDependencies["notify"]>();

    const result = await processWaitlistSubmission(
      {
        name: "Prospective Client",
        email: "lead@example.com",
        organization: "",
        socialHandle: "",
        primaryInterest: "content-planning",
        notes: "",
        marketingUpdates: "",
        website: "",
      },
      { save, notify },
    );

    expect(result).toEqual({
      status: "error",
      message: "We couldn't save your request. Please try again.",
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
