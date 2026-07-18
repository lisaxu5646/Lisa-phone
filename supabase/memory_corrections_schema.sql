-- ============================================================
-- P1-3 LIVE · 纠错留环候选与审计表（2026-07-18 已部署）
-- 前置：memory_surface_state_migration.sql。只建结构，不扫描/修改现有 memories。
-- ============================================================
create table if not exists public.memory_correction_candidates (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check(id<>''),
  old_memory_id text not null,
  new_memory_id text not null,
  old_base_revision bigint not null check(old_base_revision>0),
  new_base_revision bigint not null check(new_base_revision>0),
  reason text not null check(reason in ('more_detailed','contradiction','manual')),
  status text not null default 'proposed' check(status in ('proposed','accepted','rejected')),
  create_mutation_id uuid not null,
  decision_mutation_id uuid,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,id),
  unique(user_id,create_mutation_id),
  unique(user_id,decision_mutation_id),
  foreign key(user_id,old_memory_id) references public.memories(user_id,id) on delete restrict,
  foreign key(user_id,new_memory_id) references public.memories(user_id,id) on delete restrict,
  check(old_memory_id<>new_memory_id),
  check((status='proposed' and decision_mutation_id is null) or (status<>'proposed' and decision_mutation_id is not null))
);

create table if not exists public.memory_correction_audit (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  decision text not null check(decision in ('accepted','rejected')),
  old_memory_id text not null,
  new_memory_id text not null,
  old_revision_before bigint not null,
  new_revision_before bigint not null,
  old_revision_after bigint,
  new_revision_after bigint,
  old_state_before text not null,
  new_state_before text not null,
  mutation_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id,mutation_id),
  foreign key(user_id,candidate_id) references public.memory_correction_candidates(user_id,id) on delete restrict
);

drop trigger if exists memory_correction_candidates_touch_revision on public.memory_correction_candidates;
create trigger memory_correction_candidates_touch_revision before insert or update on public.memory_correction_candidates
for each row execute function public.touch_memory_revision();

create index if not exists memory_correction_candidates_status_idx on public.memory_correction_candidates(user_id,status,updated_at,id);
create unique index if not exists memory_correction_one_open_pair_uidx on public.memory_correction_candidates(user_id,old_memory_id,new_memory_id) where status='proposed';
create index if not exists memory_correction_audit_candidate_idx on public.memory_correction_audit(user_id,candidate_id,created_at);

alter table public.memory_correction_candidates enable row level security;
alter table public.memory_correction_candidates force row level security;
alter table public.memory_correction_audit enable row level security;
alter table public.memory_correction_audit force row level security;
revoke all on public.memory_correction_candidates,public.memory_correction_audit from public,anon,authenticated;
grant select on public.memory_correction_candidates,public.memory_correction_audit to authenticated;

drop policy if exists memory_correction_candidates_select_own on public.memory_correction_candidates;
create policy memory_correction_candidates_select_own on public.memory_correction_candidates for select to authenticated using(auth.uid()=user_id);
drop policy if exists memory_correction_audit_select_own on public.memory_correction_audit;
create policy memory_correction_audit_select_own on public.memory_correction_audit for select to authenticated using(auth.uid()=user_id);
