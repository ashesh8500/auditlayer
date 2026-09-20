import { expect, it, vi } from "vitest";
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({profile:vi.fn(),read:vi.fn(),access:vi.fn(),download:vi.fn()}));
vi.mock('@/lib/auth',()=>({getProfile:m.profile}));
vi.mock('@/lib/workflows/server',()=>({readWorkflows:m.read,workflowRpc:m.access}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({storage:{from:()=>({download:m.download})}})}));
vi.mock('@/lib/env',()=>({isSupabaseAdminConfigured:()=>true,isSupabaseConfigured:()=>true}));
import { GET as resource } from '@/app/api/resources/workflows/route';
import { GET as artifact } from '@/app/api/workflow-artifacts/[id]/route';
it('resource denies unauthenticated read before any backend call',async()=>{
 m.profile.mockResolvedValue(null);m.read.mockClear();
 const result=await resource();expect(result.status).toBe(401);expect(m.read).not.toHaveBeenCalled();
});
it('resource sends only current owner scope and never schedules',async()=>{
 m.profile.mockResolvedValue({id:'owner'});m.read.mockResolvedValue({ownerId:'owner',workflows:[]});m.access.mockClear();
 const result=await resource();expect(result.status).toBe(200);expect(m.read).toHaveBeenCalledWith('owner');expect(m.access).not.toHaveBeenCalled();
 expect(result.headers.get('Cache-Control')).toContain('no-store');
});
it('artifact checks live recipient grant before downloading private bytes',async()=>{
 m.profile.mockResolvedValue({id:'recipient'});m.access.mockRejectedValue(new Error('revoked'));m.download.mockClear();
 const result=await artifact(new Request('https://alm.invalid/api/workflow-artifacts/11111111-1111-4111-8111-111111111111'),{params:Promise.resolve({id:'11111111-1111-4111-8111-111111111111'})});
 expect(result.status).toBe(403);expect(m.download).not.toHaveBeenCalled();
 expect(m.access).toHaveBeenCalledWith('artifact_access',{viewer_id:'recipient',delivery_id:'11111111-1111-4111-8111-111111111111'});
});
it('authorized artifact remains sandboxed and never returns a signed URL',async()=>{
 m.profile.mockResolvedValue({id:'recipient'});m.access.mockResolvedValue({report_path:'private/path.html'});m.download.mockResolvedValue({data:new Blob(['<h1>Review</h1>']),error:null});
 const result=await artifact(new Request('https://alm.invalid/api/workflow-artifacts/11111111-1111-4111-8111-111111111111'),{params:Promise.resolve({id:'11111111-1111-4111-8111-111111111111'})});
 expect(result.status).toBe(200);expect(result.headers.get('Content-Security-Policy')).toContain('sandbox');expect(result.headers.get('Cache-Control')).toContain('no-store');
 expect(await result.text()).toBe('<h1>Review</h1>');
});
