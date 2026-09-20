#!/usr/bin/env python3
"""Offline real-Postgres workflow tests. Own container only, never a URL/env DB."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
NAME = 'alm-brand-workflow-' + uuid.uuid4().hex[:12]
IMAGE = 'pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b'

def run(*args, input=None):
    return subprocess.run(args, input=input, text=True, capture_output=True)

def sql(q, fail=False):
    result = run('docker', 'exec', '-i', NAME, 'psql', '-U', 'postgres', '-d', 'workflow_test', '-XAtq', '-v', 'ON_ERROR_STOP=1', input=q)
    if fail:
        assert result.returncode, 'unexpected success: ' + q
        return result.stderr
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()

def rpc(name, p, fail=False):
    return sql("set role service_role; select brand_workflow_" + name + "('" + json.dumps(p).replace("'", "''") + "'::jsonb)", fail)

def main():
    try:
        result = run('docker', 'run', '--rm', '-d', '--name', NAME, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=workflow_test', IMAGE)
        assert result.returncode == 0, result.stderr
        for _ in range(100):
            if run('docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres').returncode == 0:
                break
            time.sleep(.1)
        sql((ROOT / 'supabase/tests/commercial-local-bootstrap.sql').read_text())
        for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            sql(path.read_text())
        owner, foreign, subject = [str(uuid.uuid4()) for _ in range(3)]
        sql(f"insert into auth.users(id,email) values('{owner}','workflow@example.invalid'),('{foreign}','foreign@example.invalid'); insert into subjects(id,user_id,name) values('{subject}','{owner}','Brand');")
        p = dict(owner_id=owner, workflow_id=str(uuid.uuid4()), version_id=str(uuid.uuid4()), subject_id=subject,
                 objective='Review changes and propose cited priorities', timezone='America/New_York', local_time='09:00', weekday=None,
                 model=dict(provider='offline', model='test', model_version='1', data_route='https://example.invalid'), rate_card_version='offline.v1',
                 method_version='brand-update.v1', allowed_tools=[], customer_max_microusd=100, upstream_max_microusd=100,
                 recipients=[foreign])
        assert rpc('save', p) == p['workflow_id']
        assert rpc('save', p) == p['workflow_id']
        assert sql('select status from brand_workflows') == 'draft'
        assert sql('select count(*) from brand_workflow_grants') == '0'
        assert 'immutable' in rpc('save', {**p, 'objective':'Changed'}, True)
        assert 'not_owned' in rpc('save', {**p,'owner_id':foreign,'workflow_id':str(uuid.uuid4()),'version_id':str(uuid.uuid4())}, True)
        sql('set role authenticated; select brand_workflow_save(\'{}\'::jsonb)', True)
        assert sql(f"set role authenticated; set request.jwt.claim.sub='{foreign}'; select count(*) from brand_workflows") == '0'
        sql("update brand_workflow_versions set objective='changed'", True)
        print('PASS immutable save, independent permissions, tenant isolation')
        base = dict(owner_id=owner, workflow_id=p['workflow_id'], version_id=p['version_id'])
        assert 'permission_required' in rpc('control',{**base,'command':'activate'},True)
        rpc('grant',{**base,'kind':'run','recipient_id':owner,'granted':True})
        assert sql('select status from brand_workflows') == 'draft'  # trial/run approval is not schedule consent
        assert 'permission_required' in rpc('control',{**base,'command':'activate'},True)
        rpc('grant',{**base,'kind':'schedule','recipient_id':owner,'granted':True})
        rpc('control',{**base,'command':'activate'})
        assert sql('select status from brand_workflows') == 'active'
        assert sql("select count(*) from brand_workflow_grants where kind='delivery'") == '0'
        # DST: skip the nonexistent spring time; first overlap instant only.
        assert sql("select brand_workflow_next('America/New_York','02:30',null,'2026-03-08 05:00Z')") == '2026-03-09 06:30:00+00'
        assert sql("select brand_workflow_next('America/New_York','01:30',null,'2026-11-01 04:00Z')") == '2026-11-01 05:30:00+00'
        assert sql("select brand_workflow_next('America/New_York','01:30',null,'2026-11-01 05:31Z')") == '2026-11-02 06:30:00+00'
        rpc('control',{**base,'command':'pause'})
        assert sql('select status from brand_workflows') == 'paused'
        rpc('grant',{**base,'kind':'run','recipient_id':owner,'granted':False})
        assert 'permission_required' in rpc('control',{**base,'command':'activate'},True)
        print('PASS independent run/schedule/delivery grants, pause/revoke, DST policy')
        ctx1,ctx2,proposal = [str(uuid.uuid4()) for _ in range(3)]
        sql(f"insert into living_brief_versions(id,subject_id,version,confirmed) values('{ctx1}','{subject}',1,true),('{proposal}','{subject}',2,false)")
        rpc('grant',{**base,'kind':'run','recipient_id':owner,'granted':True})
        rpc('control',{**base,'command':'activate'})
        sql(f"update brand_workflows set next_at=clock_timestamp()-interval '1 second' where id='{p['workflow_id']}'")
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            list(pool.map(lambda _:rpc('tick',{'limit':10}),range(2)))
        assert sql('select count(*) from brand_workflow_occurrences') == '1'
        occurrence=sql('select id from brand_workflow_occurrences')
        assert sql('select context_version_id from brand_workflow_occurrences') == ctx1
        assert sql('select pause_reason from brand_workflows') == 'execution_unavailable'
        assert 'permission_denied' in rpc('assert_dispatch',dict(owner_id=owner,occurrence_id=occurrence),True)
        rpc('control',{**base,'command':'activate'})
        assert json.loads(rpc('assert_dispatch',dict(owner_id=owner,occurrence_id=occurrence)))['context_version_id'] == ctx1
        rpc('grant',{**base,'kind':'schedule','recipient_id':owner,'granted':False})
        assert 'permission_denied' in rpc('assert_dispatch',dict(owner_id=owner,occurrence_id=occurrence),True)
        rpc('grant',{**base,'kind':'schedule','recipient_id':owner,'granted':True})
        rpc('control',{**base,'command':'activate'})
        sql(f"insert into living_brief_versions(id,subject_id,version,confirmed) values('{ctx2}','{subject}',3,true); update brand_workflows set next_at=clock_timestamp()-interval '1 second' where id='{p['workflow_id']}'")
        rpc('tick',{'limit':10})
        assert sql('select context_version_id from brand_workflow_occurrences order by created_at desc limit 1') == ctx2
        assert sql(f"select context_version_id from brand_workflow_occurrences where id='{occurrence}'") == ctx1
        rpc('control',{**base,'command':'activate'})
        sql(f"update brand_workflows set next_at=clock_timestamp()-interval '10 days' where id='{p['workflow_id']}'")
        rpc('tick',{'limit':10})
        assert sql('select count(*) from brand_workflow_occurrences') == '2'
        rpc('control',{**base,'command':'cancel'})
        rpc('tick',{'limit':10})
        assert sql('select count(*) from brand_workflow_occurrences') == '2'
        print('PASS duplicate scheduler, confirmed pin, revoke after queue, no catch-up, cancellation')
        # Durable artifact fixture reuses canonical report/run tables; no renderer/provider.
        p={**p,'workflow_id':str(uuid.uuid4()),'version_id':str(uuid.uuid4())}
        rpc('save',p)
        base={**base,'workflow_id':p['workflow_id'],'version_id':p['version_id']}
        for kind,recipient in [('run',owner),('schedule',owner),('delivery',foreign)]:
            rpc('grant',{**base,'kind':kind,'recipient_id':recipient,'granted':True})
        rpc('control',{**base,'command':'activate'})
        audit,run_id,artifact,occurrence=[str(uuid.uuid4()) for _ in range(4)]
        sql(f"""insert into audits(id,user_id,handle,platform,status) values('{audit}','{owner}','brand','instagram','ready');
        insert into evidence_snapshots(id,subject_id) values('{run_id}','{subject}');
        insert into intelligence_runs(id,subject_id,brief_version,evidence_snapshot_id,methodology_version,expertise_pack_version,prompt_version,model_config_hash,status)
        values('{run_id}','{subject}',3,'{run_id}','test','test','test','test','completed');
        insert into audit_report_versions(id,audit_id,version,report_path,intelligence_run_id) values('{artifact}','{audit}',1,'private/test.html','{run_id}');
        insert into brand_workflow_occurrences(id,workflow_id,version_id,owner_id,subject_id,context_version_id,scheduled_at,state,audit_id,intelligence_run_id)
        values('{occurrence}','{p['workflow_id']}','{p['version_id']}','{owner}','{subject}','{ctx2}',clock_timestamp(),'queued','{audit}','{run_id}');""")
        assert rpc('collect_reviews',{'limit':10}) == '1'
        review=dict(owner_id=owner,occurrence_id=occurrence,artifact_version_id=artifact,recipients=[foreign])
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _:rpc('approve',review),range(2)))
        assert results[0]==results[1]
        assert sql('select count(*) from brand_workflow_outbox') == '1'
        delivery=sql('select id from brand_workflow_outbox')
        assert 'artifact_mismatch' in rpc('approve',{**review,'artifact_version_id':str(uuid.uuid4())},True)
        rpc('grant',{**base,'kind':'delivery','recipient_id':foreign,'granted':False})
        assert 'permission_denied' in rpc('send_claim',dict(delivery_id=delivery),True)
        assert 'permission_denied' in rpc('artifact_access',dict(delivery_id=delivery,viewer_id=foreign),True)
        rpc('grant',{**base,'kind':'delivery','recipient_id':foreign,'granted':True})
        rpc('control',{**base,'command':'activate'})
        claim=json.loads(rpc('send_claim',dict(delivery_id=delivery)))
        assert claim['recipient_id']==foreign and claim['artifact_version_id']==artifact
        assert 'already_dispatched' in rpc('send_claim',dict(delivery_id=delivery),True)
        # Ambiguous outcome is never made eligible again.
        rpc('send_result',dict(delivery_id=delivery,status='reconciling',provider_receipt=None))
        assert 'already_dispatched' in rpc('send_claim',dict(delivery_id=delivery),True)
        sent=dict(delivery_id=delivery,status='sent',provider_receipt='offline-accepted-1')
        assert rpc('send_result',sent)==rpc('send_result',sent)
        assert 'receipt_mismatch' in rpc('send_result',{**sent,'provider_receipt':'different'},True)
        assert json.loads(rpc('artifact_access',dict(delivery_id=delivery,viewer_id=foreign)))['report_path']=='private/test.html'
        assert 'permission_denied' in rpc('artifact_access',dict(delivery_id=delivery,viewer_id=str(uuid.uuid4())),True)
        rpc('control',{**base,'command':'pause'})
        assert 'permission_denied' in rpc('artifact_access',dict(delivery_id=delivery,viewer_id=foreign),True)
        print('PASS exact review approval, one outbox/receipt, revoked send/link, ambiguous no retry')
        # Editing a workflow creates a new immutable version; history keeps the old one.
        edited={**p,'version_id':str(uuid.uuid4()),'objective':'Review changes with a new objective'}
        rpc('save',edited)
        assert sql(f"select count(*) from brand_workflow_versions where workflow_id='{p['workflow_id']}'") == '2'
        assert sql(f"select objective from brand_workflow_versions where id='{p['version_id']}'") == p['objective']
        assert sql(f"select version_id from brand_workflow_occurrences where id='{occurrence}'") == p['version_id']
        assert sql(f"select status from brand_workflows where id='{p['workflow_id']}'") == 'draft'
        resource=json.loads(rpc('resource',{'owner_id':owner}))
        assert resource['ownerId']==owner and len(resource['workflows'])==2
        assert resource['workflows'][0]['model']==p['model']
        assert 'provider_receipt' not in json.dumps(resource)
        assert 'report_path' not in json.dumps(resource)
        assert json.loads(rpc('resource',{'owner_id':foreign}))['workflows']==[]
        print('PASS owner resource is read-only, excludes provider/storage secrets')
    finally:
        run('docker', 'rm', '-f', NAME)

if __name__ == '__main__':
    main()
