-- P1-2 DORMANT test · 仅在 migration + RPC 获批部署后运行；整份自动 ROLLBACK。
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users order by created_at limit 1),true);

do $surface_test$
declare
  uid uuid:=auth.uid(); mid text:='__surface_state_probe__'; r jsonb; failed boolean;
  m1 constant uuid:='00000000-0000-0000-0000-000000000201';
  m2 constant uuid:='00000000-0000-0000-0000-000000000202';
  m3 constant uuid:='00000000-0000-0000-0000-000000000203';
begin
  if uid is null then raise exception 'test requires at least one auth user'; end if;
  insert into public.memories(user_id,id,text,ts) values(uid,mid,'surface state rollback probe',1);

  r:=public.set_memory_surface_state(mid,1,'do_not_surface',m1);
  if r->>'status'<>'applied' or r->'row'->>'surface_state'<>'do_not_surface' or (r->'row'->>'revision')::bigint<>2 then raise exception 'hide failed: %',r; end if;
  r:=public.set_memory_surface_state(mid,1,'do_not_surface',m1);
  if coalesce((r->>'idempotent')::boolean,false) is not true or (r->'row'->>'revision')::bigint<>2 then raise exception 'retry not idempotent: %',r; end if;

  r:=public.set_memory_surface_state(mid,1,'active',m2);
  if r->>'status'<>'conflict' or (select surface_state from public.memories where user_id=uid and id=mid)<>'do_not_surface' then raise exception 'stale revision changed row: %',r; end if;
  if (select count(*) from public.memory_conflicts where user_id=uid and mutation_id=m2)<>1 then raise exception 'conflict not logged exactly once'; end if;

  r:=public.set_memory_surface_state(mid,2,'active',m3);
  if r->>'status'<>'applied' or r->'row'->>'surface_state'<>'active' then raise exception 'restore failed: %',r; end if;

  failed:=false; begin perform public.set_memory_surface_state(mid,3,'superseded',gen_random_uuid()); exception when others then failed:=true; end;
  if not failed then raise exception 'P1-2 illegally accepted superseded'; end if;
  failed:=false; begin perform public.set_memory_surface_state('__missing',1,'active',gen_random_uuid()); exception when others then failed:=true; end;
  if not failed then raise exception 'missing memory accepted'; end if;

  if has_function_privilege('anon','public.set_memory_surface_state(text,bigint,text,uuid)','EXECUTE')
    or has_function_privilege('service_role','public.set_memory_surface_state(text,bigint,text,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.set_memory_surface_state(text,bigint,text,uuid)','EXECUTE') then raise exception 'unsafe RPC grants'; end if;
  if has_column_privilege('authenticated','public.memories','surface_state','UPDATE')
    or has_column_privilege('authenticated','public.memories','supersedes_id','UPDATE') then raise exception 'new columns writable outside RPC'; end if;
  raise notice 'memory surface state dormant tests passed';
end;
$surface_test$;

rollback;

