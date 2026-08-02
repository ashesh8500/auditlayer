import { afterEach, describe, expect, it } from "vitest";

import {
  isPreviewLoginAllowed,
  previewTestUserEmail,
  siteUrl,
} from "./env";

const KEYS = [
  "VERCEL_ENV",
  "VERCEL_URL",
  "NEXT_PUBLIC_SITE_URL",
  "AUDITLAYER_ALLOW_PREVIEW_LOGIN",
  "PREVIEW_TEST_USER_EMAIL",
] as const;

const snapshot: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function captureEnv() {
  for (const key of KEYS) {
    snapshot[key] = process.env[key];
  }
}

describe("siteUrl", () => {
  it("prefers Vercel preview URL over production NEXT_PUBLIC_SITE_URL", () => {
    captureEnv();
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "web-abc123.vercel.app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://auditlayermedia.com";
    expect(siteUrl()).toBe("https://web-abc123.vercel.app");
  });
});

describe("isPreviewLoginAllowed", () => {
  it("is hard-disabled on Vercel production", () => {
    captureEnv();
    process.env.VERCEL_ENV = "production";
    process.env.AUDITLAYER_ALLOW_PREVIEW_LOGIN = "1";
    expect(isPreviewLoginAllowed()).toBe(false);
  });

  it("is enabled on Vercel preview", () => {
    captureEnv();
    process.env.VERCEL_ENV = "preview";
    delete process.env.AUDITLAYER_ALLOW_PREVIEW_LOGIN;
    expect(isPreviewLoginAllowed()).toBe(true);
  });

  it("defaults preview tester email", () => {
    captureEnv();
    delete process.env.PREVIEW_TEST_USER_EMAIL;
    expect(previewTestUserEmail()).toBe("preview-tester@auditlayermedia.com");
  });
});
