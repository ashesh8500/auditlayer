# Release policy

1. Reproduce or specify the change with a failing test.
2. Run targeted tests and the full repository gate.
3. Apply additive database migrations before fail-closed worker code.
4. Deploy web and worker separately with rollback points.
5. Verify public health, both worker health endpoints, stable restart counts, and fresh logs.
6. Production mutations require Ashesh approval. Report methodology or presentation changes require Narin quality approval.
7. Durable release evidence belongs in Git/database records, not profile memory.
