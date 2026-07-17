-- ============================================================
-- P1-2 DORMANT · Lisa 设置「留档不浮现 / 恢复」的原子 RPC（当前不要执行）
-- superseded 保留给 P1-3 双行纠错 RPC，本函数明确拒绝。
-- ============================================================
create or replace function public.set_memory_surface_state(
  p_memory_id text,
  p_base_revision bigint,
  p_surface_state text,
  p_mutation_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  cur public.memories%rowtype;
  outrow public.memories%rowtype;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if coalesce(btrim(p_memory_id),'')='' or p_base_revision is null or p_mutation_id is null then raise exception 'id, revision and mutation id are required' using errcode='22023'; end if;
  if p_surface_state is null or p_surface_state not in ('active','do_not_surface') then raise exception 'P1-2 only allows active or do_not_surface' using errcode='22023'; end if;

  select * into cur from public.memories where user_id=uid and id=p_memory_id for update;
  if not found then raise exception 'memory not found' using errcode='P0002'; end if;
  if cur.last_mutation_id=p_mutation_id then
    return jsonb_build_object('status','applied','idempotent',true,'row',to_jsonb(cur));
  end if;
  if exists(select 1 from public.memories where user_id=uid and last_mutation_id=p_mutation_id and id<>p_memory_id) then
    raise exception 'mutation id belongs to another memory' using errcode='23505';
  end if;
  if cur.deleted then raise exception 'soft-deleted memory cannot change surface state' using errcode='22023'; end if;
  if cur.surface_state='superseded' then raise exception 'superseded memory requires P1-3 correction flow' using errcode='22023'; end if;
  if cur.revision<>p_base_revision then
    insert into public.memory_conflicts(user_id,memory_id,base_revision,server_revision,local_row,server_row,mutation_id,status)
    values(uid,p_memory_id,p_base_revision,cur.revision,jsonb_build_object('operation','surface_state','requested',p_surface_state),to_jsonb(cur),p_mutation_id,'logged')
    on conflict(user_id,mutation_id) where mutation_id is not null do nothing;
    return jsonb_build_object('status','conflict','reason','revision_mismatch','row',to_jsonb(cur));
  end if;
  update public.memories set surface_state=p_surface_state,last_mutation_id=p_mutation_id
    where user_id=uid and id=p_memory_id returning * into outrow;
  return jsonb_build_object('status','applied','idempotent',false,'row',to_jsonb(outrow));
end;
$$;

revoke all on function public.set_memory_surface_state(text,bigint,text,uuid) from public,anon,service_role;
grant execute on function public.set_memory_surface_state(text,bigint,text,uuid) to authenticated;
