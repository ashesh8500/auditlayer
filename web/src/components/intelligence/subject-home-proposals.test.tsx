// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({refresh:vi.fn(),resolve:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('@/lib/actions/intelligence',()=>({resolveBriefProposalAction:mocks.resolve,recordRecommendationDecisionAction:vi.fn(),saveLivingBriefAction:vi.fn()}));
import {SubjectHome} from './subject-home';
let root:Root,container:HTMLDivElement;
const data:React.ComponentProps<typeof SubjectHome>['data']={
 subject:{id:'s',name:'Brand',type:'brand',avatarUrl:null,channelCount:0,lastAuditAt:null},
 channels:[],briefVersions:[{id:'v1',subjectId:'s',version:1,source:'user',parentVersionId:null,changeSummary:null,createdAt:'2026-01-01',content:{subjectType:'brand',identity:'Brand',vision:'',audience:'',offers:'',voice:'',positioning:'',goals:'Old goals',successCriteria:'',constraints:'',activeExperiments:'',plannedChanges:''}}],scores:[],recommendations:[],sinceLast:[],reports:[],
 proposals:[{id:'p',subjectId:'s',parentVersionId:'v1',baseVersion:1,path:'goals',operation:'replace',proposedValue:'New goals',evidenceIds:[],changeExplanation:'Evidence',status:'proposed',createdAt:'2026-01-01'}]
};
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mocks.refresh.mockReset();mocks.resolve.mockReset();container=document.createElement('div');root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount())});
async function accept(){
 await act(async()=>root.render(<SubjectHome subjectId="s" data={data}/>));
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Brand Context')!.click());
 const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Confirm');
 expect(button).toBeTruthy();await act(async()=>button!.click());
}
it('honors refreshed proposal state without retaining stale decision controls',async()=>{
 await act(async()=>root.render(<SubjectHome subjectId="s" data={data}/>));
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Brand Context')!.click());
 await act(async()=>root.render(<SubjectHome subjectId="s" data={{...data,proposals:data.proposals.map(p=>({...p,status:'superseded'}))}}/>));
 expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Confirm')).toBeUndefined();
});
it('refreshes authoritative brief and proposal state after success',async()=>{mocks.resolve.mockResolvedValue({ok:true});await accept();expect(mocks.refresh).toHaveBeenCalledTimes(1)});
it('does not refresh on a rejected resolution',async()=>{mocks.resolve.mockResolvedValue({ok:false,error:'Cannot resolve this suggestion.'});await accept();expect(mocks.refresh).not.toHaveBeenCalled();expect(container.textContent).toContain('Cannot resolve this suggestion.')});
it('recovers cleanly from thrown action failure',async()=>{mocks.resolve.mockRejectedValue(new Error('private transport detail'));await accept();expect(mocks.refresh).not.toHaveBeenCalled();expect(container.textContent).toContain('Could not update this suggestion');expect(container.textContent).not.toContain('private transport detail')});
