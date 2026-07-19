import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

export interface ReportUrls {
  htmlUrl: string | null;
  pdfUrl: string | null;
}

const SIGNED_TTL_SECONDS = 600;

/**
 * Mint short-lived signed URLs for a ready report's private artifacts.
 * Ownership MUST be verified by the caller before invoking this.
 *
 * URLs are derived from `report_path` on every request. Persisted
 * `audits.report_url` / `audits.pdf_url` values are deprecated and stay NULL.
 */
export async function getReportUrls(audit: {
  id: string;
  report_path: string | null;
}): Promise<ReportUrls> {
  if (!isSupabaseAdminConfigured() || !audit.report_path) {
    return { htmlUrl: null, pdfUrl: null };
  }

  const admin = createAdminClient();
  let htmlUrl: string | null = null;
  let pdfUrl: string | null = null;

  const { data } = await admin.storage
    .from("reports")
    .createSignedUrl(audit.report_path, SIGNED_TTL_SECONDS);
  if (data?.signedUrl) htmlUrl = data.signedUrl;

  const pdfPath = `${audit.id}.pdf`;
  const { data: signed } = await admin.storage
    .from("pdfs")
    .createSignedUrl(pdfPath, SIGNED_TTL_SECONDS);
  if (signed?.signedUrl) pdfUrl = signed.signedUrl;

  return { htmlUrl, pdfUrl };
}
