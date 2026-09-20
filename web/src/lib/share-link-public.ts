export const SHARE_LINK_PUBLIC_COLUMNS = "id,audit_id,token,mode,email,verified_at,created_by,created_at,expires_at,revoked_at,view_count" as const;
export interface ShareLinkPublic {
  id: string; audit_id: string; token: string; mode: "public" | "email";
  email: string | null; verified_at: string | null; created_by: string;
  created_at: string; expires_at: string | null; revoked_at: string | null; view_count: number;
}
/** Runtime projection, not a cast: future private fields cannot cross the client boundary. */
export function projectShareLink(row: ShareLinkPublic): ShareLinkPublic {
  return { id: row.id, audit_id: row.audit_id, token: row.token, mode: row.mode,
    email: row.email, verified_at: row.verified_at, created_by: row.created_by,
    created_at: row.created_at, expires_at: row.expires_at, revoked_at: row.revoked_at, view_count: row.view_count };
}
export function shareLinkStatus(link: Pick<ShareLinkPublic, "expires_at" | "revoked_at">, now = Date.now()): "active" | "expired" | "revoked" {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && (!Number.isFinite(Date.parse(link.expires_at)) || Date.parse(link.expires_at) <= now)) return "expired";
  return "active";
}
