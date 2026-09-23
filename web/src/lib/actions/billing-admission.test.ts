import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),create:vi.fn(),retrieve:vi.fn(),customer:vi.fn(),profile:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('redirect:'+url)}}));
vi.mock('@/lib/auth',()=>({requireProfile:m.profile}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc})}));
vi.mock('@/lib/env',()=>({isSupabaseAdminConfigured:()=>true,siteUrl:()=> 'https://example.invalid'}));
vi.mock('@/lib/stripe',()=>({getStripe:()=>({customers:{create:m.customer},checkout:{sessions:{create:m.create,retrieve:m.retrieve}}}),priceIdForPlan:()=> 'price_starter'}));
import {startStarterCheckout,startProCheckout} from './billing';
beforeEach(()=>{vi.clearAllMocks();m.profile.mockResolvedValue({id:'owner',email:'local@example.invalid',stripe_customer_id:'cus_owner'});m.create.mockResolvedValue({id:'cs_local',url:'https://checkout.example.invalid/local'});});
it.each(['pending_plan_conflict','existing_contract_preserved'])('denies new legacy checkout before Stripe: %s',async(error)=>{
 m.rpc.mockResolvedValue({data:null,error:{message:error}});
 await expect(startStarterCheckout()).rejects.toThrow('redirect:/dashboard?billing=error');
 expect(m.create).not.toHaveBeenCalled();expect(m.customer).not.toHaveBeenCalled();
 expect(m.rpc).toHaveBeenCalledWith('commercial_checkout_reserve',{p:{owner_id:'owner',plan:'starter'}});
});
it('binds a shared reservation before redirect and reuses a bound hosted session',async()=>{
 m.rpc.mockResolvedValueOnce({data:{id:'intent',customer_id:'cus_owner',session_id:null},error:null}).mockResolvedValueOnce({data:'intent',error:null});
 await expect(startProCheckout()).rejects.toThrow('redirect:https://checkout.example.invalid/local');
 expect(m.create.mock.calls[0][1]).toEqual({idempotencyKey:'checkout:legacy:intent'});
 expect(m.create.mock.calls[0][0].metadata).toMatchObject({checkout_intent_id:'intent',plan:'pro'});
 expect(m.rpc).toHaveBeenLastCalledWith('commercial_checkout_bind',{p:{owner_id:'owner',id:'intent',session_id:'cs_local'}});
 m.create.mockClear();m.rpc.mockResolvedValue({data:{id:'intent',customer_id:'cus_owner',session_id:'cs_local'},error:null});m.retrieve.mockResolvedValue({status:'open',url:'https://checkout.example.invalid/local'});
 await expect(startProCheckout()).rejects.toThrow('redirect:https://checkout.example.invalid/local');
 expect(m.create).not.toHaveBeenCalled();
});
