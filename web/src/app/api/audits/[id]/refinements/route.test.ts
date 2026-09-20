import { beforeEach, expect, it, vi } from 'vitest';
const { query, db } = vi.hoisted(() => {
  const query:any = {}; for (const name of ['select','eq','in']) query[name] = vi.fn(() => query);
  query.maybeSingle = vi.fn(); query.then = vi.fn();
  return { query, db:{ auth:{ getUser:vi.fn() }, from:vi.fn(() => query) } };
});
vi.mock('@/lib/supabase/server', () => ({ createClient:async () => db }));
import { GET } from './route';
const request = () => new Request('http://localhost/api/audits/a/refinements?ids=11111111-1111-1111-1111-111111111111');
beforeEach(() => { vi.clearAllMocks(); db.auth.getUser.mockResolvedValue({data:{user:{id:'owner'}}}); query.maybeSingle.mockResolvedValue({data:{id:'a',report_version:2,report_path:'private/path',status:'ready'}}); query.then.mockImplementation((resolve:any) => resolve({data:[{id:'r',status:'done'}]})); });
it('requires authentication', async () => {
  db.auth.getUser.mockResolvedValue({data:{user:null}});
  expect((await GET(request(),{params:Promise.resolve({id:'a'})})).status).toBe(401);
  expect(db.from).not.toHaveBeenCalled();
});
it('owner-scopes even elevated users and does not expose storage paths or usage', async () => {
  const response = await GET(request(),{params:Promise.resolve({id:'a'})});
  expect(query.eq).toHaveBeenCalledWith('user_id','owner');
  expect(query.eq).toHaveBeenCalledWith('audit_id','a');
  expect(query.select).toHaveBeenCalledWith('id,section,instruction,status,error,created_at');
  expect(await response.json()).toEqual({refinements:[{id:'r',status:'done'}],reportVersion:2,reportReady:true});
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('does not query refinements when audit ownership fails', async () => {
  query.maybeSingle.mockResolvedValue({data:null});
  expect((await GET(request(),{params:Promise.resolve({id:'foreign'})})).status).toBe(404);
  expect(db.from).toHaveBeenCalledTimes(1);
});
