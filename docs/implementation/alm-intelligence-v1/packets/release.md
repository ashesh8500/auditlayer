# Independent integration and release packet

Run only after kernel, runtime, and product branches complete. Read their checkpoints and manifests; do not replay full worker transcripts.

Integrate the three branches, reconcile contracts, regenerate Supabase types exactly once, run full worker/static/security tests and web typecheck/lint/build/browser tests exactly once, validate migrations/RLS, perform adversarial runtime and cross-tenant probes, create a Vercel preview, and record rollback handles. Apply migrations and roll workers one at a time only after review. Production web promotion requires explicit Ashesh approval. Produce a release checkpoint distinguishing local, committed, origin, preview, schema-live, worker-canary, and production states.
