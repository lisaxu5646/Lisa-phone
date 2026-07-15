-- Atomic row-level memory mutation for the v1 shadow sync phase.
-- The caller must be the row owner. Conflicts retain both versions in memory_conflicts.

create or replace function public.apply_memory_mutation(
  p_user_id uuid,
  p_memory_id text,
  p_operation text,
  p_payload jsonb,
  p_base_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.memories%rowtype;
  result_row public.memories%rowtype;
  clean_tags text[];
  clean_char_ids text[];
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'memory mutation user mismatch' using errcode = '42501';
  end if;
  if p_operation not in ('upsert', 'delete') then
    raise exception 'invalid memory operation';
  end if;
  if p_memory_id is null or p_memory_id = '' or p_mutation_id is null then
    raise exception 'memory id and mutation id are required';
  end if;

  -- A request whose response was lost may be retried. Return the already-applied row.
  select * into current_row
  from public.memories
  where user_id = p_user_id and last_mutation_id = p_mutation_id
  limit 1;
  if found then
    return jsonb_build_object('status', 'applied', 'idempotent', true, 'row', to_jsonb(current_row));
  end if;

  select * into current_row
  from public.memories
  where user_id = p_user_id and id = p_memory_id
  for update;

  if not found then
    if p_operation = 'delete' then
      return jsonb_build_object('status', 'applied', 'idempotent', true, 'row', null);
    end if;
    if coalesce(p_base_revision, 0) <> 0 then
      insert into public.memory_conflicts (
        user_id, memory_id, base_revision, server_revision,
        local_row, server_row, device_id, mutation_id
      ) values (
        p_user_id, p_memory_id, p_base_revision, 0,
        jsonb_build_object('operation', p_operation, 'payload', coalesce(p_payload, '{}'::jsonb)),
        jsonb_build_object('missing', true), p_payload->>'device_id', p_mutation_id
      ) on conflict (user_id, mutation_id) where mutation_id is not null do nothing;
      return jsonb_build_object('status', 'conflict', 'reason', 'row_missing', 'row', null);
    end if;
    clean_tags := array(select jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb)));
    clean_char_ids := array(select jsonb_array_elements_text(coalesce(p_payload->'char_ids', '[]'::jsonb)));
    insert into public.memories (
      user_id, id, text, tags, char_ids, v, a, open, pinned, ts,
      archived, archived_batch, archived_ts, source, deleted, last_mutation_id
    ) values (
      p_user_id, p_memory_id, p_payload->>'text', clean_tags, clean_char_ids,
      coalesce((p_payload->>'v')::smallint, 0), coalesce((p_payload->>'a')::smallint, 1),
      coalesce((p_payload->>'open')::boolean, false), coalesce((p_payload->>'pinned')::boolean, false),
      coalesce((p_payload->>'ts')::bigint, 0), coalesce((p_payload->>'archived')::boolean, false),
      nullif(p_payload->>'archived_batch', ''), (p_payload->>'archived_ts')::bigint,
      nullif(p_payload->>'source', ''), false, p_mutation_id
    ) returning * into result_row;
    return jsonb_build_object('status', 'applied', 'idempotent', false, 'row', to_jsonb(result_row));
  end if;

  if p_base_revision is null or p_base_revision <> current_row.revision then
    insert into public.memory_conflicts (
      user_id, memory_id, base_revision, server_revision,
      local_row, server_row, device_id, mutation_id
    ) values (
      p_user_id, p_memory_id, p_base_revision, current_row.revision,
      jsonb_build_object('operation', p_operation, 'payload', coalesce(p_payload, '{}'::jsonb)),
      to_jsonb(current_row), p_payload->>'device_id', p_mutation_id
    ) on conflict (user_id, mutation_id) where mutation_id is not null do nothing;
    return jsonb_build_object('status', 'conflict', 'reason', 'revision_mismatch', 'row', to_jsonb(current_row));
  end if;

  if p_operation = 'delete' then
    update public.memories
    set deleted = true, last_mutation_id = p_mutation_id
    where user_id = p_user_id and id = p_memory_id
    returning * into result_row;
  else
    clean_tags := array(select jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb)));
    clean_char_ids := array(select jsonb_array_elements_text(coalesce(p_payload->'char_ids', '[]'::jsonb)));
    update public.memories set
      text = p_payload->>'text',
      tags = clean_tags,
      char_ids = clean_char_ids,
      v = coalesce((p_payload->>'v')::smallint, 0),
      a = coalesce((p_payload->>'a')::smallint, 1),
      open = coalesce((p_payload->>'open')::boolean, false),
      pinned = coalesce((p_payload->>'pinned')::boolean, false),
      ts = coalesce((p_payload->>'ts')::bigint, 0),
      archived = coalesce((p_payload->>'archived')::boolean, false),
      archived_batch = nullif(p_payload->>'archived_batch', ''),
      archived_ts = (p_payload->>'archived_ts')::bigint,
      source = nullif(p_payload->>'source', ''),
      deleted = false,
      last_mutation_id = p_mutation_id
    where user_id = p_user_id and id = p_memory_id
    returning * into result_row;
  end if;

  return jsonb_build_object('status', 'applied', 'idempotent', false, 'row', to_jsonb(result_row));
end;
$$;

revoke all on function public.apply_memory_mutation(uuid,text,text,jsonb,bigint,uuid) from public, anon;
grant execute on function public.apply_memory_mutation(uuid,text,text,jsonb,bigint,uuid) to authenticated, service_role;
