import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m=vi.hoisted(()=>({rpc:vi.fn(), profile:vi.fn(), revalidate:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:m.profile}));
vi.mock("@/lib/workflows/server",()=>({workflowRpc:m.rpc}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import { workflowCommand } from "./workflows";
const owner="11111111-1111-4111-8111-111111111111", id="22222222-2222-4222-8222-222222222222", version="33333333-3333-4333-8333-333333333333";
const form=(fields:Record<string,string>)=>{const f=new FormData();Object.entries(fields).forEach(([k,v])=>f.set(k,v));return f;};
beforeEach(()=>{vi.clearAllMocks();m.profile.mockResolvedValue({id:owner});});
it("takes owner only from current session and confirms pause before success",async()=>{
 m.rpc.mockResolvedValueOnce('paused').mockResolvedValueOnce({ownerId:owner,workflows:[{id,version_id:version,status:'paused'}]});
 const result=await workflowCommand({status:'idle'},form({command:'pause',workflow_id:id,version_id:version,owner_id:'attacker'}));
 expect(result.status).toBe('ok');
 expect(m.rpc).toHaveBeenNthCalledWith(1,'control',{owner_id:owner,workflow_id:id,version_id:version,command:'pause'});
 expect(m.revalidate).toHaveBeenCalledWith('/workflows');
});
it("does not claim success or invalidate on failed readback",async()=>{
 m.rpc.mockResolvedValueOnce('paused').mockResolvedValueOnce({ownerId:owner,workflows:[]});
 expect((await workflowCommand({status:'idle'},form({command:'pause',workflow_id:id,version_id:version}))).status).toBe('error');
 expect(m.revalidate).not.toHaveBeenCalled();
});
it("missing qualified model prevents save or trial without provider or RPC",async()=>{
 const result=await workflowCommand({status:'idle'},form({command:'save',model_id:'deepseek-v4-flash',workflow_id:id,version_id:version,subject_id:id,objective:'Review changes',timezone:'UTC',local_time:'09:00',recipients:owner,customer_max_microusd:'100',upstream_max_microusd:'100'}));
 expect(result.status).toBe('error');expect(result.message).toMatch(/qualified|unavailable/i);expect(m.rpc).not.toHaveBeenCalled();
});
it("run permission command never activates schedule or send",async()=>{
 m.rpc.mockResolvedValueOnce(true).mockResolvedValueOnce({ownerId:owner,workflows:[{id,version_id:version,status:'draft',run_granted:true}]});
 const result=await workflowCommand({status:'idle'},form({command:'grant',workflow_id:id,version_id:version,kind:'run',granted:'true',recipient_id:owner}));
 expect(result.status).toBe('ok');expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(['grant','resource']);
});
