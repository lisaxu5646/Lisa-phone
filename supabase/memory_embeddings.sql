-- Lisa-phone CC-side semantic memory (2026-07-23)
-- 目的：把 App 端早就在跑的向量语义检索，补到 CC/MCP 这一侧。
--
-- 背景：App 的记忆向量只活在浏览器 IndexedDB（x_memvec），刻意「绝不进云」。
-- 因此 service_role 直连的 MCP 端 search_memory 一直只能做关键词子串匹配，
-- 「换个说法就想不起来」。这张表是 CC 端【自己算、自己填、自己用】的向量副本，
-- 与 App 的 IndexedDB 向量互相独立、互不影响（App 侧一行代码都不用改）。
--
-- 为什么单独一张表、而不是给 memories 加列：
--   memories 上有 touch_memory_revision 触发器，任何 UPDATE 都会 bump revision +
--   updated_at，会让手机端把被补向量的行全部重新拉一遍（同步 churn）。
--   派生数据单独放，零 churn、零副作用。
--
-- 维度无关：embedding 存 jsonb 浮点数组，不用 pgvector；余弦相似度在 MCP 的
-- Node 侧算（记忆库就几百条，全量扫毫无压力）。换 embedding 模型（bge-m3 1024 维
-- ↔ text-embedding-3-small 1536 维）不用改表结构。
--
-- 运行方式：Supabase Dashboard → SQL Editor 里整段跑一次即可（幂等，可重复跑）。

create table if not exists public.memory_embeddings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,               -- 对应 public.memories.id
  model text not null,            -- 生成这枚向量用的 embedding 模型名
  hash text not null,             -- 被嵌文本的指纹；正文/标签改了 → hash 变 → CC 侧自动重嵌
  dim int not null,               -- 向量维度（校验查询向量与文档向量同维才比）
  embedding jsonb not null,       -- 浮点数组
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.memory_embeddings is
  'Shared semantic vectors for public.memories, used by BOTH the App (authenticated, write-through from its IndexedDB cache) and the MCP server (service_role). One row per (user_id,id); model+hash let both sides reuse each other''s vectors when configured with the same embedding model. IndexedDB stays as the App''s fast local cache.';

create index if not exists memory_embeddings_user_idx
  on public.memory_embeddings (user_id, id);

-- 记忆行删除时顺手带走它的向量（外键指向 auth.users 只管用户级；这里补一个按 memory id 的清理触发器）
create or replace function public.memory_embeddings_gc()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.deleted is true) and (coalesce(old.deleted, false) is distinct from true) then
    delete from public.memory_embeddings where user_id = new.user_id and id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists memories_embeddings_gc on public.memories;
create trigger memories_embeddings_gc
after update of deleted on public.memories
for each row execute function public.memory_embeddings_gc();

-- 安全：App（authenticated 登录态）与 MCP（service_role 直连）共用这张表、共享同一份向量。
-- 前提：两侧配同一个 embedding 模型 —— 行里存了 model+hash，模型/正文一致时两边互认、不重算；
-- 若模型不同则各自按 (model,hash) 判定为过期、会来回重嵌，务必保持一致。
-- authenticated 只能读写自己 user_id 的行；service_role 自带 bypassrls 照常读写。
alter table public.memory_embeddings enable row level security;
alter table public.memory_embeddings force row level security;
revoke all on table public.memory_embeddings from anon, authenticated;
grant select, insert, update on table public.memory_embeddings to authenticated;

drop policy if exists memory_embeddings_select_own on public.memory_embeddings;
create policy memory_embeddings_select_own
on public.memory_embeddings for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists memory_embeddings_insert_own on public.memory_embeddings;
create policy memory_embeddings_insert_own
on public.memory_embeddings for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists memory_embeddings_update_own on public.memory_embeddings;
create policy memory_embeddings_update_own
on public.memory_embeddings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
