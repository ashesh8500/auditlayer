import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeIdentity } from "@/lib/sentry-config";
import { scrubSentryEvent } from "@/lib/sentry-privacy";

const identity = resolveSentryRuntimeIdentity({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_VERCEL_ENV,
  release:
    process.env.SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
});
Sentry.init({
  ...identity,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
