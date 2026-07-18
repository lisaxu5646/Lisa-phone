-- ============================================================
-- P1-3 LIVE · 创建/决定纠错候选的原子 RPC（2026-07-18 已部署）
-- 不复制 memory 正文；确认才修改两行 surface state，拒绝不碰 memories。
-- ============================================================
create or replace function public.create_memory_correction_candidate(
  p_old_memory_id text,p_new_memory_id text,p_old_revision bigint,p_new_revision bigint,
  p_reason text,p_mutation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); oldrow public.memories%rowtype; newrow public.memories%rowtype; c public.memory_correction_candidates%rowtype;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_mutation_id is null or coalesce(p_old_memory_id,'')='' or coalesce(p_new_memory_id,'')='' or p_old_memory_id=p_new_memory_id then raise exception 'two memory ids and mutation id required' using errcode='22023'; end if;
  if p_reason is null or p_reason not in ('more_detailed','contradiction','manual') then raise exception 'invalid correction reason' using errcode='22023'; end if;
  select * into c from public.memory_correction_candidates where user_id=uid and create_mutation_id=p_mutation_id;
  if found then return jsonb_build_object('status',c.status,'idempotent',true,'candidate',to_jsonb(c)); end if;
  perform 1 from public.memories where user_id=uid and id=any(array[p_old_memory_id,p_new_memory_id]) order by id for update;
  select * into oldrow from public.memories where user_id=uid and id=p_old_memory_id;
  select * into newrow from public.memories where user_id=uid and id=p_new_memory_id;
  if oldrow.id is null or newrow.id is null then raise exception 'memory pair missing or cross-user' using errcode='P0002'; end if;
  if oldrow.deleted or newrow.deleted then raise exception 'soft-deleted memory cannot enter correction' using errcode='22023'; end if;
  if oldrow.revision<>p_old_revision or newrow.revision<>p_new_revision then raise exception 'memory revision conflict' using errcode='40001'; end if;
  if oldrow.surface_state='superseded' or newrow.surface_state<>'active' or newrow.supersedes_id is not null then raise exception 'memory pair state is not eligible' using errcode='22023'; end if;
  select * into c from public.memory_correction_candidates where user_id=uid and old_memory_id=p_old_memory_id and new_memory_id=p_new_memory_id and status='proposed' for update;
  if found then return jsonb_build_object('status','proposed','idempotent',true,'candidate',to_jsonb(c)); end if;
  insert into public.memory_correction_candidates(user_id,id,old_memory_id,new_memory_id,old_base_revision,new_base_revision,reason,create_mutation_id)
  values(uid,'corr_'||replace(p_mutation_id::text,'-',''),p_old_memory_id,p_new_memory_id,p_old_revision,p_new_revision,p_reason,p_mutation_id)
  returning * into c;
  return jsonb_build_object('status','proposed','idempotent',false,'candidate',to_jsonb(c));
end;
$$;

create or replace function public.decide_memory_correction_candidate(
  p_candidate_id text,p_candidate_revision bigint,p_decision text,p_mutation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); c public.memory_correction_candidates%rowtype; oldrow public.memories%rowtype; newrow public.memories%rowtype; old_after public.memories%rowtype; new_after public.memories%rowtype; final_c public.memory_correction_candidates%rowtype;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_mutation_id is null or p_candidate_revision is null or coalesce(p_candidate_id,'')='' then raise exception 'candidate id, revision and mutation id required' using errcode='22023'; end if;
  if p_decision is null or p_decision not in ('accepted','rejected') then raise exception 'decision must be accepted or rejected' using errcode='22023'; end if;
  select * into c from public.memory_correction_candidates where user_id=uid and id=p_candidate_id for update;
  if not found then raise exception 'candidate not found' using errcode='P0002'; end if;
  if c.decision_mutation_id=p_mutation_id and c.status=p_decision then return jsonb_build_object('status',c.status,'idempotent',true,'candidate',to_jsonb(c)); end if;
  if c.status<>'proposed' then raise exception 'candidate already decided' using errcode='22023'; end if;
  if c.revision<>p_candidate_revision then raise exception 'candidate revision conflict' using errcode='40001'; end if;

  perform 1 from public.memories where user_id=uid and id=any(array[c.old_memory_id,c.new_memory_id]) order by id for update;
  select * into oldrow from public.memories where user_id=uid and id=c.old_memory_id;
  select * into newrow from public.memories where user_id=uid and id=c.new_memory_id;
  if oldrow.id is null or newrow.id is null then raise exception 'memory pair missing' using errcode='22023'; end if;

  if p_decision='accepted' then
    if oldrow.deleted or newrow.deleted then raise exception 'memory pair deleted' using errcode='22023'; end if;
    if oldrow.revision<>c.old_base_revision or newrow.revision<>c.new_base_revision then raise exception 'memory pair revision conflict' using errcode='40001'; end if;
    if oldrow.surface_state='superseded' or newrow.surface_state<>'active' or newrow.supersedes_id is not null then raise exception 'memory pair state changed' using errcode='40001'; end if;
    update public.memories set surface_state='superseded' where user_id=uid and id=oldrow.id returning * into old_after;
    update public.memories set surface_state='active',supersedes_id=oldrow.id where user_id=uid and id=newrow.id returning * into new_after;
  end if;
  insert into public.memory_correction_audit(user_id,candidate_id,decision,old_memory_id,new_memory_id,old_revision_before,new_revision_before,old_revision_after,new_revision_after,old_state_before,new_state_before,mutation_id)
  values(uid,c.id,p_decision,oldrow.id,newrow.id,oldrow.revision,newrow.revision,case when p_decision='accepted' then old_after.revision end,case when p_decision='accepted' then new_after.revision end,oldrow.surface_state,newrow.surface_state,p_mutation_id);
  update public.memory_correction_candidates set status=p_decision,decision_mutation_id=p_mutation_id where user_id=uid and id=c.id and revision=p_candidate_revision and status='proposed' returning * into final_c;
  if not found then raise exception 'candidate changed during decision' using errcode='40001'; end if;
  return jsonb_build_object('status',p_decision,'idempotent',false,'candidate',to_jsonb(final_c),'old_memory',case when p_decision='accepted' then to_jsonb(old_after) else to_jsonb(oldrow) end,'new_memory',case when p_decision='accepted' then to_jsonb(new_after) else to_jsonb(newrow) end);
end;
$$;

revoke all on function public.create_memory_correction_candidate(text,text,bigint,bigint,text,uuid) from public,anon,service_role;
revoke all on function public.decide_memory_correction_candidate(text,bigint,text,uuid) from public,anon,service_role;
grant execute on function public.create_memory_correction_candidate(text,text,bigint,bigint,text,uuid) to authenticated;
grant execute on function public.decide_memory_correction_candidate(text,bigint,text,uuid) to authenticated;
