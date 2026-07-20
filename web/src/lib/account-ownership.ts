export const WORKSPACE_ACCOUNT_STATUSES = ["connected", "managed"] as const;

export type AccountOwnershipStatus =
  (typeof WORKSPACE_ACCOUNT_STATUSES)[number];

export function isWorkspaceAccount(status: string): status is AccountOwnershipStatus {
  return status === "connected" || status === "managed";
}

export function isLiveInstagramConnection(connection: {
  is_active: boolean;
  long_lived_expires_at: string | null;
} | null | undefined): boolean {
  if (!connection?.is_active || !connection.long_lived_expires_at) return false;
  const expiresAt = Date.parse(connection.long_lived_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
