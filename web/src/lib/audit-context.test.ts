import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {loadAuditContext} from './audit-context';
let filters:Array<[string,unknown]>;
function client(data:unknown){const q={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},maybeSingle:async()=>({data,error:null})};return {from:()=>q} as never;}
beforeEach(()=>{filters=[]});
it('projects owner-scoped subject and sibling navigation from the durable batch',async()=>{
 const data={batch:{id:'b',user_id:'u',subject:{id:'s',user_id:'u',name:'Brand'},items:[{audit:{id:'a',user_id:'u',handle:'brand',status:'running'}},{audit:{id:'a2',user_id:'u',handle:'brand.site',status:'ready'}},{audit:{id:'foreign',user_id:'other',handle:'private',status:'ready'}}]}};
 expect(await loadAuditContext(client(data),'a','u')).toEqual({subject:{id:'s',name:'Brand'},audits:[{id:'a',handle:'brand',status:'running'},{id:'a2',handle:'brand.site',status:'ready'}]});
 expect(filters).toContainEqual(['audit_id','a']);expect(filters).toContainEqual(['batch.user_id','u']);
});
it.each([null,{batch:{id:'b',user_id:'other'}},{batch:{id:'b',user_id:'u',subject:{id:'s',user_id:'other'}}}])('does not expose missing or foreign batch context',async data=>{expect(await loadAuditContext(client(data),'a','u')).toBeNull()});
