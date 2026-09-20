from auditlayer_worker import release_preflight as preflight


def test_required_capabilities_include_real_current_write_boundaries():
    assert {'finalize_initial_report', 'finalize_refinement_report', 'submit_entitled_audit_batch',
            'write_instagram_worker_state', 'admin_assign_access_delta', 'admin_finalize_manual_report',
            'sweep_stale_refinements', 'pause_worker_claims', 'resume_worker_claims',
            'worker_drain_status'} <= preflight._REQUIRED_RPCS


def test_preflight_rejects_old_rpc_signature_without_calling_it():
    assert hasattr(preflight, '_rpc_signature_errors')
    schema = {'paths': {'/rpc/write_instagram_worker_state': {'post': {'parameters': [
        {'in': 'body', 'schema': {'properties': {'p_user_id': {'type': 'string'}}}}
    ]}}}}
    errors = preflight._rpc_signature_errors(schema)
    assert any('write_instagram_worker_state' in error for error in errors)


def test_preflight_signatures_match_current_migrations():
    import re
    from pathlib import Path
    current = {}
    root = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
    for migration in sorted(root.glob("*.sql")):
        for match in re.finditer(r"create\s+(?:or replace\s+)?function\s+public\.(\w+)\s*\((.*?)\)\s*returns", migration.read_text(), re.I | re.S):
            if match[1] in preflight._REQUIRED_RPCS:
                current[match[1]] = tuple(arg.strip().split()[0] for arg in match[2].split(",") if arg.strip())
    assert current == preflight._REQUIRED_RPC_ARGUMENTS


def test_preflight_accepts_exact_signatures():
    assert hasattr(preflight, '_REQUIRED_RPC_ARGUMENTS')
    schema = {'paths': {f'/rpc/{name}': {'post': {'parameters': [{'in': 'body', 'schema': {
        'properties': {arg: {'type': 'string'} for arg in args}}}]}} for name, args in preflight._REQUIRED_RPC_ARGUMENTS.items()}}
    assert preflight._rpc_signature_errors(schema) == []
