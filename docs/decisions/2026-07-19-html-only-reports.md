# Decision: HTML-only report delivery

**Date:** 2026-07-19  
**Status:** Accepted

AuditLayerMedia reports are delivered as canonical, self-contained HTML. PDF generation is not a product feature or roadmap commitment.

## Why

- PDF export serves a small minority of users.
- Chromium rendering added a separate worker, queue, retry lifecycle, memory pressure, storage, monitoring, and UI state for little product value.
- The HTML artifact is the actual product: readable in the immersive viewer, shareable through gated links, downloadable, interactive, and printable from the browser when a client needs paper output.

## Product behavior

- Ready reports expose **Read full report**, sharing, refinement, and **Download report** for the HTML artifact.
- No intake option, loading state, download route, worker, queue, release gate, or monitoring target exists for PDF.
- Historical private PDF objects are retained temporarily for rollback safety but have no application read/write path.

## Scoring and progression shipped with this decision

The eight Standard/Extended score dimensions now have a versioned local weight contract. The model supplies evidence-backed dimension scores; local code computes the weighted overall score. The locally computed score is written to `account_progression` and shown in account overview/history UI.
