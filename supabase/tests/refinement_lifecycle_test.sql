do $$
declare a uuid := gen_random_uuid(); u uuid := gen_random_uuid(); r uuid; s uuid; claimed jsonb; v integer;
begin
 insert into audits(id,user_id,status,report_path,report_version) values(a,u,'ready','old.html',1);
 insert into audit_report_versions(audit_id,version,report_path) values(a,1,'old.html');
 r := enqueue_report_refinement(a,u,1,'Key Gaps','Tighten the gaps');
 s := enqueue_report_refinement(a,u,1,'Three Moves','Clarify the moves');
 claimed := claim_next_refinement('one');
 assert (claimed->>'base_report_version')::integer = 1;
 assert claim_next_refinement('two') is null, 'same audit claimed twice';
 r := (claimed->>'id')::uuid;
 s := (select id from refinements where audit_id=a and id<>r);
 v := finalize_refinement_report(a,r,'new.html','1.9','master','bundle','Key Gaps','edit');
 assert v=2;
 assert (select report_path from audits where id=a)='new.html', 'path was nulled by empty SELECT';
 -- A duplicate completion must not rewind a later report pointer.
 update audits set report_version=5,report_path='newer.html' where id=a;
 assert finalize_refinement_report(a,r,'new.html','1.9','master','bundle','Key Gaps','edit')=v;
 assert (select report_path from audits where id=a)='newer.html';
 claimed := claim_next_refinement('two');
 assert (claimed->>'base_report_version')::integer=5;
 update audits set report_version=6 where id=a;
 begin
   perform finalize_refinement_report(a,s,'stale.html','1.9','master','bundle','Three Moves','edit');
   raise exception 'base fence did not reject';
 exception when others then
   if sqlerrm <> 'refinement_base_changed' then raise; end if;
 end;
 update refinements set lease_expires_at=now()-interval '1 minute' where id=s;
 assert sweep_stale_refinements()=1;
 assert (select status from refinements where id=s)='failed';
 assert (select tokens_in is null and cost_usd is null from refinements where id=s);
 assert claim_next_refinement('three') is null, 'expired paid call was replayed';
 assert not has_function_privilege('authenticated','public.claim_next_refinement(text)','execute');
 assert not has_function_privilege('anon','public.enqueue_report_refinement(uuid,uuid,integer,text,text)','execute');
 assert has_function_privilege('service_role','public.sweep_stale_refinements()','execute');
 begin
   perform enqueue_report_refinement(a,gen_random_uuid(),6,'Key Gaps','Foreign edit');
   raise exception 'foreign enqueue allowed';
 exception when others then
   if sqlerrm <> 'report_changed_or_unavailable' then raise; end if;
 end;
end $$;
