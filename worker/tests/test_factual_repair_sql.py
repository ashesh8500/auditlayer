"""Real disposable SQL authorization/deletion path, synthetic connected data."""
import json
import uuid
from concurrent.futures import Future
from types import SimpleNamespace
import pytest
from test_runtime_sql_integration import db, Client, literal  # noqa: F401 - fixture
from test_factual_repair import connected_case, analysis_form
from test_generation_runtime import _Client, _generator
from auditlayer_worker.openrouter import MODEL
from auditlayer_worker.generation import GenerationStageError
from auditlayer_worker.pipeline import _persist_admitted_evidence


def test_connected_provenance_uses_canonical_purge_and_owner_fence(db, tmp_path):
    owner, aid = str(uuid.uuid4()), str(uuid.uuid4())
    db.sql(f"insert into auth.users(id,email) values('{owner}','{owner}@example.invalid')")
    connection = json.loads(db.sql(f"select to_jsonb(x) from public.persist_instagram_connection('{owner}',990099::bigint,'example','offline-fixture',now()+interval '60 days','CREATOR',4321::bigint,8::bigint,'instagram') x"))
    cid, account = connection['connection_id'], connection['account_id']
    version = db.sql(f"select credential_version from instagram_connections where id='{cid}'")
    db.sql(f"insert into audits(id,user_id,handle,platform,account_id) values('{aid}','{owner}','example','instagram','{account}')")
    audit, metrics = connected_case()
    audit.id, audit.user_id = aid, owner
    metrics._credential_fence = (cid, version)
    future = Future()
    future.set_result(metrics)
    transport = _Client([json.dumps(analysis_form())])
    transport.settings = SimpleNamespace(output_dir=tmp_path)
    gen = _generator(transport)
    gen.model = MODEL
    gateway = SimpleNamespace(client=Client(db))
    gen.evidence_recorder = lambda payload: _persist_admitted_evidence(gateway, audit, future, payload)
    result = gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    stored = db.sql(f"select research_cache from audits where id='{aid}'")
    assert json.loads(stored) == json.loads(result.research_cache)
    assert json.loads(stored)['connected']['binding']['credential_version'] == version
    assert not list(tmp_path.rglob('*.json'))
    # This is the existing disconnect lifecycle, not a new local cleanup service.
    db.sql(f"select disconnect_instagram_connection('{owner}','{cid}')")
    assert db.sql(f"select research_cache='' from audits where id='{aid}'") == 't'
    assert db.sql(f"select research_snapshot is null from accounts where id='{account}'") == 't'
    for stale_owner in (owner, str(uuid.uuid4())):
        audit.user_id = stale_owner
        before = len(transport.calls)
        with pytest.raises(GenerationStageError) as caught:
            gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
        assert caught.value.error_code == 'evidence_persistence_failed'
        assert len(transport.calls) == before
        assert not list(tmp_path.rglob('*.json'))
        assert db.sql(f"select research_cache='' from audits where id='{aid}'") == 't'
    # Canonical audit/cache follows the existing owner-deletion cascade.
    db.sql(f"delete from auth.users where id='{owner}'")
    assert db.sql(f"select count(*) from audits where id='{aid}'") == '0'
