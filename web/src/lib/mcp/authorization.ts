export function parseAuthorizationId(value: unknown): string {
  const authorizationId = typeof value === "string" ? value : "";
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(authorizationId)) {
    throw new Error("Invalid authorization request");
  }
  return authorizationId;
}
