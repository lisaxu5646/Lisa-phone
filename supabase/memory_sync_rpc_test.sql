-- Re-runnable atomic sync/RLS/conflict smoke test. All rows are rolled back.

begin;
select set_config('request.jwt.claim.sub', (select id::text from auth.users order by created_at limit 1), true);
set local role authenticated;

do $$
declare
  uid uuid := auth.uid();
  m_id text := '__memory_sync_rpc_probe__';
  r jsonb;
  n integer;
begin
  r := public.apply_memory_mutation(uid, m_id, 'upsert',
    '{"text":"probe one","tags":[],"char_ids":[],"v":0,"a":1,"open":false,"pinned":false,"ts":1,"archived":false}'::jsonb,
    0, '00000000-0000-0000-0000-000000000101'::uuid);
  if r->>'status' <> 'applied' or (r->'row'->>'revision')::bigint <> 1 then
    raise exception 'insert mutation failed: %', r;
  end if;

  -- Same mutation is idempotent and must not bump revision.
  r := public.apply_memory_mutation(uid, m_id, 'upsert',
    '{"text":"probe one","tags":[],"char_ids":[],"v":0,"a":1,"open":false,"pinned":false,"ts":1,"archived":false}'::jsonb,
    0, '00000000-0000-0000-0000-000000000101'::uuid);
  if r->>'status' <> 'applied' or (r->>'idempotent')::boolean is not true or (r->'row'->>'revision')::bigint <> 1 then
    raise exception 'idempotent retry failed: %', r;
  end if;

  r := public.apply_memory_mutation(uid, m_id, 'upsert',
    '{"text":"probe two","tags":["x"],"char_ids":[],"v":1,"a":2,"open":false,"pinned":true,"ts":2,"archived":false}'::jsonb,
    1, '00000000-0000-0000-0000-000000000102'::uuid);
  if r->>'status' <> 'applied' or (r->'row'->>'revision')::bigint <> 2 then
    raise exception 'revision update failed: %', r;
  end if;

  -- Stale base revision: preserve server row and append one conflict log.
  r := public.apply_memory_mutation(uid, m_id, 'upsert',
    '{"text":"stale local","tags":[],"char_ids":[],"v":0,"a":1,"open":false,"pinned":false,"ts":1,"archived":false,"device_id":"rpc-test"}'::jsonb,
    1, '00000000-0000-0000-0000-000000000103'::uuid);
  if r->>'status' <> 'conflict' or (r->'row'->>'text') <> 'probe two' then
    raise exception 'conflict preservation failed: %', r;
  end if;
  select count(*) into n from public.memory_conflicts where user_id = uid and memory_id = m_id;
  if n <> 1 then raise exception 'conflict log count expected 1, got %', n; end if;

  -- A stale client referring to a missing row is also a conflict and must be archived.
  r := public.apply_memory_mutation(uid, m_id || '_missing', 'upsert',
    '{"text":"missing local","tags":[],"char_ids":[],"v":0,"a":1,"open":false,"pinned":false,"ts":1,"archived":false,"device_id":"rpc-test"}'::jsonb,
    7, '00000000-0000-0000-0000-000000000105'::uuid);
  if r->>'status' <> 'conflict' or r->>'reason' <> 'row_missing' then
    raise exception 'missing-row conflict failed: %', r;
  end if;
  select count(*) into n from public.memory_conflicts where user_id = uid and memory_id = m_id || '_missing';
  if n <> 1 then raise exception 'missing-row conflict log expected 1, got %', n; end if;

  r := public.apply_memory_mutation(uid, m_id, 'delete', '{}'::jsonb,
    2, '00000000-0000-0000-0000-000000000104'::uuid);
  if r->>'status' <> 'applied' or (r->'row'->>'deleted')::boolean is not true or (r->'row'->>'revision')::bigint <> 3 then
    raise exception 'soft delete failed: %', r;
  end if;
end;
$$;

reset role;
rollback;

select
  (select count(*) from public.memories where id = '__memory_sync_rpc_probe__') as probe_memories_after_rollback,
  (select count(*) from public.memory_conflicts where memory_id = '__memory_sync_rpc_probe__') as probe_conflicts_after_rollback,
  (select count(*) from public.memories) as production_memory_rows;
