import type { AuditAllowance } from "@/lib/allowance";
import type { Profile } from "@/lib/auth";
import type { InstagramConnectionCard } from "@/lib/instagram-connection-public";
export type ReportRow = {
  id: string;
  handle: string;
  platform: string;
  status: string;
  goal: string | null;
  milestone_label: string | null;
  created_at: string | null;
  retry_count: number | null;
  last_failed_at: string | null;
  report_version: number | null;
};
export type ReportsDTO = {
  ownerId: string; fetchedAt: string;
  profile: Pick<Profile, "full_name" | "plan" | "role" | "gifted_audits" | "subscription_status"> & { hasBilling: boolean };
  audits: ReportRow[]; count: number; usage: number; allowance: AuditAllowance;
};
export type ConnectionsDTO = { ownerId: string; fetchedAt: string; connections: InstagramConnectionCard[]; count: number; target: InstagramConnectionCard | null };
