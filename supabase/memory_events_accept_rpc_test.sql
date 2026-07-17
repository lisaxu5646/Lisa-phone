-- ============================================================
-- ⑥事件层 · 第6步原子确认验收
-- 先部署 memory_events_accept_rpc.sql，再在 SQL Editor 整份执行本文件。
-- 全部夹在事务内，末尾 ROLLBACK：不会留下测试记忆、候选、事件或触发器。
-- 成功输出：NOTICE: accept_memory_event_candidate rollback/idempotency tests passed
-- ============================================================

begin;

do $$
declare
  uid uuid;
  c_id text;
  m1 constant text := '__accept_rpc_mem_1';
  m2 constant text := '__accept_rpc_mem_2';
  m_deleted constant text := '__accept_rpc_mem_deleted';
  draft jsonb;
  mutation uuid;
  result1 jsonb;
  result2 jsonb;
  failed boolean;
  event_id text;
  before_events bigint;
  before_links bigint;
begin
  select user_id into uid from public.memories order by user_id limit 1;
  if uid is null then raise exception 'TEST SETUP: memories needs at least one owner'; end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.memories(user_id,id,text,char_ids,ts,deleted) values
    (uid,m1,'accept RPC fixture one',array['小克'],1,false),
    (uid,m2,'accept RPC fixture two',array['小克'],2,false),
    (uid,m_deleted,'accept RPC deleted fixture',array['小克'],3,true);

  draft := jsonb_build_object(
    'title','原子确认测试','narrative','这是一篇只存在于回滚事务里的测试事件。','synopsis','测试',
    'author_char_id','小克','started_ts',1,'ended_ts',2,'status','closed','themes',jsonb_build_array('测试'),
    'v',1,'a',1,'links',jsonb_build_array(
      jsonb_build_object('memory_id',m1,'relation','context','weight',1),
      jsonb_build_object('memory_id',m2,'relation','outcome','weight',1)
    )
  );
  select count(*) into before_events from public.memory_events where user_id=uid;
  select count(*) into before_links from public.memory_event_links where user_id=uid;

  -- 候选缺失。
  failed := false;
  begin perform public.accept_memory_event_candidate('__missing',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'missing candidate was accepted'; end if;

  -- 非 drafted、candidate revision 漂移。
  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_requested','requested',array[m1,m2],'小克',null,jsonb_build_object(m1,1,m2,1),'test-requested');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_requested',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'requested candidate was accepted'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_revision','drafted',array[m1,m2],'小克',draft,jsonb_build_object(m1,1,m2,1),'test-revision');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_revision',99,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'candidate revision drift was accepted'; end if;

  -- 重复 / 缺失(也覆盖跨用户不可见) / soft-delete / source revision 漂移。
  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_duplicate','drafted',array[m1,m1],'小克',draft,jsonb_build_object(m1,1),'test-duplicate');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_duplicate',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'duplicate sources were accepted'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_missing_source','drafted',array[m1,'__not_owned_or_missing'],'小克',draft,jsonb_build_object(m1,1,'__not_owned_or_missing',1),'test-missing-source');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_missing_source',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'missing/cross-user source was accepted'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_deleted','drafted',array[m1,m_deleted],'小克',draft,jsonb_build_object(m1,1,m_deleted,1),'test-deleted');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_deleted',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'soft-deleted source was accepted'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_source_revision','drafted',array[m1,m2],'小克',draft,jsonb_build_object(m1,999,m2,1),'test-source-revision');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_source_revision',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'source revision drift was accepted'; end if;

  -- draft 缺字段、外部 link、越界 relation/weight。
  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_bad_draft','drafted',array[m1,m2],'小克',draft-'narrative',jsonb_build_object(m1,1,m2,1),'test-bad-draft');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_bad_draft',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'incomplete draft was accepted'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_bad_links','drafted',array[m1,m2],'小克',jsonb_set(draft,'{links,1}',jsonb_build_object('memory_id','__external','relation','wrong','weight',2)),jsonb_build_object(m1,1,m2,1),'test-bad-links');
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_bad_links',1,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed then raise exception 'external/invalid link was accepted'; end if;

  -- 表约束先于 RPC 挡住少于 2 / 多于 30；坏候选本身也不会落库。
  failed := false;
  begin
    insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
    values(uid,'__accept_rpc_too_few','drafted',array[m1],'小克',draft,jsonb_build_object(m1,1),'test-too-few');
  exception when others then failed := true; end;
  if not failed then raise exception 'candidate with fewer than 2 sources was stored'; end if;
  failed := false;
  begin
    insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
    values(uid,'__accept_rpc_too_many','drafted',array_fill(m1,array[31]),'小克',draft,jsonb_build_object(m1,1),'test-too-many');
  exception when others then failed := true; end;
  if not failed then raise exception 'candidate with more than 30 sources was stored'; end if;

  -- 故障注入：event insert / 任一 link insert / candidate 回填分别炸掉；每次都必须整笔回滚。
  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_event_fail','drafted',array[m1,m2],'小克',draft,jsonb_build_object(m1,1,m2,1),'test-event-fail');
  execute 'create function public.__accept_rpc_fail_event() returns trigger language plpgsql as ''begin raise exception ''''injected event failure''''; end''';
  execute 'create trigger __accept_rpc_fail_event before insert on public.memory_events for each row execute function public.__accept_rpc_fail_event()';
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_event_fail',1,gen_random_uuid(),null); exception when others then failed := true; end;
  execute 'drop trigger __accept_rpc_fail_event on public.memory_events'; execute 'drop function public.__accept_rpc_fail_event()';
  if not failed then raise exception 'injected event failure did not fail'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_link_fail','drafted',array[m1,m2],'小克',draft,jsonb_build_object(m1,1,m2,1),'test-link-fail');
  execute 'create function public.__accept_rpc_fail_link() returns trigger language plpgsql as ''begin raise exception ''''injected link failure''''; end''';
  execute 'create trigger __accept_rpc_fail_link before insert on public.memory_event_links for each row execute function public.__accept_rpc_fail_link()';
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_link_fail',1,gen_random_uuid(),null); exception when others then failed := true; end;
  execute 'drop trigger __accept_rpc_fail_link on public.memory_event_links'; execute 'drop function public.__accept_rpc_fail_link()';
  if not failed then raise exception 'injected link failure did not fail'; end if;

  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,'__accept_rpc_candidate_fail','drafted',array[m1,m2],'小克',draft,jsonb_build_object(m1,1,m2,1),'test-candidate-fail');
  execute 'create function public.__accept_rpc_fail_candidate() returns trigger language plpgsql as ''begin if new.status=''''accepted'''' then raise exception ''''injected candidate failure''''; end if; return new; end''';
  execute 'create trigger __accept_rpc_fail_candidate before update on public.memory_event_candidates for each row execute function public.__accept_rpc_fail_candidate()';
  failed := false;
  begin perform public.accept_memory_event_candidate('__accept_rpc_candidate_fail',1,gen_random_uuid(),null); exception when others then failed := true; end;
  execute 'drop trigger __accept_rpc_fail_candidate on public.memory_event_candidates'; execute 'drop function public.__accept_rpc_fail_candidate()';
  if not failed then raise exception 'injected candidate fill failure did not fail'; end if;

  -- 成功、同 mutation 重试、不同 mutation 不能二次确认。
  c_id := '__accept_rpc_success'; mutation := gen_random_uuid();
  insert into public.memory_event_candidates(user_id,id,status,source_memory_ids,requested_char_id,draft,base_memory_revisions,idempotency_key)
  values(uid,c_id,'drafted',array[m1,m2],'小克',draft,jsonb_build_object(m1,1,m2,1),'test-success');
  result1 := public.accept_memory_event_candidate(c_id,1,mutation,jsonb_build_object('title','Lisa 改过的标题'));
  result2 := public.accept_memory_event_candidate(c_id,1,mutation,jsonb_build_object('title','重试不应再改'));
  if result1->'event'->>'id' <> result2->'event'->>'id' or coalesce((result2->>'idempotent')::boolean,false) is not true then
    raise exception 'same mutation did not return the same event';
  end if;
  event_id := result1->'event'->>'id';
  if (select count(*) from public.memory_events where user_id=uid and id=event_id) <> 1
     or (select count(*) from public.memory_event_links where user_id=uid and event_id=event_id) <> 2
     or (select status from public.memory_event_candidates where user_id=uid and id=c_id) <> 'accepted' then
    raise exception 'successful acceptance did not create exactly 1 event + 2 links + accepted candidate';
  end if;
  failed := false;
  begin perform public.accept_memory_event_candidate(c_id,2,gen_random_uuid(),null); exception when others then failed := true; end;
  if not failed or (select count(*) from public.memory_events where user_id=uid) <> before_events + 1 then
    raise exception 'second mutation created another event';
  end if;

  -- 所有失败候选仍未 accepted；除了上面的成功用例，events/links 没有额外增长。
  if exists (select 1 from public.memory_event_candidates where user_id=uid and id like '__accept_rpc_%' and id<>c_id and status='accepted') then
    raise exception 'a failed candidate was partially accepted';
  end if;
  if (select count(*) from public.memory_events where user_id=uid) <> before_events + 1
     or (select count(*) from public.memory_event_links where user_id=uid) <> before_links + 2 then
    raise exception 'a failed path left partial event/link rows';
  end if;
  if has_function_privilege('anon','public.accept_memory_event_candidate(text,bigint,uuid,jsonb)','execute')
     or has_function_privilege('service_role','public.accept_memory_event_candidate(text,bigint,uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.accept_memory_event_candidate(text,bigint,uuid,jsonb)','execute') then
    raise exception 'RPC execute grants are unsafe';
  end if;
  raise notice 'accept_memory_event_candidate rollback/idempotency tests passed';
end $$;

-- 真并发验收需两个 SQL Editor 标签同时调用同一 drafted candidate、不同 mutation。
-- 预期：一个成功；另一个在候选行锁释放后看到 accepted 并失败；最终仍仅 1 event。
-- 函数按 candidate FOR UPDATE → sources ORDER BY id FOR UPDATE 的固定锁序保证该结论。

rollback;
