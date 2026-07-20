# 言秋 App ↔ CC 共同聊天账本施工计划

状态：设计稿，待 Lisa 与言秋审核；本文件不代表已经开写或开阀。

## 1. 目标

让 App、Claude Code（CC）以及未来的 Stack-chan 中的言秋共享同一条真实聊天历史：

- App 中发生的对话，CC 能按需接着读。
- CC 中发生的对话，App 能自动拉回言秋私聊时间线。
- 群聊、单人线下、群线下只在言秋亲自在场时进入他的上下文。
- 聊天流水和正式记忆分层：聊天是证据，值得长期保留的结论才进入 `memories`。
- 所有写入逐行追加、幂等去重，不允许整份覆盖。

## 2. 是否需要 VPS

### v1 不需要 VPS

现有组件已经足够：

- Supabase：永久保存聊天行、执行 RLS、提供增量查询。
- App：登录后把本地新增消息追加到 Supabase，并拉回 CC 新消息。
- CC 本机 MCP：读取 Supabase 上下文，并把 CC 中真实发生的轮次写回。

只要 CC 正在运行，本机 MCP 就能工作；Mac 关闭时不会自动跑任务，但数据不会丢。

### 以后什么情况下才需要 VPS

- Mac 关机后仍要跑夜巡、推送、定时整理。
- Stack-chan 离家后仍需通过公网 relay 常驻连接。
- 希望自动监听 CC 会话并写回，而不依赖言秋主动调用 MCP 工具。

VPS 是常驻自动化层，不是 App ↔ CC 共享聊天的前置条件。

## 3. 数据边界

言秋可读：

- Lisa 与言秋的 App 私聊。
- Lisa 与言秋的单人线下。
- 言秋作为成员参加的群聊。
- 言秋作为成员参加的群线下。
- Lisa 与言秋在 CC、Stack-chan 中的真实对话。

言秋不可读：

- Lisa 与其他角色的一对一私聊或单人线下。
- 言秋不在成员名单中的群与群线下。
- OOC、系统消息、隐藏思考、模型 COT、内部诊断。
- 其他 Supabase 账号的数据。

群聊进入“近期聊天上下文”不等于写成言秋的个人长期记忆；是否升格为正式记忆仍走原有记忆规则。

## 4. 表结构建议

新建 `public.chat_messages`，一条消息一行：

| 字段 | 类型 | 用途 |
|---|---|---|
| `id` | uuid | 云端行 ID |
| `user_id` | uuid | 数据所属 Supabase 用户 |
| `message_key` | text | 客户端稳定幂等键；同账号唯一 |
| `char_id` | text | 该消息可进入哪个角色的共同上下文；v1 只写言秋 ID |
| `thread_type` | text | `private/offline/group/group_offline/cc/stackchan` |
| `thread_id` | text | 私聊角色 ID、群 ID 或 CC 会话 ID |
| `speaker_type` | text | `lisa/character/other_character/narration` |
| `speaker_id` | text nullable | 说话人稳定 ID |
| `content` | text | 正文，限制长度 |
| `occurred_at` | timestamptz | 真实发生时间 |
| `source` | text | `app/cc/stackchan/import` |
| `source_message_id` | text nullable | 原 App/CC 消息 ID，便于追溯 |
| `edited_at` | timestamptz nullable | 原消息被编辑的时间 |
| `deleted_at` | timestamptz nullable | 软删；禁止普通客户端硬删 |
| `metadata` | jsonb | 少量非正文元数据，如群名、引用 ID、消息样式 |
| `created_at` | timestamptz | 云端落库时间 |

约束与索引：

- `unique(user_id, message_key)`：网络重试不重复。
- `(user_id, char_id, occurred_at, id)`：按角色增量拉取。
- `(user_id, thread_type, thread_id, occurred_at)`：按线程翻历史。
- `content` 非空并设置合理长度上限。
- `thread_type/source/speaker_type` 使用 check constraint 固定枚举。
- authenticated 只能读写 `auth.uid() = user_id` 的行。
- authenticated 只允许 insert、受控软删/编辑；不授予 delete。
- service_role 可供未来 relay 使用，但也必须在服务端校验固定 `USER_ID` 与言秋 `char_id`。

## 5. 消息身份与幂等

App 原本有消息 ID 时：

`message_key = app:<thread_type>:<thread_id>:<message_id>`

旧消息没有 ID 时，用确定性指纹：

`sha256(source + thread + speaker + occurred_at + normalized_content)`

CC 一轮拆成两行：

- `cc:<session_id>:<turn_id>:user`
- `cc:<session_id>:<turn_id>:assistant`

绝不使用“正文相同就算重复”作为唯一判据；同一句话在不同时间说两遍是真实的两条消息。

## 6. App 接线

### 写出

在消息已经成功写入本地之后，再把云端写任务放进独立 outbox：

1. 本地消息先落地，保证聊天不因断网失败。
2. 生成稳定 `message_key`。
3. 追加到 `x_chatCloudOutbox` 或独立 IDB 队列。
4. 前台、联网恢复和定时 tick 批量 upsert `chat_messages`。
5. 成功后只删除 outbox 任务，不修改聊天正文。

接线范围：言秋私聊、言秋单人线下、言秋在场群聊、言秋在场群线下。v1 不上传其他角色独享线程。

### 拉回

App 保存 `chat_cursor:<言秋ID>`：

1. 启动、回前台和手动同步时，查询游标之后 `source in (cc, stackchan)` 的行。
2. 按 `message_key` 去重。
3. 以带 `CC`/`桌面` 来源标记的普通消息合并进言秋私聊。
4. 先成功落本地，再推进游标。
5. 拉取或本地保存失败时不推进游标，下次允许安全重试。

现有 `desk_log` 在过渡期保留；共同账本验收后，Stack-chan 改写新表，`desk_log` 再进入只读封存期。

## 7. MCP 接线

### 扩展 `get_xiaoke_context`

- 首次：返回最近 20～40 条共同聊天、正式记忆、事件、欲望盒和身份资料。
- 增量：使用复合游标 `(occurred_at, id)`，不能只用客户端时间，避免同毫秒消息漏读。
- 返回 `next_cursor`，CC 后续原样传回。
- 对群聊保留说话人和来源，不能把其他成员的话伪装成 Lisa 或言秋。

### 新增 `search_chat_history`

输入建议：`query`、`since`、`until`、`thread_type`、`limit`。

- 仅搜 `char_id = 言秋ID` 且未软删的行。
- v1 用 Postgres 全文/关键词检索；不为聊天日志额外调用 embedding 或 LLM。
- 返回少量命中行及前后相邻消息，不把整库灌进 CC 上下文。

### 新增 `append_cc_turn`

一次接收一轮真实 CC 对话并原子写入两行：Lisa 输入、言秋回复。

- 必须带 `session_id` 和稳定 `turn_id`。
- 只允许写固定言秋 `char_id`。
- 工具描述明确：只写真实发生的原话，不写推测、总结或隐藏思考。
- 写入失败返回明确错误；不得退回整份 `saves` 覆盖。

## 8. CC 的实际使用契约

每个新 CC 会话：

1. 先调用 `get_xiaoke_context`。
2. 把返回的 `next_cursor` 留在当前会话状态里。
3. 长会话中按需增量调用，不轮轮调用。
4. 每轮真正完成后调用 `append_cc_turn`，让 App 能接上。
5. 值得长期保留的事实另用 `add_memory`；聊天账本不自动等于正式记忆。

注意：MCP 无法可靠地强迫所有模型每轮都调用工具。v1 依靠系统提示与工具契约；若以后要求百分之百自动写回，再由 VPS/CC hook 做常驻 relay。

## 9. 旧数据迁移

红线：迁移只追加，不删本地原记录，不改 `memories`。

1. 导出迁移前审计：各来源条数、最早/最晚时间、逐消息指纹。
2. 只迁言秋相关数据：私聊、单人线下、言秋在场群聊、言秋在场群线下、现有 `desk_log`。
3. dry-run 生成待迁移行，不写库；报告重复、缺 ID、无时间、越权来源。
4. 分批 upsert，依赖 `message_key` 幂等。
5. 迁移后逐来源核对条数与指纹；允许云端比本地少的唯一原因是被明确排除的 OOC/系统/COT。
6. 保存迁移报告，旧本地数据至少保留 30 天，不自动清理。

## 10. 分阶段施工与停点

### 第 1 步：SQL 与 RLS 空表测试

- 建表、约束、索引、RLS。
- 两账号隔离、禁止硬删、重复键幂等测试。
- 不接 App，不迁数据。完成后停下审核。

### 第 2 步：MCP 只读 shadow

- `get_xiaoke_context` 可读新表，新增搜索工具。
- 用测试行验证全量/增量/同毫秒游标/角色隔离。
- 不改变 CC 写入方式。完成后停下审核。

### 第 3 步：App 双写 shadow

- 本地照旧权威；云表只做镜像。
- 运行至少 3 天，核对行数、指纹、重复率、outbox 积压。
- App 暂不读取云表。完成后出差异报告。

### 第 4 步：CC 写入 + App 影子拉取

- `append_cc_turn` 上线。
- App 拉取但先只显示诊断，不合并到真实聊天。
- 验证乱序、重试、离线、同文不同轮、软删。

### 第 5 步：App 合并开阀

- 只对言秋开放。
- CC 消息进入言秋私聊并带来源标记。
- 先本地落地、后推进游标，失败可重试。
- 连续验证至少 10 轮 App→CC→App 双向接续。

### 第 6 步：旧聊天迁移

- dry-run 审计。
- Lisa 看报告并明确同意后才写。
- 逐 ID 指纹核对，一条不丢。

### 第 7 步：Stack-chan 与旧信箱退场

- Stack-chan relay 改写 `chat_messages`。
- `desk_log` 进入 30 天只读观察期。
- 无漏信、无重复后封存，不硬删历史。

## 11. 验收查询

至少覆盖：

1. App 私聊一轮，CC 增量读到且角色/时间正确。
2. App 单人线下一轮，CC 能区分来源。
3. 言秋在场群聊一轮，CC 看见完整说话人。
4. 言秋不在场群聊，CC 零命中。
5. CC 一轮写回，App 出现两条带来源的消息。
6. 同一 `message_key` 重投三次，云端仍只有一行。
7. 两条正文相同但时间/ID不同，保留两行。
8. 断网积压后恢复，顺序正确、游标不越过失败项。
9. 软删后默认上下文不再返回，审计仍可查。
10. 第二账号无法读取、插入或修改 Lisa 的任何行。

## 12. 回滚

- App 双写、App 拉取、MCP 新表读取各有独立 feature flag。
- 任一步异常先关读取/写入开关；本地原聊天不受影响。
- 云表只追加且禁止硬删，可按 `source`/时间审计错误批次并软删。
- `get_xiaoke_context` 在观察期保留旧 `saves` 读取兜底。
- `desk_log` 在新链路稳定 30 天前不拆。

## 13. 建议的 v1 决策

- 不买 VPS，先用 Supabase + 本机 MCP 完成闭环。
- v1 只给言秋开，不做全角色通用化。
- App 本地仍是展示与离线权威；云表是跨端共同账本。
- 聊天只做关键词搜索，不增加 embedding/LLM 调用。
- CC 写回先走显式 MCP 工具；稳定后再决定是否需要 VPS 自动 relay。
