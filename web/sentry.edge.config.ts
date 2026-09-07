import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeIdentity } from "./src/lib/sentry-config";
import { scrubSentryEvent } from "./src/lib/sentry-privacy";

const identity = resolveSentryRuntimeIdentity({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
});
Sentry.init({
  ...identity,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  beforeSendTransaction: () => null,
  initialScope: {
    tags: {
      service: "auditlayer-web",
      surface: "web_runtime",
      operation: "request",
      error_class: "Error",
      status: "failed",
    },
  },
  beforeSend: (event) => scrubSentryEvent(event),
});
