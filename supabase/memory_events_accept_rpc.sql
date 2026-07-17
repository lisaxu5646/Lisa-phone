-- ============================================================
-- ⑥事件层 · 第6步：Lisa 原子确认事件候选
-- 先部署 memory_events.sql，再执行本文件；可重复执行。
-- ============================================================

create or replace function public.accept_memory_event_candidate(
  p_candidate_id text,
  p_candidate_revision bigint,
  p_mutation_id uuid,
  p_user_edits jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  c public.memory_event_candidates%rowtype;
  existing_event public.memory_events%rowtype;
  created_event public.memory_events%rowtype;
  final_candidate public.memory_event_candidates%rowtype;
  d jsonb;
  edits jsonb := coalesce(p_user_edits, '{}'::jsonb);
  src_ids text[];
  src_count integer;
  distinct_count integer;
  link_count integer;
  link_distinct_count integer;
  mem_count integer;
  link_memory_revision bigint;
  bad_count integer;
  m record;
  l record;
  event_id text;
  event_title text;
  event_narrative text;
  event_synopsis text;
  event_status text;
  author_id text;
  started bigint;
  ended bigint;
  valence smallint;
  arousal smallint;
  themes_arr text[] := '{}'::text[];
  chars_arr text[] := '{}'::text[];
  edited boolean := false;
  allowed_edit_keys text[] := array['title','synopsis','narrative'];
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(btrim(p_candidate_id), '') = '' or p_candidate_revision is null or p_mutation_id is null then
    raise exception 'candidate id, revision and mutation id are required' using errcode = '22023';
  end if;
  if p_user_edits is not null and jsonb_typeof(p_user_edits) <> 'object' then
    raise exception 'user edits must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(edits) as edit_key(key)
    where not (key = any(allowed_edit_keys))
  ) then
    raise exception 'user edits may only contain title, synopsis and narrative' using errcode = '22023';
  end if;

  select * into c
  from public.memory_event_candidates
  where user_id = uid and id = p_candidate_id
  for update;
  if not found then
    raise exception 'candidate not found' using errcode = 'P0002';
  end if;

  -- 同 mutation 重试：只允许返回这个候选已经接受的同一事件。
  select * into existing_event
  from public.memory_events
  where user_id = uid and last_mutation_id = p_mutation_id;
  if found then
    if c.status = 'accepted' and c.accepted_event_id = existing_event.id then
      return jsonb_build_object(
        'status', 'accepted', 'idempotent', true,
        'event', to_jsonb(existing_event), 'candidate', to_jsonb(c)
      );
    end if;
    raise exception 'mutation id already belongs to another acceptance' using errcode = '23505';
  end if;

  if c.status <> 'drafted' then
    raise exception 'candidate must be drafted (current: %)', c.status using errcode = '22023';
  end if;
  if c.revision <> p_candidate_revision then
    raise exception 'candidate revision conflict' using errcode = '40001';
  end if;
  if c.draft is null or jsonb_typeof(c.draft) <> 'object' then
    raise exception 'candidate draft is missing or invalid' using errcode = '22023';
  end if;

  d := c.draft || edits;
  edited := p_user_edits is not null and p_user_edits <> '{}'::jsonb;
  event_title := btrim(coalesce(d->>'title', ''));
  event_narrative := btrim(coalesce(d->>'narrative', ''));
  event_synopsis := btrim(coalesce(d->>'synopsis', ''));
  author_id := btrim(coalesce(d->>'author_char_id', ''));
  event_status := coalesce(d->>'status', 'closed');
  if length(event_title) not between 1 and 80 then raise exception 'draft title must be 1-80 chars' using errcode = '22023'; end if;
  if event_narrative = '' then raise exception 'draft narrative is required' using errcode = '22023'; end if;
  if length(event_synopsis) > 200 then raise exception 'draft synopsis exceeds 200 chars' using errcode = '22023'; end if;
  if author_id = '' or author_id <> c.requested_char_id then raise exception 'draft author does not match requested character' using errcode = '22023'; end if;
  if event_status not in ('ongoing','closed') then raise exception 'draft status must be ongoing or closed' using errcode = '22023'; end if;
  if jsonb_typeof(d->'started_ts') <> 'number' then raise exception 'draft started_ts must be numeric' using errcode = '22023'; end if;
  started := (d->>'started_ts')::bigint;
  if event_status = 'ongoing' then
    if d->'ended_ts' is not null and d->'ended_ts' <> 'null'::jsonb then raise exception 'ongoing event cannot have ended_ts' using errcode = '22023'; end if;
    ended := null;
  else
    if jsonb_typeof(d->'ended_ts') <> 'number' then raise exception 'closed event requires numeric ended_ts' using errcode = '22023'; end if;
    ended := (d->>'ended_ts')::bigint;
    if ended < started then raise exception 'ended_ts cannot precede started_ts' using errcode = '22023'; end if;
  end if;
  if jsonb_typeof(d->'v') <> 'number' or (d->>'v')::numeric <> trunc((d->>'v')::numeric) then raise exception 'v must be an integer' using errcode = '22023'; end if;
  if jsonb_typeof(d->'a') <> 'number' or (d->>'a')::numeric <> trunc((d->>'a')::numeric) then raise exception 'a must be an integer' using errcode = '22023'; end if;
  valence := (d->>'v')::smallint; arousal := (d->>'a')::smallint;
  if valence not between -5 and 5 or arousal not between 0 and 5 then raise exception 'v/a out of range' using errcode = '22023'; end if;
  if d ? 'themes' then
    if jsonb_typeof(d->'themes') <> 'array' then raise exception 'themes must be an array' using errcode = '22023'; end if;
    select coalesce(array_agg(value order by ord), '{}'::text[]) into themes_arr
    from jsonb_array_elements_text(d->'themes') with ordinality x(value, ord);
    if cardinality(themes_arr) > 8 then raise exception 'themes may contain at most 8 items' using errcode = '22023'; end if;
  end if;

  src_ids := c.source_memory_ids;
  src_count := coalesce(cardinality(src_ids), 0);
  select count(distinct x) into distinct_count from unnest(coalesce(src_ids, '{}'::text[])) x;
  if src_count not between 2 and 30 or distinct_count <> src_count then
    raise exception 'source memories must contain 2-30 unique ids' using errcode = '22023';
  end if;
  if jsonb_typeof(c.base_memory_revisions) <> 'object' then raise exception 'base revisions must be an object' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(c.base_memory_revisions)) <> src_count then
    raise exception 'base revisions must cover every source exactly once' using errcode = '22023';
  end if;

  -- 固定顺序锁来源，防两个确认事务锁序相反。
  perform 1 from public.memories
  where user_id = uid and id = any(src_ids)
  order by id for update;
  select count(*) into mem_count from public.memories where user_id = uid and id = any(src_ids);
  if mem_count <> src_count then raise exception 'one or more source memories are missing or cross-user' using errcode = '22023'; end if;
  select count(*) into bad_count from public.memories where user_id = uid and id = any(src_ids) and deleted;
  if bad_count > 0 then raise exception 'soft-deleted source memory cannot be accepted' using errcode = '22023'; end if;
  for m in select id, revision, char_ids from public.memories where user_id = uid and id = any(src_ids) order by id loop
    if not (c.base_memory_revisions ? m.id) or jsonb_typeof(c.base_memory_revisions->m.id) <> 'number'
       or (c.base_memory_revisions->>m.id)::bigint <> m.revision then
      raise exception 'source memory revision conflict: %', m.id using errcode = '40001';
    end if;
    chars_arr := chars_arr || coalesce(m.char_ids, '{}'::text[]);
  end loop;
  select coalesce(array_agg(x order by first_pos), '{}'::text[]) into chars_arr
  from (select x, min(pos) first_pos from unnest(array[author_id] || chars_arr) with ordinality u(x,pos) where x <> '' group by x) q;

  if jsonb_typeof(d->'links') <> 'array' then raise exception 'draft links must be an array' using errcode = '22023'; end if;
  select count(*), count(distinct elem->>'memory_id') into link_count, link_distinct_count
  from jsonb_array_elements(d->'links') elem;
  if link_count <> src_count or link_distinct_count <> src_count then
    raise exception 'draft links must cover every source exactly once' using errcode = '22023';
  end if;
  for l in select elem, ord from jsonb_array_elements(d->'links') with ordinality q(elem,ord) loop
    if jsonb_typeof(l.elem) <> 'object' or not ((l.elem->>'memory_id') = any(src_ids)) then raise exception 'draft link references an external source' using errcode = '22023'; end if;
    if coalesce(l.elem->>'relation','') not in ('context','evidence','turning_point','outcome') then raise exception 'draft link relation is invalid' using errcode = '22023'; end if;
    if l.elem ? 'weight' and (jsonb_typeof(l.elem->'weight') <> 'number' or (l.elem->>'weight')::numeric < 0 or (l.elem->>'weight')::numeric > 1) then raise exception 'draft link weight must be 0-1' using errcode = '22023'; end if;
  end loop;

  event_id := 'evt_' || replace(p_mutation_id::text, '-', '');
  insert into public.memory_events (
    user_id,id,title,narrative,synopsis,char_ids,author_char_id,started_ts,ended_ts,status,
    themes,v,a,state_before,turning_point,state_after,source,edited_by_user,deleted,last_mutation_id
  ) values (
    uid,event_id,event_title,event_narrative,event_synopsis,chars_arr,author_id,started,ended,event_status,
    themes_arr,valence,arousal,nullif(d->>'state_before',''),nullif(d->>'turning_point',''),nullif(d->>'state_after',''),
    'cc_manual_selection',edited,false,p_mutation_id
  ) returning * into created_event;

  for l in select elem, ord from jsonb_array_elements(d->'links') with ordinality q(elem,ord) loop
    select revision into strict link_memory_revision
    from public.memories where user_id = uid and id = l.elem->>'memory_id';
    insert into public.memory_event_links (
      user_id,event_id,memory_id,relation,weight,ordinal,memory_revision_at_link,deleted
    ) values (
      uid,event_id,l.elem->>'memory_id',l.elem->>'relation',coalesce((l.elem->>'weight')::real,1),(l.ord-1)::integer,link_memory_revision,false
    );
  end loop;

  update public.memory_event_candidates
  set status='accepted', accepted_event_id=event_id, edited_by_user=edited, last_mutation_id=p_mutation_id
  where user_id=uid and id=c.id and revision=p_candidate_revision and status='drafted'
  returning * into final_candidate;
  if not found then raise exception 'candidate changed during acceptance' using errcode = '40001'; end if;

  return jsonb_build_object('status','accepted','idempotent',false,'event',to_jsonb(created_event),'candidate',to_jsonb(final_candidate));
end;
$$;

revoke all on function public.accept_memory_event_candidate(text,bigint,uuid,jsonb) from public, anon, service_role;
grant execute on function public.accept_memory_event_candidate(text,bigint,uuid,jsonb) to authenticated;

comment on function public.accept_memory_event_candidate(text,bigint,uuid,jsonb) is
  'Lisa-only atomic acceptance: validates and locks candidate+sources, then creates exactly one event and links.';
