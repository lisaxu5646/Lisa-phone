-- ============================================================
-- DRAFT ONLY — rollback/RLS test for memory_events_draft.sql.
-- DO NOT RUN until ⑤ completes and the draft schema is approved for deployment.
-- Every probe row is wrapped in a transaction and rolled back.
-- ============================================================

begin;

do $$
declare
  owner_id uuid;
  memory_ids text[];
  first_memory_id text;
  second_memory_id text;
  first_memory_revision bigint;
  second_memory_revision bigint;
begin
  select user_id into owner_id
  from public.memories
  group by user_id
  order by count(*) desc, user_id
  limit 1;

  if owner_id is null then
    raise exception 'event RLS probe needs an existing memory owner';
  end if;

  select array_agg(id order by id) into memory_ids
  from (
    select id
    from public.memories
    where user_id = owner_id and not deleted
    order by id
    limit 2
  ) picked;

  if coalesce(cardinality(memory_ids), 0) <> 2 then
    raise exception 'event RLS probe needs two live memory rows';
  end if;

  first_memory_id := memory_ids[1];
  second_memory_id := memory_ids[2];
  select revision into first_memory_revision
  from public.memories where user_id = owner_id and id = first_memory_id;
  select revision into second_memory_revision
  from public.memories where user_id = owner_id and id = second_memory_id;

  -- Formal rows are inserted as the database owner only to seed a read/RLS probe.
  insert into public.memory_events (
    user_id, id, title, narrative, synopsis, char_ids, author_char_id,
    started_ts, ended_ts, status, themes, source, last_mutation_id
  ) values (
    owner_id, '__event_rls_probe__', 'temporary event probe',
    'Synthetic first-person narrative used only inside a rolled-back transaction.',
    'temporary synopsis', array['__probe_character__'], '__probe_character__',
    1, 2, 'closed', array['probe'], 'cc_manual_selection',
    '00000000-0000-0000-0000-000000000201'::uuid
  );

  insert into public.memory_event_links (
    user_id, event_id, memory_id, relation, weight, ordinal,
    memory_revision_at_link, last_mutation_id
  ) values
    (owner_id, '__event_rls_probe__', first_memory_id, 'context', 0.6, 0,
      first_memory_revision, '00000000-0000-0000-0000-000000000202'::uuid),
    (owner_id, '__event_rls_probe__', second_memory_id, 'turning_point', 1, 1,
      second_memory_revision, '00000000-0000-0000-0000-000000000203'::uuid);

  insert into public.memory_event_candidates (
    user_id, id, status, source_memory_ids, requested_char_id,
    base_memory_revisions, idempotency_key, last_mutation_id
  ) values (
    owner_id, '__event_candidate_rls_probe__', 'requested', memory_ids, '__probe_character__',
    jsonb_build_object(first_memory_id, first_memory_revision, second_memory_id, second_memory_revision),
    '__event_candidate_rls_probe_key__', '00000000-0000-0000-0000-000000000204'::uuid
  );

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  owner_id uuid := auth.uid();
  visible_count integer;
  current_revision bigint;
  blocked boolean;
begin
  select count(*) into visible_count
  from public.memory_events where id = '__event_rls_probe__';
  if visible_count <> 1 then
    raise exception 'event RLS failed: owner cannot read own formal event';
  end if;

  select count(*) into visible_count
  from public.memory_event_links where event_id = '__event_rls_probe__';
  if visible_count <> 2 then
    raise exception 'event RLS failed: owner expected 2 links, got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.memory_event_candidates where id = '__event_candidate_rls_probe__';
  if visible_count <> 1 then
    raise exception 'event RLS failed: owner cannot read own candidate';
  end if;

  update public.memory_event_candidates
  set feedback = 'temporary rolled-back feedback'
  where user_id = owner_id and id = '__event_candidate_rls_probe__';

  select revision into current_revision
  from public.memory_event_candidates
  where user_id = owner_id and id = '__event_candidate_rls_probe__';
  if current_revision <> 2 then
    raise exception 'candidate revision trigger failed: expected 2, got %', current_revision;
  end if;

  -- Only the future atomic accept RPC may move a candidate to accepted.
  blocked := false;
  begin
    update public.memory_event_candidates
    set status = 'accepted', accepted_event_id = '__event_rls_probe__'
    where user_id = owner_id and id = '__event_candidate_rls_probe__';
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'candidate privilege failed: app directly accepted a candidate';
  end if;

  -- App clients may not directly create formal events or links.
  blocked := false;
  begin
    insert into public.memory_events (
      user_id, id, title, narrative, author_char_id, started_ts
    ) values (
      owner_id, '__event_forbidden_insert__', 'must fail', 'must fail', '__probe__', 1
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'event privilege failed: app directly inserted a formal event';
  end if;

  blocked := false;
  begin
    delete from public.memory_event_candidates
    where user_id = owner_id and id = '__event_candidate_rls_probe__';
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'event privilege failed: app physically deleted a candidate';
  end if;

  -- A different simulated user sees none of the owner's event-layer rows.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

  select count(*) into visible_count
  from public.memory_events where id = '__event_rls_probe__';
  if visible_count <> 0 then
    raise exception 'event RLS failed: another user can read the formal event';
  end if;

  select count(*) into visible_count
  from public.memory_event_links where event_id = '__event_rls_probe__';
  if visible_count <> 0 then
    raise exception 'event RLS failed: another user can read links';
  end if;

  select count(*) into visible_count
  from public.memory_event_candidates where id = '__event_candidate_rls_probe__';
  if visible_count <> 0 then
    raise exception 'event RLS failed: another user can read the candidate';
  end if;

  blocked := false;
  begin
    insert into public.memory_event_candidates (
      user_id, id, source_memory_ids, requested_char_id, idempotency_key
    ) values (
      owner_id, '__event_cross_user_insert__', array['a', 'b'], '__probe__', '__cross_user__'
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'event RLS failed: cross-user candidate insert was accepted';
  end if;
end;
$$;

reset role;
rollback;

select jsonb_build_object(
  'probe_events_after_rollback',
    (select count(*) from public.memory_events where id = '__event_rls_probe__'),
  'probe_links_after_rollback',
    (select count(*) from public.memory_event_links where event_id = '__event_rls_probe__'),
  'probe_candidates_after_rollback',
    (select count(*) from public.memory_event_candidates where id = '__event_candidate_rls_probe__'),
  'events_rls_enabled',
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memory_events'),
  'events_rls_forced',
    (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memory_events'),
  'candidates_rls_enabled',
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memory_event_candidates'),
  'candidates_rls_forced',
    (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memory_event_candidates'),
  'links_rls_enabled',
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memory_event_links'),
  'links_rls_forced',
    (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memory_event_links'),
  'candidate_delete_blocked',
    not has_table_privilege('authenticated', 'public.memory_event_candidates', 'DELETE'),
  'formal_event_delete_blocked',
    not has_table_privilege('authenticated', 'public.memory_events', 'DELETE'),
  'formal_link_delete_blocked',
    not has_table_privilege('authenticated', 'public.memory_event_links', 'DELETE'),
  'formal_event_insert_blocked',
    not has_table_privilege('authenticated', 'public.memory_events', 'INSERT'),
  'formal_link_insert_blocked',
    not has_table_privilege('authenticated', 'public.memory_event_links', 'INSERT')
) as event_layer_probe_report;
