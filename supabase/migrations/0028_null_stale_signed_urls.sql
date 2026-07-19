-- Null out stale persisted signed URLs on audits.
--
-- reports/pdfs live in private Storage buckets; the worker used to persist
-- long-lived signed URLs into audits.report_url / audits.pdf_url. Those URLs
-- are now never written (only report_path / pdf_path are stored) and the web
-- app serves artifacts via same-origin proxies that re-download from the
-- stored path. Any value still present in these columns is a stale,
-- possibly year-long-lived URL and must be discarded.
--
-- Idempotent: safe to re-run.
--
-- Rollback: no-op by design — the nulled values were expiring signed URLs
-- and are unrecoverable. Re-deriving access is done per request from
-- report_path / pdf_path, so no data is lost.
update public.audits
set report_url = null, pdf_url = null
where report_url is not null or pdf_url is not null;
