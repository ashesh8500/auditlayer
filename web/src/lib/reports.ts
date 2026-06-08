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
 */
export async function getReportUrls(audit: {
  id: string;
  report_path: string | null;
  report_url: string | null;
  pdf_url: string | null;
}): Promise<ReportUrls> {
  if (!isSupabaseAdminConfigured()) {
    return { htmlUrl: audit.report_url, pdfUrl: audit.pdf_url };
  }

  const admin = createAdminClient();
  let htmlUrl: string | null = audit.report_url;
  let pdfUrl: string | null = audit.pdf_url;

  if (audit.report_path) {
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
  }

  return { htmlUrl, pdfUrl };
}
