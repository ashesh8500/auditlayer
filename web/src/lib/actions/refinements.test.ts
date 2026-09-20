import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const query:any = {}; for (const n of ['select','eq']) query[n]=vi.fn(() => query);
  query.maybeSingle=vi.fn();
  const download=vi.fn(); const rpc=vi.fn(); const bump = vi.fn();
  return { query, download, rpc, bump, profile:{id:'owner',role:'user'}, db:{from:vi.fn(() => query)},
    admin:{from:vi.fn(() => query),rpc,storage:{from:vi.fn(() => ({download}))}} };
});
vi.mock('@/lib/auth', () => ({requireProfile:async () => mocks.profile}));
vi.mock('@/lib/supabase/server', () => ({createClient:async () => mocks.db}));
vi.mock('@/lib/supabase/admin', () => ({createAdminClient:() => mocks.admin}));
vi.mock('@/lib/env', () => ({isSupabaseAdminConfigured:() => true}));
vi.mock('@/lib/resources/mutation-revision', () => ({bumpResourceRevision:mocks.bump}));
vi.mock('next/cache', () => ({revalidatePath:vi.fn()}));
import { requestRefinement } from './refinements';
function form(section='Key Gaps') { const form=new FormData(); form.set('auditId','a'); form.set('section',section); form.set('instruction','Make this shorter'); return form; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.profile.role='user';
  mocks.query.maybeSingle.mockResolvedValue({data:{id:'a',user_id:'owner',status:'ready',report_path:'a/v1.html',report_version:1}});
  mocks.download.mockResolvedValue({data:{text:async () => '<section><h2>Key Gaps</h2></section>'}});
  mocks.rpc.mockResolvedValue({data:'r'});
});
it('does not fall through to legacy refinement for explicit workspace consent', async () => {
  const f=form(); f.set('workspaceIntent','{}');
  expect(await requestRefinement({status:'idle'},f)).toEqual({status:'error',message:'Invalid workspace quote or consent.'});
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
});
it('rejects legacy global sections absent from the actual report without enqueue', async () => {
  expect((await requestRefinement({status:'idle'},form('Executive Summary'))).status).toBe('error');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('pins the validated file version to transactional enqueue and confirms the row', async () => {
  const result=await requestRefinement({status:'idle'},form());
  expect(result).toMatchObject({status:'queued',refinementId:'r'});
  expect(mocks.rpc).toHaveBeenCalledWith('enqueue_report_refinement', expect.objectContaining({p_report_version:1,p_user_id:'owner',p_section:'Key Gaps'}));
  expect(mocks.query.eq).toHaveBeenCalledWith('id','r');
  expect(mocks.bump).toHaveBeenCalledExactlyOnceWith('reports');
});
it.each(['enqueue', 'confirmation', 'download', 'validation'])('does not bump Reports on %s failure', async failure => {
  if (failure === 'enqueue') mocks.rpc.mockResolvedValue({error:{message:'failed'}});
  if (failure === 'confirmation') mocks.query.maybeSingle.mockResolvedValueOnce({data:{id:'a',user_id:'owner',status:'ready',report_path:'a/v1.html',report_version:1}}).mockResolvedValueOnce({data:null});
  if (failure === 'download') mocks.download.mockResolvedValue({data:null,error:{message:'failed'}});
  const result = await requestRefinement({status:'idle'},form(failure === 'validation' ? 'Missing' : 'Key Gaps'));
  expect(result.status).toBe('error');
  expect(mocks.bump).not.toHaveBeenCalled();
});
it('disallows foreign admin workspaces and unavailable report files', async () => {
  mocks.profile.role='admin';
  mocks.query.maybeSingle.mockResolvedValue({data:{id:'a',user_id:'foreign',status:'ready',report_path:'foreign/private'}});
  expect((await requestRefinement({status:'idle'},form())).status).toBe('error');
  expect(mocks.download).not.toHaveBeenCalled();
  mocks.query.maybeSingle.mockResolvedValue({data:{id:'a',user_id:'owner',status:'ready',report_path:null}});
  expect((await requestRefinement({status:'idle'},form())).status).toBe('error');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
