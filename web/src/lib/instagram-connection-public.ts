/**
 * Explicit authenticated-browser projections for Instagram connection health.
 * Never replace these with `*`: token columns exist on the same table.
 */
export const INSTAGRAM_CONNECTION_CARD_FIELDS =
  "id,ig_username,followers_count,media_count,account_type,long_lived_expires_at,last_refreshed_at,is_active,connection_status" as const;

export const INSTAGRAM_CONNECTION_HEALTH_FIELDS =
  "ig_username,is_active,long_lived_expires_at,last_refreshed_at,connection_status" as const;

export type InstagramConnectionCard = {
  id: string;
  ig_username: string;
  followers_count: number | null;
  media_count: number | null;
  account_type: string | null;
  long_lived_expires_at: string;
  last_refreshed_at: string | null;
  is_active: boolean;
  connection_status: "connected" | "reconnect_required";
};
