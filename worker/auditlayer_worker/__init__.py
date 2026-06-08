"""AuditLayer Hermes worker package.

Standalone service that claims queued audits from Supabase, runs Hermes
generation with guardrails, streams a granular event timeline, and uploads the
self-contained HTML + PDF report. Includes a Supabase-free demo mode.
"""

__version__ = "0.1.0"
