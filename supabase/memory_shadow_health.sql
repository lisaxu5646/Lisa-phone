-- ⑤ memory shadow observation: read-only health report.
-- Safe to run during the 7-day shadow period. This script never writes data and never selects memory text.
-- Target is the account that currently owns the most memory rows; the report never prints its UUID.

with
target as (
  select user_id as id
  from public.memories
  group by user_id
  order by count(*) desc, user_id
  limit 1
),
memory_stats as (
  select
    count(*) as total_rows,
    count(distinct id) as unique_ids,
    count(*) filter (where not deleted) as live_rows,
    count(*) filter (where deleted) as soft_deleted_rows,
    count(*) filter (where not deleted and archived) as archived_live_rows,
    count(*) filter (where not deleted and open) as open_live_rows,
    count(*) filter (where revision > 1) as rows_changed_since_migration,
    count(*) filter (where last_mutation_id is not null) as rows_with_confirmed_mutation,
    min(revision) as min_revision,
    max(revision) as max_revision,
    max(updated_at) as last_memory_update_at,
    count(*) filter (where updated_at >= now() - interval '24 hours') as rows_updated_last_24h,
    count(*) filter (where id is null or id = '') as missing_ids,
    count(*) filter (where nullif(btrim(text), '') is null) as empty_texts
  from public.memories
  where user_id = (select id from target)
),
conflict_stats as (
  select
    count(*) as conflict_rows,
    count(*) filter (where created_at >= now() - interval '7 days') as conflicts_last_7d,
    max(created_at) as last_conflict_at
  from public.memory_conflicts
  where user_id = (select id from target)
),
inbox_stats as (
  select
    count(*) filter (where consumed_at is null) as inbox_pending,
    min(created_at) filter (where consumed_at is null) as oldest_pending_at,
    count(*) filter (where consumed_at is not null) as inbox_consumed
  from public.cc_mem_inbox
  where user_id = (select id from target)
),
source_stats as (
  select coalesce(jsonb_object_agg(source_name, row_count order by source_name), '{}'::jsonb) as live_rows_by_source
  from (
    select coalesce(nullif(source, ''), '(none)') as source_name, count(*) as row_count
    from public.memories
    where user_id = (select id from target) and not deleted
    group by coalesce(nullif(source, ''), '(none)')
  ) grouped
),
rls_stats as (
  select
    c.relrowsecurity as memories_rls_enabled,
    c.relforcerowsecurity as memories_rls_forced,
    not has_table_privilege('authenticated', 'public.memories', 'DELETE') as physical_delete_blocked
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'memories'
)
select jsonb_build_object(
  'observed_at', now(),
  'auth_user_count', (select count(*) from auth.users),
  'total_rows', m.total_rows,
  'unique_ids', m.unique_ids,
  'live_rows', m.live_rows,
  'soft_deleted_rows', m.soft_deleted_rows,
  'archived_live_rows', m.archived_live_rows,
  'open_live_rows', m.open_live_rows,
  'rows_changed_since_migration', m.rows_changed_since_migration,
  'rows_with_confirmed_mutation', m.rows_with_confirmed_mutation,
  'min_revision', m.min_revision,
  'max_revision', m.max_revision,
  'last_memory_update_at', m.last_memory_update_at,
  'rows_updated_last_24h', m.rows_updated_last_24h,
  'missing_ids', m.missing_ids,
  'empty_texts', m.empty_texts,
  'conflict_rows', c.conflict_rows,
  'conflicts_last_7d', c.conflicts_last_7d,
  'last_conflict_at', c.last_conflict_at,
  'inbox_pending', i.inbox_pending,
  'oldest_pending_at', i.oldest_pending_at,
  'inbox_consumed', i.inbox_consumed,
  'live_rows_by_source', s.live_rows_by_source,
  'memories_rls_enabled', r.memories_rls_enabled,
  'memories_rls_forced', r.memories_rls_forced,
  'physical_delete_blocked', r.physical_delete_blocked,
  'structural_health_pass', (
    m.total_rows = m.unique_ids
    and m.missing_ids = 0
    and m.empty_texts = 0
    and r.memories_rls_enabled
    and r.memories_rls_forced
    and r.physical_delete_blocked
  )
) as health_report
from memory_stats m
cross join conflict_stats c
cross join inbox_stats i
cross join source_stats s
cross join rls_stats r;

-- Interpretation for the shadow week:
-- 1. structural_health_pass must stay true.
-- 2. inbox_pending should return to 0 after the phone has opened and synced.
-- 3. every conflict row must be explained before cutover; zero is ideal.
-- 4. row counts may legitimately change as Lisa adds/edits/soft-deletes memories; the final gate is still
--    the app's second per-ID fingerprint audit, not this aggregate report alone.
