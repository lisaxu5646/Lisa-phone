-- ============================================================
-- P1-2 LIVE · 留档不浮现 schema（2026-07-18 已部署）
-- 与支持 surface_state 的 App v49.60、RPC、审计同窗启用。
-- 本文件不删除任何行；默认 active 保持现状。
-- ============================================================

alter table public.memories add column if not exists surface_state text not null default 'active';
alter table public.memories add column if not exists supersedes_id text;

do $ddl$
begin
  if not exists (select 1 from pg_constraint where conname='memories_surface_state_check' and conrelid='public.memories'::regclass) then
    alter table public.memories add constraint memories_surface_state_check
      check (surface_state in ('active','do_not_surface','superseded'));
  end if;
  if not exists (select 1 from pg_constraint where conname='memories_no_self_supersede' and conrelid='public.memories'::regclass) then
    alter table public.memories add constraint memories_no_self_supersede check (supersedes_id is null or supersedes_id<>id);
  end if;
  if not exists (select 1 from pg_constraint where conname='memories_supersedes_fk' and conrelid='public.memories'::regclass) then
    alter table public.memories add constraint memories_supersedes_fk
      foreign key(user_id,supersedes_id) references public.memories(user_id,id) on delete restrict;
  end if;
end;
$ddl$;

create index if not exists memories_user_surface_idx on public.memories(user_id,surface_state,deleted,updated_at,id);
create index if not exists memories_user_supersedes_idx on public.memories(user_id,supersedes_id) where supersedes_id is not null;

comment on column public.memories.surface_state is 'active=normal recall; do_not_surface=retained but hidden; superseded=retained old statement. Never physical-delete.';
comment on column public.memories.supersedes_id is 'On the newer active row, points to the older row it supersedes. P1-3 RPC only.';

-- 普通 App 仍可同步旧字段，但不能绕过专用 RPC 改 surface_state/supersedes_id。
revoke insert, update on table public.memories from authenticated;
grant insert (user_id,id,text,tags,char_ids,v,a,open,pinned,ts,archived,archived_batch,archived_ts,source,deleted,last_mutation_id) on public.memories to authenticated;
grant update (user_id,id,text,tags,char_ids,v,a,open,pinned,ts,archived,archived_batch,archived_ts,source,deleted,last_mutation_id) on public.memories to authenticated;
