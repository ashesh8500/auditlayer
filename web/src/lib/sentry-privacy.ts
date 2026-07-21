type UnknownRecord = Record<string, unknown>;

const SECRET_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "access_token",
  "refresh_token",
  "instagram_token",
  "supabase_service_role_key",
  "api_key",
  "password",
  "secret",
  "token",
  "creator_handle",
  "creatorhandle",
  "handle",
  "report_html",
  "reporthtml",
  "report",
  "instruction",
  "context",
  "email",
  "session",
  "session_id",
]);

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function scrubValue(value: unknown, key = ""): unknown {
  if (SECRET_KEYS.has(key.toLowerCase())) return "[Filtered]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord).map(([childKey, childValue]) => [
        childKey,
        scrubValue(childValue, childKey),
      ]),
    );
  }
  return value;
}

/** Sentry beforeSend hook: reports diagnostics, never creator/report/session content. */
export function scrubSentryEvent<T extends object>(event: T): T {
  const clone = structuredClone(event) as UnknownRecord;
  delete clone.user;
  delete clone.message;
  delete clone.logentry;
  delete clone.breadcrumbs;
  delete clone.tags;
  delete clone.fingerprint;
  if (clone.exception && typeof clone.exception === "object") {
    const exception = clone.exception as UnknownRecord;
    const values = Array.isArray(exception.values) ? exception.values : [];
    clone.exception = {
      values: values.slice(0, 10).map((entry) => {
        const value = record(entry);
        const rawFrames = record(value.stacktrace).frames;
        const frames = Array.isArray(rawFrames)
          ? rawFrames.slice(-100).map((rawFrame) => {
              const frame = record(rawFrame);
              return Object.fromEntries(
                ["filename", "function", "module", "lineno", "colno", "in_app"]
                  .map((key) => {
                    const frameValue = frame[key];
                    return [
                      key,
                      typeof frameValue === "string"
                        ? frameValue.slice(0, 500)
                        : typeof frameValue === "number" || typeof frameValue === "boolean"
                          ? frameValue
                          : undefined,
                    ];
                  })
                  .filter(([, frameValue]) => frameValue !== undefined),
              );
            })
          : [];
        return {
          type: typeof value.type === "string" ? value.type.slice(0, 120) : "Error",
          value: "[Filtered]",
          ...(frames.length ? { stacktrace: { frames } } : {}),
        };
      }),
    };
  }
  if (clone.request && typeof clone.request === "object") {
    const request = { ...(clone.request as UnknownRecord) };
    request.data = "[Filtered]";
    delete request.url;
    delete request.query_string;
    delete request.fragment;
    delete request.cookies;
    if (request.headers && typeof request.headers === "object") {
      request.headers = Object.fromEntries(
        Object.entries(request.headers as UnknownRecord).filter(
          ([key]) => !SECRET_KEYS.has(key.toLowerCase()),
        ),
      );
    }
    clone.request = request;
  }
  if (clone.contexts && typeof clone.contexts === "object") {
    const contexts = { ...(clone.contexts as UnknownRecord) };
    delete contexts.report;
    delete contexts.creator;
    clone.contexts = contexts;
  }
  clone.extra = scrubValue(clone.extra ?? {});
  return clone as T;
}

export type NormalizedSentryIncident = {
  fingerprint: string;
  source: "sentry";
  severity: "debug" | "info" | "warning" | "error" | "fatal";
  environment: string;
  title: string;
  externalUrl: string | null;
  metadata: { action: string; project: string; type: string };
};

function bounded(value: unknown, max: number, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clean ? clean.slice(0, max) : fallback;
}

export function normalizeSentryWebhook(payload: unknown): NormalizedSentryIncident | null {
  const root = record(payload);
  const data = record(root.data);
  const issue = record(data.issue);
  const id = bounded(issue.id, 120, "");
  const project = bounded(record(issue.project).slug, 80, "unknown");
  if (!id) return null;

  const rawLevel = bounded(issue.level, 20, "error");
  const severity = (["debug", "info", "warning", "error", "fatal"] as const).includes(
    rawLevel as "debug" | "info" | "warning" | "error" | "fatal",
  )
    ? (rawLevel as NormalizedSentryIncident["severity"])
    : "error";
  const permalink = bounded(issue.permalink, 1000, "");
  const externalUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#]|$)/i.test(permalink)
    ? permalink
    : null;
  const errorType = bounded(record(issue.metadata).type, 120, "Sentry issue");

  return {
    fingerprint: `sentry:${project}:${id}`.slice(0, 255),
    source: "sentry",
    severity,
    environment: bounded(issue.environment, 80, "unknown"),
    title: `${errorType} in ${project}`.slice(0, 500),
    externalUrl,
    metadata: {
      action: bounded(root.action, 80, "unknown"),
      project,
      type: errorType,
    },
  };
}
