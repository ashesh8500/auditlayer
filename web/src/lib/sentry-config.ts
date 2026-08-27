export type SentryRuntimeIdentityInput = {
  dsn?: string;
  environment?: string;
  release?: string;
};

export type SentryRuntimeIdentity = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  release: string | undefined;
};

const ENVIRONMENTS = new Set(["production", "preview", "development", "test"]);
const isExactRelease = (value: string | undefined): value is string =>
  Boolean(value && /^[a-f0-9]{40}$/i.test(value));

/** Resolve the non-secret identity shared by runtime events and source maps. */
export function resolveSentryRuntimeIdentity(
  input: SentryRuntimeIdentityInput,
): SentryRuntimeIdentity {
  const dsn = input.dsn?.trim() || undefined;
  const release = input.release?.trim();
  const exactRelease = isExactRelease(release) ? release : undefined;
  const requestedEnvironment = input.environment?.trim().toLowerCase() ?? "development";
  const environment = ENVIRONMENTS.has(requestedEnvironment)
    ? requestedEnvironment
    : "development";
  return {
    dsn,
    enabled: Boolean(dsn && exactRelease),
    environment,
    release: exactRelease,
  };
}

export function isSentrySourceMapUploadConfigured(input: {
  authToken?: string;
  org?: string;
  project?: string;
  release?: string;
}): boolean {
  return Boolean(
    input.authToken?.trim() &&
      input.org?.trim() &&
      input.project?.trim() &&
      isExactRelease(input.release?.trim()),
  );
}
