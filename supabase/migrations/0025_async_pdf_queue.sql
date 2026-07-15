-- Add async PDF queue columns. The worker uploads HTML immediately and
-- marks the audit ready. A separate lightweight PDF worker claims rows
-- with pdf_status='pending', renders the Chromium PDF, and uploads it.
-- The frontend shows a spinner until pdf_status='ready'.
alter table public.audits add column if not exists pdf_status text
  not null default 'pending'
  check (pdf_status in ('pending','generating','ready','failed'));

alter table public.audits add column if not exists pdf_path text;

create index if not exists idx_audits_pdf_status
  on public.audits (pdf_status)
  where pdf_status = 'pending';
