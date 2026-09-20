"""Offline canonical pipeline smoke against the caller's disposable database.
Only external generation/storage are fixtures; no gate is patched to succeed.
This proves the minimal worker bridge contract, NOT production qualification.
Run via ALM_TEST_WORKER_TRACER=1 with the worker dependency environment.
"""
import dataclasses,json,os,pathlib,sys,tempfile,time
from types import SimpleNamespace
from unittest.mock import patch

def smoke(sql,rpc,root,owner,request):
 sys.path.insert(0,str(root/'worker'))
 from auditlayer_worker.config import WorkerSettings
 from auditlayer_worker.core import AuditRecord
 from auditlayer_worker.generation import MockReportGenerator,GenerationResult
 from auditlayer_worker.pipeline import GenerationPipeline,PrintEventSink
 from auditlayer_worker.model_execution.containment import one_call
 # Explicitly TEST ONLY. Never written to seed or any external database.
 sql("update commercial_runtime_catalog set max_input_tokens=20000,max_output_tokens=24000")
 quote=rpc('commercial_quote',request)
 aid=rpc('commercial_submit',{'owner_id':owner,'quote_id':quote['id'],'consent':True})
 row=json.loads(sql("set role service_role;select claim_next_queued('test-worker')"))
 assert row['id']==aid
 bound=rpc('commercial_execution_claim',{'audit_id':aid,'worker_id':'test-worker','model':'deepseek/deepseek-v4-flash-0731'})
 record=AuditRecord.from_row(row)
 class LocalModel:
  def complete(self,req,model):
   return dataclasses.asdict(MockReportGenerator().generate(record,lambda *_:None))
 class BoundedGenerator:
  model='mock'
  def generate(self,*args,**kwargs):
   result=one_call(LocalModel(),SimpleNamespace(model='mock'),time.monotonic()+5)
   assert 'raw' in result,result
   raw=result['raw']
   assert raw['tokens_in']<=bound['max_input_tokens'] and raw['tokens_out']<=bound['max_output_tokens']
   return GenerationResult(**raw)
 with tempfile.TemporaryDirectory(prefix='commercial-tracer-',dir=os.environ['TMPDIR']) as tmp:
  base=pathlib.Path(tmp)
  with patch('auditlayer_worker.config.load_env_files'),patch.dict(os.environ,{},clear=True):
   settings=dataclasses.replace(WorkerSettings.from_env(),generator='mock',alm_accounts_root=str(base/'accounts'),alm_profile_bundle_root=str(root/'hermes-profile'),output_dir=base,price_in_per_mtok=1,price_out_per_mtok=2)
  def literal(value):return 'null' if value is None else "'"+str(value).replace("'","''")+"'"
  class EmptyQuery:
   def select(self,*args):return self
   def execute(self):return SimpleNamespace(data=[])
  class Gateway:
   client=SimpleNamespace(table=lambda *_:EmptyQuery())
   def get_instagram_token(self,*args,**kwargs):return None
   def get_account(self,*args,**kwargs):return None
   def upload_report(self,audit_id,html,version=None):
    path=base/f'{audit_id}.html';path.write_text(html);assert path.stat().st_size>1000
    return f'{audit_id}/v1.html',''
   def update_audit(self,audit_id,**fields):
    # Transport adapter only. Canonical finalization owns immutable report state.
    if 'status' in fields:sql(f"update audits set status={literal(fields['status'])} where id='{audit_id}'")
   def finalize_initial_report(self,**fields):
    args=','.join(literal(fields.get(k)) for k in ['audit_id','delivery_status','report_path','prompt_version','template_version','agent_bundle_version','intelligence_run_id'])
    return sql('set role service_role;select finalize_initial_report('+args+')')
  # The optional cache transport has no records in this isolated database.
  with patch('auditlayer_worker.pipeline._check_account_cache',return_value=None):
   summary=GenerationPipeline(settings,BoundedGenerator()).run(record,PrintEventSink(),gateway=Gateway(),cost_cap_usd=bound['upstream_microusd']/1000000)
  assert summary.status in ('ready','needs_review'),summary
  assert sql(f"select count(*) from audit_report_versions where audit_id='{aid}'")=='1'
  # The fixture has estimated token usage, not provider-reported liability.
  # Never label mock cost as measured. This offline exercise debits zero.
  finish={'audit_id':aid,'worker_id':'test-worker','outcome':'success' if summary.status=='ready' else 'failure','actual_upstream_microusd':None,'customer_debit_microusd':0,'receipt_id':'offline-pipeline:'+aid}
  rpc('commercial_execution_finish',finish)
  assert sql(f"select terminal_payload->>'receipt_id' from workspace_credit_reservations where id='{quote['id']}'")==finish['receipt_id']
  print('PASS canonical ordinary claim -> real bounded child -> unchanged quality gate -> immutable local artifact -> SQL receipt; status='+summary.status+'; provider=OFFLINE TEST FIXTURE')
