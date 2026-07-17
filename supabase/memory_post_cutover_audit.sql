-- ============================================================
-- ⑤ · 2026-07-22 权威切换纪律复核（只读）
-- 不读取 memory 正文，不写任何表。SQL Editor 整份运行并保存唯一 JSON 结果。
-- target 取 memories 行数最多的账号；结果不输出用户 UUID。
-- ============================================================
with
target as (
  select user_id from public.memories group by user_id order by count(*) desc, user_id limit 1
),
m as (
  select count(*) total_rows, count(distinct id) unique_ids,
    count(*) filter (where not deleted) live_rows,
    count(*) filter (where deleted) soft_deleted_rows,
    count(*) filter (where archived and not deleted) archived_live_rows,
    count(*) filter (where open and not deleted) open_live_rows,
    count(*) filter (where revision < 1) invalid_revisions,
    count(*) filter (where id='' or nullif(btrim(text),'') is null) invalid_required_fields,
    min(revision) min_revision, max(revision) max_revision, max(updated_at) last_memory_update_at
  from public.memories where user_id=(select user_id from target)
),
conflicts as (
  select count(*) total, count(*) filter (where created_at >= now()-interval '7 days') last_7d,
    max(created_at) last_at
  from public.memory_conflicts where user_id=(select user_id from target)
),
inbox as (
  select count(*) filter(where consumed_at is null) pending,
    min(created_at) filter(where consumed_at is null) oldest_pending,
    count(*) filter(where consumed_at is not null) consumed
  from public.cc_mem_inbox where user_id=(select user_id from target)
),
events as (
  select count(*) filter(where not deleted) live_events,
    count(*) filter(where deleted) soft_deleted_events
  from public.memory_events where user_id=(select user_id from target)
),
links as (
  select count(*) filter(where not l.deleted) live_links,
    count(*) filter(where not l.deleted and e.id is null) broken_event_links,
    count(*) filter(where not l.deleted and mm.id is null) broken_memory_links,
    count(*) filter(where not l.deleted and mm.revision < l.memory_revision_at_link) impossible_revision_links
  from public.memory_event_links l
  left join public.memory_events e on e.user_id=l.user_id and e.id=l.event_id
  left join public.memories mm on mm.user_id=l.user_id and mm.id=l.memory_id
  where l.user_id=(select user_id from target)
),
candidates as (
  select count(*) filter(where status='accepted' and accepted_event_id is null) accepted_without_event,
    count(*) filter(where status<>'accepted' and accepted_event_id is not null) nonaccepted_with_event
  from public.memory_event_candidates where user_id=(select user_id from target)
),
security as (
  select
    coalesce((select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='memories'),false) memories_rls_forced,
    not has_table_privilege('authenticated','public.memories','DELETE') memory_physical_delete_blocked,
    not has_table_privilege('authenticated','public.memory_events','INSERT') event_direct_insert_blocked,
    not has_table_privilege('authenticated','public.memory_event_links','INSERT') link_direct_insert_blocked,
    has_function_privilege('authenticated','public.accept_memory_event_candidate(text,bigint,uuid,jsonb)','EXECUTE') accept_rpc_app_only,
    not has_function_privilege('anon','public.accept_memory_event_candidate(text,bigint,uuid,jsonb)','EXECUTE') accept_rpc_anon_blocked,
    not has_function_privilege('service_role','public.accept_memory_event_candidate(text,bigint,uuid,jsonb)','EXECUTE') accept_rpc_service_blocked
)
select jsonb_build_object(
  'schema','lisa-memory-post-cutover-audit-v1','observed_at',now(),'read_only',true,
  'memories',jsonb_build_object('total',m.total_rows,'unique_ids',m.unique_ids,'live',m.live_rows,'soft_deleted',m.soft_deleted_rows,'archived_live',m.archived_live_rows,'open_live',m.open_live_rows,'invalid_revisions',m.invalid_revisions,'invalid_required_fields',m.invalid_required_fields,'min_revision',m.min_revision,'max_revision',m.max_revision,'last_update',m.last_memory_update_at),
  'conflicts',jsonb_build_object('total',c.total,'last_7d',c.last_7d,'last_at',c.last_at),
  'inbox',jsonb_build_object('pending',i.pending,'oldest_pending',i.oldest_pending,'consumed',i.consumed),
  'events',jsonb_build_object('live',e.live_events,'soft_deleted',e.soft_deleted_events,'live_links',l.live_links,'broken_event_links',l.broken_event_links,'broken_memory_links',l.broken_memory_links,'impossible_revision_links',l.impossible_revision_links,'accepted_without_event',ca.accepted_without_event,'nonaccepted_with_event',ca.nonaccepted_with_event),
  'security',to_jsonb(s),
  'pass',m.total_rows=m.unique_ids and m.invalid_revisions=0 and m.invalid_required_fields=0
    and i.pending=0 and l.broken_event_links=0 and l.broken_memory_links=0 and l.impossible_revision_links=0
    and ca.accepted_without_event=0 and ca.nonaccepted_with_event=0
    and s.memories_rls_forced and s.memory_physical_delete_blocked and s.event_direct_insert_blocked and s.link_direct_insert_blocked
    and s.accept_rpc_app_only and s.accept_rpc_anon_blocked and s.accept_rpc_service_blocked,
  'manual_gates',jsonb_build_array('App 离线待发送=0','当天 App 逐 ID 指纹报告全绿','三份私人备份已保存并记录 SHA-256','每条 conflict 均已解释；非零不自动判数据丢失')
) audit_report
from m cross join conflicts c cross join inbox i cross join events e cross join links l cross join candidates ca cross join security s;

