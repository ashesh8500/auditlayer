import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

export interface ReportUrls {
  htmlUrl: string | null;
  pdfUrl: string | null;
}

const SIGNED_TTL_SECONDS = 600; // 10 minutes — short-lived per the contract.

/**
 * Mint short-lived signed URLs for a ready report's HTML + PDF artifacts.
 * Ownership MUST be verified by the caller before invoking this. Uses the
 * service-role client to sign objects in the private `reports`/`pdfs` buckets.
 *
 * URLs are derived from `report_path` on every request. Persisted
 * `audits.report_url` / `audits.pdf_url` values are never used — those
 * columns are deprecated and kept NULL.
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

  // Worker stores PDFs at `{audit_id}.pdf` in the pdfs bucket root.
  const pdfPath = `${audit.id}.pdf`;
  const { data: signed } = await admin.storage
    .from("pdfs")
    .createSignedUrl(pdfPath, SIGNED_TTL_SECONDS);
  if (signed?.signedUrl) pdfUrl = signed.signedUrl;

  return { htmlUrl, pdfUrl };
}
