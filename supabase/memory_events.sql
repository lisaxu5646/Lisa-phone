-- ============================================================
-- ⑥ 事件层 · 第 1 步建表（正式版，2026-07-17 由 _draft 转正）
-- 转正依据：⑤ 权威切换验收通过（474/474 零差异，见 memory_shadow_exit_runbook.md），
-- 总闸门各项已满足。部署方式：Lisa 在 Supabase SQL Editor 整份执行一次（幂等，可重跑）。
-- 部署后跑同目录 memory_events_rls_test.sql 验收，全绿才进第 2 步联调。
-- ============================================================

-- Formal first-person events. Source memory text is never copied into this table.
create table if not exists public.memory_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id <> ''),
  title text not null check (length(btrim(title)) between 1 and 80),
  narrative text not null check (length(btrim(narrative)) > 0),
  synopsis text not null default '' check (length(synopsis) <= 200),
  char_ids text[] not null default '{}'::text[],
  author_char_id text not null check (author_char_id <> ''),
  started_ts bigint not null,
  ended_ts bigint,
  status text not null default 'ongoing' check (status in ('ongoing', 'closed')),
  themes text[] not null default '{}'::text[],
  v smallint not null default 0 check (v between -5 and 5),
  a smallint not null default 1 check (a between 0 and 5),
  state_before text,
  turning_point text,
  state_after text,
  source text not null default 'cc_manual_selection' check (source = 'cc_manual_selection'),
  edited_by_user boolean not null default false,
  deleted boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (ended_ts is null or ended_ts >= started_ts),
  check ((status = 'ongoing' and ended_ts is null) or status = 'closed')
);

comment on table public.memory_events is
  'Confirmed first-person event narratives. Every formal row requires Lisa approval through a future atomic RPC.';
comment on column public.memory_events.edited_by_user is
  'True when Lisa edited the CC draft before confirmation; the UI must disclose this.';
comment on column public.memory_events.deleted is
  'Soft-delete tombstone. Physical DELETE is never granted to app clients.';

-- Persistent App <-> CC candidate workbench. A candidate is never a formal event.
create table if not exists public.memory_event_candidates (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id <> ''),
  status text not null default 'requested'
    check (status in ('requested', 'drafted', 'accepted', 'rejected', 'expired')),
  source_memory_ids text[] not null,
  requested_char_id text not null check (requested_char_id <> ''),
  draft jsonb,
  base_memory_revisions jsonb not null default '{}'::jsonb,
  feedback text,
  idempotency_key text not null check (idempotency_key <> ''),
  edited_by_user boolean not null default false,
  accepted_event_id text,
  revision bigint not null default 1 check (revision > 0),
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, idempotency_key),
  unique (user_id, last_mutation_id),
  unique (user_id, accepted_event_id),
  foreign key (user_id, accepted_event_id)
    references public.memory_events(user_id, id) on delete restrict,
  check (cardinality(source_memory_ids) between 2 and 30),
  check (accepted_event_id is null or status = 'accepted'),
  check (status <> 'drafted' or draft is not null),
  check (status <> 'accepted' or (draft is not null and accepted_event_id is not null))
);

comment on table public.memory_event_candidates is
  'Human-in-the-loop workbench: App requests, CC drafts, Lisa accepts/rejects. Draft rows are not memories or formal events.';
comment on column public.memory_event_candidates.source_memory_ids is
  'Exactly 2-30 manually selected memories. Soft-deleted memories are rejected by the future accept RPC.';

-- Event-to-fragment references. No memory text is duplicated here.
create table if not exists public.memory_event_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  memory_id text not null,
  relation text not null default 'evidence'
    check (relation in ('context', 'evidence', 'turning_point', 'outcome')),
  weight real not null default 1 check (weight >= 0 and weight <= 1),
  ordinal integer not null default 0 check (ordinal >= 0),
  memory_revision_at_link bigint not null check (memory_revision_at_link > 0),
  deleted boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  last_mutation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id, memory_id),
  unique (user_id, last_mutation_id),
  foreign key (user_id, event_id)
    references public.memory_events(user_id, id) on delete restrict,
  foreign key (user_id, memory_id)
    references public.memories(user_id, id) on delete restrict
);

comment on table public.memory_event_links is
  'Stable references from confirmed events to memory fragments. Fragment archive/soft-delete never cascades to events.';
comment on column public.memory_event_links.memory_revision_at_link is
  'Memory revision seen at confirmation time. It is audit metadata, not a copied text snapshot.';

-- Server-maintained revisions for all three mutable row stores.
create or replace function public.touch_memory_event_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := coalesce(new.created_at, now());
  else
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists memory_events_touch_revision on public.memory_events;
create trigger memory_events_touch_revision
before insert or update on public.memory_events
for each row execute function public.touch_memory_event_revision();

drop trigger if exists memory_event_candidates_touch_revision on public.memory_event_candidates;
create trigger memory_event_candidates_touch_revision
before insert or update on public.memory_event_candidates
for each row execute function public.touch_memory_event_revision();

drop trigger if exists memory_event_links_touch_revision on public.memory_event_links;
create trigger memory_event_links_touch_revision
before insert or update on public.memory_event_links
for each row execute function public.touch_memory_event_revision();

create index if not exists memory_events_user_updated_idx
  on public.memory_events (user_id, updated_at, id);
create index if not exists memory_events_user_live_status_idx
  on public.memory_events (user_id, deleted, status, updated_at, id);
create index if not exists memory_events_char_ids_gin_idx
  on public.memory_events using gin (char_ids);
create index if not exists memory_events_themes_gin_idx
  on public.memory_events using gin (themes);
create unique index if not exists memory_events_mutation_uidx
  on public.memory_events (user_id, last_mutation_id)
  where last_mutation_id is not null;

create index if not exists memory_event_candidates_user_status_idx
  on public.memory_event_candidates (user_id, status, updated_at, id);
create index if not exists memory_event_links_event_idx
  on public.memory_event_links (user_id, event_id, deleted, ordinal);
create index if not exists memory_event_links_memory_idx
  on public.memory_event_links (user_id, memory_id, deleted);

alter table public.memory_events enable row level security;
alter table public.memory_events force row level security;
alter table public.memory_event_candidates enable row level security;
alter table public.memory_event_candidates force row level security;
alter table public.memory_event_links enable row level security;
alter table public.memory_event_links force row level security;

-- Formal events and links are read-only to the app in v1. A future SECURITY DEFINER accept RPC
-- will atomically create them after Lisa confirms a drafted candidate.
revoke all on table public.memory_events from anon, authenticated;
revoke all on table public.memory_event_candidates from anon, authenticated;
revoke all on table public.memory_event_links from anon, authenticated;

grant select on table public.memory_events to authenticated;
grant select, insert, update on table public.memory_event_candidates to authenticated;
grant select on table public.memory_event_links to authenticated;

drop policy if exists memory_events_select_own on public.memory_events;
create policy memory_events_select_own
on public.memory_events for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists memory_event_candidates_select_own on public.memory_event_candidates;
create policy memory_event_candidates_select_own
on public.memory_event_candidates for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists memory_event_candidates_insert_own on public.memory_event_candidates;
create policy memory_event_candidates_insert_own
on public.memory_event_candidates for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'requested'
  and draft is null
  and accepted_event_id is null
);

drop policy if exists memory_event_candidates_update_own on public.memory_event_candidates;
create policy memory_event_candidates_update_own
on public.memory_event_candidates for update to authenticated
using ((select auth.uid()) = user_id and status <> 'accepted')
with check ((select auth.uid()) = user_id and status <> 'accepted');

drop policy if exists memory_event_links_select_own on public.memory_event_links;
create policy memory_event_links_select_own
on public.memory_event_links for select to authenticated
using ((select auth.uid()) = user_id);

-- Deliberately absent in this draft:
-- 1. accept_memory_event_candidate RPC (implementation step 6).
-- 2. App/MCP code and event injection.
-- 3. automatic clustering.
-- 4. Any deployment during the ⑤ shadow period.
