import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const setTag = vi.fn();
  const setFingerprint = vi.fn();
  const captureException = vi.fn();
  return {
    setTag,
    setFingerprint,
    captureException,
    withScope: vi.fn((callback: (scope: { setTag: typeof setTag; setFingerprint: typeof setFingerprint }) => void) =>
      callback({ setTag, setFingerprint }),
    ),
  };
});

vi.mock("@sentry/nextjs", () => sentry);

import { captureWebFailure } from "./sentry";

describe("captureWebFailure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("captures an exception with only fixed safe grouping dimensions", () => {
    const error = new Error("private creator and token must be scrubbed");
    error.name = "OAuthExchangeError";

    captureWebFailure(error, {
      surface: "instagram_oauth",
      operation: "token_exchange",
      status: "failed",
    });

    expect(sentry.setTag.mock.calls).toEqual([
      ["service", "auditlayer-web"],
      ["surface", "instagram_oauth"],
      ["operation", "token_exchange"],
      ["error_class", "OAuthExchangeError"],
      ["status", "failed"],
    ]);
    expect(sentry.setFingerprint).toHaveBeenCalledWith([
      "{{ default }}",
      "auditlayer-web",
      "instagram_oauth",
      "token_exchange",
      "OAuthExchangeError",
    ]);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("rejects a runtime error-class value outside the fixed vocabulary", () => {
    captureWebFailure(new Error("private"), {
      surface: "web_runtime",
      operation: "request",
      status: "failed",
      errorClass: "private_creator" as never,
    });

    expect(sentry.setTag).toHaveBeenCalledWith("error_class", "Error");
    expect(sentry.setFingerprint).toHaveBeenCalledWith([
      "{{ default }}",
      "auditlayer-web",
      "web_runtime",
      "request",
      "Error",
    ]);
  });
});
