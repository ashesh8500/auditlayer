import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { normalizeSentryWebhook, scrubSentryEvent } from "./sentry-privacy";
import { isValidSentrySignature } from "./sentry-webhook";

describe("scrubSentryEvent", () => {
  it("removes secrets, cookies, user identity, and report content", () => {
    const event = {
      request: {
        url: "https://auditlayermedia.com/report?token=secret",
        headers: {
          authorization: "Bearer secret",
          cookie: "session=secret",
          "user-agent": "test",
        },
        data: { reportHtml: "private report", handle: "creator" },
      },
      user: { id: "uuid", email: "person@example.com", ip_address: "1.2.3.4" },
      message: "failed for private_creator with secret",
      exception: {
        values: [
          {
            type: "RuntimeError",
            value: "private report failed",
            stacktrace: {
              frames: [
                {
                  filename: "src/lib/actions/operator.ts",
                  function: "sendOperatorMessage",
                  lineno: 184,
                  colno: 5,
                  in_app: true,
                  vars: { creator: "private_creator" },
                  context_line: "throw new Error(privateReport)",
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [{ message: "creator private_creator" }],
      extra: {
        access_token: "ig-secret",
        creatorHandle: "private_creator",
        reportHtml: "private report",
        email: "person@example.com",
        safe: "kept",
      },
    };
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.request?.headers).toEqual({ "user-agent": "test" });
    expect(scrubbed.request?.data).toEqual("[Filtered]");
    expect(scrubbed.request?.url).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.message).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.exception).toEqual({
      values: [
        {
          type: "RuntimeError",
          value: "[Filtered]",
          stacktrace: {
            frames: [
              {
                filename: "src/lib/actions/operator.ts",
                function: "sendOperatorMessage",
                lineno: 184,
                colno: 5,
                in_app: true,
              },
            ],
          },
        },
      ],
    });
    expect(scrubbed.extra).toEqual({
      access_token: "[Filtered]",
      creatorHandle: "[Filtered]",
      reportHtml: "[Filtered]",
      email: "[Filtered]",
      safe: "kept",
    });
  });
});

describe("isValidSentrySignature", () => {
  it("accepts the Sentry HMAC and rejects other values", () => {
    const body = '{"action":"created"}';
    const secret = "webhook-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(isValidSentrySignature(body, signature, secret)).toBe(true);
    expect(isValidSentrySignature(body, "bad", secret)).toBe(false);
    expect(isValidSentrySignature(body, signature, "")).toBe(false);
  });
});

describe("normalizeSentryWebhook", () => {
  it("retains only bounded incident metadata", () => {
    const result = normalizeSentryWebhook({
      action: "created",
      data: {
        issue: {
          id: "123",
          title: "Worker failed for private creator",
          culprit: "worker.run",
          level: "error",
          permalink: "https://sentry.example/issues/123",
          metadata: { type: "RuntimeError", value: "secret payload" },
          project: { slug: "worker" },
        },
      },
      installation: { uuid: "secret" },
    });
    expect(result).toEqual({
      fingerprint: "sentry:worker:123",
      source: "sentry",
      severity: "error",
      environment: "unknown",
      title: "RuntimeError in worker",
      externalUrl: "https://sentry.example/issues/123",
      metadata: { action: "created", project: "worker", type: "RuntimeError" },
    });
    expect(JSON.stringify(result)).not.toContain("secret payload");
  });
});
