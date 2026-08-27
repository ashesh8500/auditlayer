type UnknownRecord = Record<string, unknown>;

const DIAGNOSTIC_TAGS = ["service", "surface", "operation", "error_class", "status"] as const;
const LEVELS = new Set(["debug", "info", "warning", "error", "fatal"]);

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function safeDimension(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== "string") return fallback;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/[^a-zA-Z0-9._:/-]/g, "_");
  return clean ? clean.slice(0, max) : fallback;
}

function safeFrameLocation(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const raw = value.trim().slice(0, 1000);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 500);
  } catch {
    if (raw.includes("://")) return undefined;
    return raw.split(/[?#]/, 1)[0].slice(0, 500);
  }
}

/** Sentry beforeSend hook: reports diagnostics, never creator/report/session content. */
export function scrubSentryEvent<T extends object>(event: T): T {
  const source = structuredClone(event) as UnknownRecord;
  const safe: UnknownRecord = {};
  if (typeof source.event_id === "string" && /^[a-f0-9]{32}$/i.test(source.event_id)) {
    safe.event_id = source.event_id;
  }
  if (typeof source.timestamp === "number" && Number.isFinite(source.timestamp)) {
    safe.timestamp = source.timestamp;
  }
  if (typeof source.environment === "string" && source.environment.trim()) {
    safe.environment = safeDimension(source.environment, "unknown", 80);
  }
  if (typeof source.release === "string" && source.release.trim()) {
    safe.release = safeDimension(source.release, "unknown", 200);
  }
  if (typeof source.level === "string" && LEVELS.has(source.level)) safe.level = source.level;

  let exceptionType = "Error";
  if (source.exception && typeof source.exception === "object") {
    const exception = source.exception as UnknownRecord;
    const values = Array.isArray(exception.values) ? exception.values : [];
    safe.exception = {
      values: values.slice(0, 10).map((entry) => {
        const value = record(entry);
        const type = safeDimension(value.type, "Error");
        if (exceptionType === "Error") exceptionType = type;
        const rawFrames = record(value.stacktrace).frames;
        const frames = Array.isArray(rawFrames)
          ? rawFrames.slice(-100).map((rawFrame) => {
              const frame = record(rawFrame);
              return Object.fromEntries(
                ["filename", "abs_path", "function", "module", "lineno", "colno", "in_app"]
                  .map((key) => {
                    const frameValue = frame[key];
                    return [
                      key,
                      key === "filename" || key === "abs_path"
                        ? safeFrameLocation(frameValue)
                        : typeof frameValue === "string"
                          ? safeDimension(frameValue, "unknown", 500)
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
          type,
          value: "[Filtered]",
          ...(frames.length ? { stacktrace: { frames } } : {}),
        };
      }),
    };
  }

  const sourceTags = record(source.tags);
  const defaults: Record<(typeof DIAGNOSTIC_TAGS)[number], string> = {
    service: "auditlayer-web",
    surface: "unknown",
    operation: "unhandled",
    error_class: exceptionType,
    status: "failed",
  };
  const tags = Object.fromEntries(
    DIAGNOSTIC_TAGS.map((key) => [key, safeDimension(sourceTags[key], defaults[key])]),
  );
  safe.tags = tags;
  safe.fingerprint = [
    "{{ default }}",
    tags.service,
    tags.surface,
    tags.operation,
    tags.error_class,
  ];
  return safe as T;
}

export type NormalizedSentryIncident = {
  fingerprint: string;
  source: "sentry";
  severity: "debug" | "info" | "warning" | "error" | "fatal";
  environment: string;
  title: string;
  externalUrl: string | null;
  metadata: {
    service: string;
    surface: string;
    operation: string;
    error_class: string;
    status: string;
    release: string;
  };
};

function bounded(value: unknown, max: number, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clean ? clean.slice(0, max) : fallback;
}

function sentryTags(value: unknown): UnknownRecord {
  if (!Array.isArray(value)) return record(value);
  return Object.fromEntries(
    value.slice(0, 100).flatMap((entry) => {
      if (Array.isArray(entry) && typeof entry[0] === "string") {
        return [[entry[0], entry[1]]];
      }
      const tag = record(entry);
      return typeof tag.key === "string" ? [[tag.key, tag.value]] : [];
    }),
  );
}

function safeIdentifier(value: unknown, max = 120): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value).slice(0, max);
  }
  return safeDimension(value, "", max);
}

function safeSentryIssueUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

export function normalizeSentryWebhook(payload: unknown): NormalizedSentryIncident | null {
  const root = record(payload);
  const data = record(root.data);
  const event = record(data.event);
  const isEventAlert = Object.keys(event).length > 0;
  const issue = isEventAlert ? event : record(data.issue);
  const id = safeIdentifier(isEventAlert ? issue.issue_id : issue.id);
  if (!id) return null;

  const projectRecord = record(issue.project);
  const projectSlug = safeDimension(
    projectRecord.slug ?? (typeof issue.project === "string" ? issue.project : undefined),
    "unknown",
    80,
  );
  const projectId = safeIdentifier(projectRecord.id ?? issue.project, 120);
  const tags = sentryTags(issue.tags);
  const serviceFallback =
    projectSlug === "worker"
      ? "auditlayer-worker"
      : projectSlug === "web"
        ? "auditlayer-web"
        : "unknown";
  const incidentProject = isEventAlert
    ? projectId || projectSlug
    : projectId || (serviceFallback === "unknown" ? projectSlug : serviceFallback);
  if (!incidentProject || incidentProject === "unknown") return null;
  const service = safeDimension(tags.service, serviceFallback, 80);
  const surface = safeDimension(tags.surface, isEventAlert ? "unknown" : "sentry_issue", 80);
  const action = safeDimension(root.action, "unknown", 40);
  const operation = safeDimension(
    tags.operation,
    isEventAlert ? "event_alert" : `issue_${action}`,
    120,
  );
  const issueType = issue.issueType === "error" ? "Error" : issue.issueType;
  const errorClass = safeDimension(
    tags.error_class ?? record(issue.metadata).type ?? issueType,
    "Error",
    120,
  );
  const status = safeDimension(tags.status ?? issue.status, "failed", 40);
  const release = safeDimension(tags.release ?? issue.release, "unknown", 200);

  const rawLevel = bounded(issue.level, 20, "error");
  const severity = (["debug", "info", "warning", "error", "fatal"] as const).includes(
    rawLevel as "debug" | "info" | "warning" | "error" | "fatal",
  )
    ? (rawLevel as NormalizedSentryIncident["severity"])
    : "error";
  const externalUrl = safeSentryIssueUrl(issue.web_url ?? issue.permalink);

  return {
    fingerprint: `sentry:${incidentProject}:${id}`.slice(0, 255),
    source: "sentry",
    severity,
    environment: safeDimension(tags.environment ?? issue.environment, "unknown", 80),
    title: `${errorClass} in ${surface}`.slice(0, 500),
    externalUrl,
    metadata: {
      service,
      surface,
      operation,
      error_class: errorClass,
      status,
      release,
    },
  };
}
