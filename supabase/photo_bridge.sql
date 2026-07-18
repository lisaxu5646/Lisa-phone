-- 照片桥 v1：只有 Lisa 主动分享的单张图片才进私有桶。
-- 图片 90 天后删掉；索引行保留并标记 expired_at，方便审计“曾分享过什么”。

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo_bridge',
  'photo_bridge',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.photo_bridge_index (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  caption text not null check (length(btrim(caption)) between 1 and 500),
  taken_at timestamptz,
  source text not null default 'album' check (source in ('chat', 'selfie', 'album')),
  char_id text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  bytes integer check (bytes is null or bytes > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  expired_at timestamptz,
  unique (user_id, storage_path)
);

create index if not exists photo_bridge_index_user_created_idx
  on public.photo_bridge_index (user_id, created_at desc);
create index if not exists photo_bridge_index_user_char_idx
  on public.photo_bridge_index (user_id, char_id, created_at desc)
  where expired_at is null;

alter table public.photo_bridge_index enable row level security;

drop policy if exists photo_bridge_index_select_own on public.photo_bridge_index;
create policy photo_bridge_index_select_own on public.photo_bridge_index
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists photo_bridge_index_insert_own on public.photo_bridge_index;
create policy photo_bridge_index_insert_own on public.photo_bridge_index
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists photo_bridge_index_update_own on public.photo_bridge_index;
create policy photo_bridge_index_update_own on public.photo_bridge_index
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists photo_bridge_index_delete_own on public.photo_bridge_index;
create policy photo_bridge_index_delete_own on public.photo_bridge_index
  for delete to authenticated using (auth.uid() = user_id);

-- Storage 路径固定为 <auth.uid()>/<photo-id>.jpg；别人的目录既看不到也写不进。
drop policy if exists photo_bridge_objects_select_own on storage.objects;
create policy photo_bridge_objects_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'photo_bridge' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photo_bridge_objects_insert_own on storage.objects;
create policy photo_bridge_objects_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photo_bridge' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photo_bridge_objects_update_own on storage.objects;
create policy photo_bridge_objects_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'photo_bridge' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photo_bridge' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photo_bridge_objects_delete_own on storage.objects;
create policy photo_bridge_objects_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'photo_bridge' and (storage.foldername(name))[1] = auth.uid()::text);

-- 给 service_role / 定时任务调用：先删到期物件，再软标索引；不硬删索引证据。
create or replace function public.expire_photo_bridge()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  affected integer := 0;
begin
  delete from storage.objects o
  using public.photo_bridge_index p
  where p.storage_path = o.name
    and o.bucket_id = 'photo_bridge'
    and p.expired_at is null
    and p.expires_at <= now();

  update public.photo_bridge_index
  set expired_at = now()
  where expired_at is null and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.expire_photo_bridge() from public, anon, authenticated;
grant execute on function public.expire_photo_bridge() to service_role;

