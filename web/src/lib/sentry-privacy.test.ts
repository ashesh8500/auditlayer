import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { normalizeSentryWebhook, scrubSentryEvent } from "./sentry-privacy";
import { isValidSentrySignature } from "./sentry-webhook";

describe("scrubSentryEvent", () => {
  it("retains only allowlisted diagnostics and source frames", () => {
    const event = {
      environment: "production",
      release: "3548ec4",
      level: "error",
      tags: {
        service: "auditlayer-web",
        surface: "instagram-oauth",
        operation: "callback.exchange",
        error_class: "OAuthExchangeError",
        status: "failed",
        handle: "private_creator",
      },
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
      arbitrary: "must not survive",
    };
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed).toEqual({
      environment: "production",
      release: "3548ec4",
      level: "error",
      tags: {
        service: "auditlayer-web",
        surface: "instagram-oauth",
        operation: "callback.exchange",
        error_class: "OAuthExchangeError",
        status: "failed",
      },
      fingerprint: [
        "{{ default }}",
        "auditlayer-web",
        "instagram-oauth",
        "callback.exchange",
        "OAuthExchangeError",
      ],
      exception: {
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
      },
    });
    expect(JSON.stringify(scrubbed)).not.toContain("private_creator");
    expect(JSON.stringify(scrubbed)).not.toContain("person@example.com");
    expect(JSON.stringify(scrubbed)).not.toContain("must not survive");
  });

  it("drops a malformed source URL instead of retaining embedded credentials", () => {
    const scrubbed = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "TypeError",
            stacktrace: {
              frames: [
                {
                  abs_path: "https://user:password@example.com:bad/app.js?token=secret",
                  function: "run",
                },
              ],
            },
          },
        ],
      },
    });

    expect(JSON.stringify(scrubbed)).not.toContain("user:password");
    expect(
      (scrubbed.exception.values[0].stacktrace.frames[0] as Record<string, unknown>).abs_path,
    ).toBeUndefined();
  });

  it("drops data and blob frame locations so embedded private canaries cannot serialize", () => {
    const scrubbed = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "TypeError",
            stacktrace: {
              frames: [
                {
                  filename: "data:text/plain,PRIVATE_FRAME_CANARY",
                  abs_path: "blob:https://auditlayermedia.com/PRIVATE_FRAME_CANARY",
                  function: "run",
                  lineno: 7,
                },
              ],
            },
          },
        ],
      },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain("PRIVATE_FRAME_CANARY");
    expect(serialized).not.toContain("data:");
    expect(serialized).not.toContain("blob:");
    expect(scrubbed.exception.values[0].stacktrace.frames[0]).toEqual({
      function: "run",
      lineno: 7,
    });
  });

  it("drops every non-http absolute frame protocol before serialization", () => {
    const scrubbed = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "TypeError",
            stacktrace: {
              frames: [
                {
                  filename: "javascript:PRIVATE_FRAME_CANARY",
                  abs_path: "file:///home/PRIVATE_FRAME_CANARY/app.ts",
                  function: "run",
                  lineno: 9,
                },
              ],
            },
          },
        ],
      },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain("PRIVATE_FRAME_CANARY");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("file:");
    expect(scrubbed.exception.values[0].stacktrace.frames[0]).toEqual({
      function: "run",
      lineno: 9,
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
  it("normalizes the official issue-alert event shape with tuple tags", () => {
    const result = normalizeSentryWebhook({
      action: "triggered",
      data: {
        event: {
          event_id: "e4874d664c3540c1a32eab185f12c5ab",
          issue_id: "1117540176",
          project: 1,
          level: "error",
          web_url: "https://sentry.example/issues/1117540176/events/e487?oauth_code=secret",
          metadata: { type: "OAuthExchangeError", value: "PRIVATE_CANARY" },
          tags: [
            ["environment", "preview"],
            ["release", "f6cfaf9a69bf0c4b1e9ad819c9a1f47dc9c68ef1"],
            ["service", "auditlayer-web"],
            ["surface", "instagram_oauth"],
            ["operation", "token_exchange"],
            ["error_class", "OAuthExchangeError"],
            ["status", "failed"],
            ["handle", "private_creator"],
          ],
          request: { headers: [["authorization", "Bearer secret"]] },
          user: { email: "private@example.com" },
        },
      },
    });

    expect(result).toEqual({
      fingerprint: "sentry:1:1117540176",
      source: "sentry",
      severity: "error",
      environment: "preview",
      title: "OAuthExchangeError in instagram_oauth",
      externalUrl: "https://sentry.example/issues/1117540176/events/e487",
      metadata: {
        service: "auditlayer-web",
        surface: "instagram_oauth",
        operation: "token_exchange",
        error_class: "OAuthExchangeError",
        status: "failed",
        release: "f6cfaf9a69bf0c4b1e9ad819c9a1f47dc9c68ef1",
      },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CANARY");
    expect(JSON.stringify(result)).not.toContain("private_creator");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("oauth_code");
  });

  it("retains only bounded incident metadata", () => {
    const result = normalizeSentryWebhook({
      action: "created",
      data: {
        issue: {
          id: "123",
          title: "Worker failed for private creator",
          culprit: "worker.run",
          level: "error",
          permalink: "https://sentry.example/issues/123?oauth_code=secret#private",
          metadata: { type: "OAuthExchangeError", value: "secret payload" },
          project: { slug: "worker" },
          tags: [
            { key: "environment", value: "production" },
            { key: "release", value: "3548ec4004fe6796d479108c53683077834dc863" },
            { key: "service", value: "auditlayer-worker" },
            { key: "surface", value: "instagram_oauth" },
            { key: "operation", value: "token_exchange" },
            { key: "error_class", value: "OAuthExchangeError" },
            { key: "status", value: "failed" },
            { key: "handle", value: "private_creator" },
          ],
        },
      },
      installation: { uuid: "secret" },
    });
    expect(result).toEqual({
      fingerprint: "sentry:auditlayer-worker:123",
      source: "sentry",
      severity: "error",
      environment: "production",
      title: "OAuthExchangeError in instagram_oauth",
      externalUrl: "https://sentry.example/issues/123",
      metadata: {
        service: "auditlayer-worker",
        surface: "instagram_oauth",
        operation: "token_exchange",
        error_class: "OAuthExchangeError",
        status: "failed",
        release: "3548ec4004fe6796d479108c53683077834dc863",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret payload");
    expect(JSON.stringify(result)).not.toContain("private_creator");
    expect(JSON.stringify(result)).not.toContain("oauth_code");
  });

  it("deduplicates repeated issue notifications by immutable project and issue id", () => {
    const payload = (service: string) => ({
      action: "created",
      data: {
        issue: {
          id: "123",
          level: "error",
          project: { slug: "worker" },
          tags: [{ key: "service", value: service }],
        },
      },
    });

    expect(normalizeSentryWebhook(payload("auditlayer-worker"))?.fingerprint).toBe(
      "sentry:auditlayer-worker:123",
    );
    expect(normalizeSentryWebhook(payload("auditlayer-web"))?.fingerprint).toBe(
      "sentry:auditlayer-worker:123",
    );
  });
});
