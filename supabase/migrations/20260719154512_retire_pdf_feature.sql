-- Retire PDF export as a product feature. Reports are canonical self-contained
-- HTML artifacts; legacy objects in the private `pdfs` bucket are intentionally
-- left untouched for rollback safety but no application path can create/read them.

drop function if exists public.claim_next_pdf(text);
drop function if exists public.mark_pdf_attempt_failed(uuid, text, int);
drop function if exists public.reap_stale_pdf_claims(int, int);

drop index if exists public.idx_audits_pdf_status;

alter table public.audits
  drop column if exists pdf_requested,
  drop column if exists pdf_status,
  drop column if exists pdf_path,
  drop column if exists pdf_attempt_count,
  drop column if exists pdf_claimed_at,
  drop column if exists pdf_claimed_by,
  drop column if exists pdf_last_failed_at,
  drop column if exists pdf_last_error,
  drop column if exists pdf_url;
