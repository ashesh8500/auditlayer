import * as Sentry from "@sentry/nextjs";

export const WEB_SENTRY_SURFACES = [
  "auth",
  "instagram_oauth",
  "instagram_persistence",
  "sentry_webhook",
  "web_runtime",
] as const;

export const WEB_SENTRY_OPERATIONS = [
  "oauth_start",
  "oauth_callback",
  "token_exchange",
  "long_lived_token_exchange",
  "profile_fetch",
  "permission_validation",
  "connection_persist",
  "disconnect",
  "incident_ingest",
  "request",
] as const;

export const SENTRY_FAILURE_STATUSES = [
  "failed",
  "rejected",
  "unavailable",
  "retrying",
  "degraded",
] as const;

export const WEB_SENTRY_ERROR_CLASSES = [
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "AggregateError",
  "OAuthExchangeError",
  "OAuthConfigError",
  "OAuthTokenExchangeError",
  "OAuthLongLivedExchangeError",
  "InstagramProfileFetchError",
  "InstagramProfessionalAccountRequiredError",
  "InstagramConnectionStoreError",
  "InstagramDisconnectError",
  "IncidentWriteError",
  "SyntheticProbeError",
] as const;

export type WebSentrySurface = (typeof WEB_SENTRY_SURFACES)[number];
export type WebSentryOperation = (typeof WEB_SENTRY_OPERATIONS)[number];
export type SentryFailureStatus = (typeof SENTRY_FAILURE_STATUSES)[number];
export type WebSentryErrorClass = (typeof WEB_SENTRY_ERROR_CLASSES)[number];

export type WebFailureContext = {
  surface: WebSentrySurface;
  operation: WebSentryOperation;
  status: SentryFailureStatus;
  errorClass?: WebSentryErrorClass;
};

function safeErrorClass(value: unknown): string {
  return typeof value === "string" && (WEB_SENTRY_ERROR_CLASSES as readonly string[]).includes(value)
    ? value
    : "Error";
}

/** Capture a web failure without accepting arbitrary customer context. */
export function captureWebFailure(error: unknown, context: WebFailureContext): void {
  const errorClass = safeErrorClass(
    context.errorClass ?? (error instanceof Error ? error.name : "Error"),
  );
  Sentry.withScope((scope) => {
    const tags = {
      service: "auditlayer-web",
      surface: context.surface,
      operation: context.operation,
      error_class: errorClass,
      status: context.status,
    } as const;
    for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
    scope.setFingerprint([
      "{{ default }}",
      tags.service,
      tags.surface,
      tags.operation,
      tags.error_class,
    ]);
    Sentry.captureException(error instanceof Error ? error : new Error("Captured web failure"));
  });
}
