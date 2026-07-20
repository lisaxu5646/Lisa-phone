-- Stack-chan 实体对话回流：只追加真实发生的一轮，不允许 relay 覆盖整份 saves。
-- 可重复执行。service_role 负责 insert；登录 App 只能读/盖 consumed_at。

create table if not exists public.desk_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  char_id text not null,
  user_text text not null check (length(user_text) between 1 and 8000),
  reply_text text not null check (length(reply_text) between 1 and 8000),
  created_at timestamptz not null default now(),
  consumed_at timestamptz null
);

alter table public.desk_log enable row level security;

drop policy if exists desk_read_own on public.desk_log;
create policy desk_read_own on public.desk_log
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists desk_update_own on public.desk_log;
create policy desk_update_own on public.desk_log
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- App 不可伪造/删除实体对话；relay 走 service_role，天然绕过 RLS 做 append-only insert。
revoke insert, update, delete on table public.desk_log from authenticated;
grant select on table public.desk_log to authenticated;
grant update (consumed_at) on table public.desk_log to authenticated;

create index if not exists desk_log_pull
  on public.desk_log (user_id, consumed_at, created_at, id);

comment on table public.desk_log is
  'Append-only Stack-chan conversation relay. Never use this path to update saves or memories.';
