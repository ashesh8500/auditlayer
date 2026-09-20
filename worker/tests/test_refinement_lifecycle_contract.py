from pathlib import Path


def test_refinement_migration_fences_base_and_expired_leases():
    sql = (Path(__file__).parents[2] / 'supabase/migrations/20260919204102_refinement_lifecycle.sql').read_text()
    for contract in ['base_report_version', 'lease_expires_at', 'sweep_stale_refinements', 'refinement_base_changed', 'source_refinement_id', 'for update of a skip locked']:
        assert contract in sql
    assert "status = 'queued'" in sql
    assert 'to service_role' in sql
