/** Keep navigation on this origin, including when browser URL parsing normalizes it. */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (/[\\\u0000-\u001f\u007f]/.test(value) || /%(?:5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return "/dashboard";
  return value;
}
export function loginRecoveryUrl(next: unknown, error?: string, trial?: string): string {
  const query = new URLSearchParams({ next: safeNext(next) });
  if (error) query.set("error", error);
  if (trial) query.set("trial", trial);
  return `/login?${query}`;
}
