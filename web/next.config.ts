import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSentrySourceMapUploadConfigured } from "./src/lib/sentry-config";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: webRoot,
  },
};

const sentryRelease = process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
const sourceMapUploadConfigured = isSentrySourceMapUploadConfigured({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: sentryRelease,
});

export default sourceMapUploadConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: sentryRelease },
      silent: true,
      telemetry: false,
      sourcemaps: { disable: false, deleteSourcemapsAfterUpload: true },
      widenClientFileUpload: true,
    })
  : nextConfig;
