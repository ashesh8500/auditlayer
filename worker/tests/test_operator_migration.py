from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20260721170127_alm_operator_control_plane.sql"
)


def sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_operator_control_plane_is_additive_and_admin_only() -> None:
    text = sql()
    for table in (
        "operator_threads",
        "operator_messages",
        "operator_jobs",
        "operator_incidents",
    ):
        assert f"create table if not exists public.{table}" in text
        assert f"alter table public.{table} enable row level security" in text
        assert f"{table}_admin_all" in text
    assert text.count("using (public.is_admin())") >= 4
    assert text.count("with check (public.is_admin())") >= 4
    assert "revoke all on public.operator_threads from anon" in text
    assert "revoke all on public.operator_incidents from anon" in text


def test_operator_schema_has_bounded_statuses_and_content() -> None:
    text = sql()
    assert "char_length(content) between 1 and 12000" in text
    assert "char_length(instruction) between 1 and 12000" in text
    assert "kind in ('discussion', 'refinement', 'engineering', 'operations')" in text
    assert "status in ('queued', 'running', 'completed', 'failed', 'cancelled')" in text
    assert "severity in ('debug', 'info', 'warning', 'error', 'fatal')" in text


def test_operator_schema_records_canonical_bundle_version() -> None:
    text = sql()
    assert "add column if not exists agent_bundle_version text" in text
    assert "inherit_report_agent_bundle_version" in text


def test_sentry_incident_ingest_is_atomic_and_service_role_only() -> None:
    text = sql()
    assert "function public.ingest_operator_incident(" in text
    assert "on conflict (fingerprint) do update" in text
    assert "event_count = public.operator_incidents.event_count + 1" in text
    assert "revoke all on function public.ingest_operator_incident" in text
    assert "grant execute on function public.ingest_operator_incident" in text
    assert "to service_role" in text
