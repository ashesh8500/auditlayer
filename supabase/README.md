# supabase/ — AuditLayer control plane

Supabase is the control plane for AuditLayer v2: Postgres (RLS), Auth, Storage,
Realtime.

**Live project:** `eamnfmtkvglbnugzmotw` (auditlayer, Singapore)  
**Handoff:** [`docs/agent-handoff.md`](../docs/agent-handoff.md)  
**Schema contract:** [`docs/architecture-contract.md`](../docs/architecture-contract.md)

## Layout

```
supabase/
  config.toml              # local CLI config (project_id = "auditlayer")
  migrations/
    0001_init.sql          # tables, indexes, triggers, profile auto-provisioning
    0002_rls.sql           # row level security policies + helper functions
    0003_storage.sql       # private reports/pdfs buckets + object policies
  seed.sql                 # app_settings row + founder-admin promotion notes
```

## Quick commands

```bash
make supabase-push      # from repo root — apply migrations
make supabase-types     # regenerate web/src/lib/supabase/types.ts
npx supabase@latest config push --yes   # auth + email templates (SMTP on free tier)
```

CLI via `npx supabase@latest` — no global install required.

## Magic link email template

File: `templates/magic_link.html` — uses `token_hash` for SSR (works from mail apps).

Free-tier projects cannot push template changes without **custom SMTP** in the dashboard.
Alternatives:

1. **Resend on Vercel** — app sends email itself (`web/src/lib/auth/magic-link-email.ts`).
2. **Dashboard paste** — Auth → Email Templates → Magic Link → paste template HTML.
3. **Custom SMTP** in Supabase → then `npx supabase@latest config push --yes`.

## Provisioning the live project (commands the user must run)

These steps require the founder's Supabase account and are intentionally **not**
run by the foundation agent. Run them once to create and populate the project.

1. **Create the project** in the Supabase dashboard (https://supabase.com/dashboard).
   Note the **project ref** (the `<ref>` in `https://<ref>.supabase.co`) and the
   database password.

2. **Log in and link** the local CLI to the remote project:

   ```bash
   cd /Users/asheshkaji/projects/auditlayer
   pnpm dlx supabase@latest login          # opens browser for an access token
   pnpm dlx supabase@latest link --project-ref <project-ref>
   ```

3. **Push the migrations** to create the schema, RLS, and storage buckets:

   ```bash
   pnpm dlx supabase@latest db push
   ```

4. **Seed** the `app_settings` row (and review founder-admin notes). `db push`
   does not run `seed.sql` against remote; apply it explicitly:

   ```bash
   pnpm dlx supabase@latest db push --include-seed
   # or run supabase/seed.sql in the dashboard SQL editor
   ```

5. **Collect the API keys** from Project Settings → API and place them in
   `web/.env.local` (see `web/.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the `anon` public key
   - `SUPABASE_SERVICE_ROLE_KEY` = the `service_role` secret key (server-only;
     also used by the Python Hermes worker)

6. **Promote the founders to admin** after they have each signed in once
   (profiles are auto-created on first sign-in). In the dashboard SQL editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where email in ('ashesh@asheshkaji.com', 'narin@auditlayer.com');
   ```

## Local development (optional)

Requires Docker. Spins up the full stack locally and applies migrations + seed:

```bash
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset     # re-applies migrations/ then seed.sql
```

## Regenerating TypeScript types

After schema changes, regenerate the typed client used by `web/`:

```bash
pnpm dlx supabase@latest gen types typescript --linked \
  > web/src/lib/supabase/types.ts
```

## Conventions

- Migrations are **idempotent** (`create ... if not exists`, `drop policy if
  exists`, `on conflict do nothing/update`) so they are safe to re-run.
- The Python Hermes worker and trusted Next.js server actions use the
  **service_role** key, which bypasses RLS. Everything reachable from the
  browser uses the **anon** key and is constrained by the policies in
  `0002_rls.sql` and `0003_storage.sql`.
- Storage object paths follow `<bucket>/<audit_id>/<filename>`; the first path
  segment is the owning audit id used for ownership checks.
