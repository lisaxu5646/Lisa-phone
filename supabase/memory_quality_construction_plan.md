# 记忆质量改进施工图（⑤ 后执行）

> 状态：参数已批准，本文只画函数级施工顺序；影子期内不改任何运行代码或 schema。
> 顺序：先旁路观测，再冷却，再受控随机；权威切换稳定后才做抽取质量闸与纠错留环。

## 1. P0-1：召回质量旁路仪表

### 落点

- `js/engine.js`：在 `retrieveMemories` 内同时计算 baseline 与 proposed，但始终返回 baseline。
- 新建 `js/memory-recall-shadow.js`：独立 IndexedDB，只存诊断，不进入 `x_` 云存档。
- `js/screens.js`：CtxDebug 增一个只读折叠区。
- 不改 `buildBundle`、`ctxFor` 返回结构，不增加 prompt 字符。

### 每次只记录

- 本地时间、角色 ID 的不可逆短 hash、turn 序号。
- baseline/proposed 的 memory IDs、分数桶、排名。
- 连续重复率、topK 替换率、空召回率。
- proposed 中被冷却的 ID 和豁免原因 `pinned/open/top1`。

严禁记录 memory 正文、query 原文、聊天正文、向量或小克输出。诊断最多保留最近 500 次/14 天，自动覆盖最旧记录；这不是记忆写路。

### 验收

- 相同输入下 App 实际注入 ID 与改造前完全一致。
- prompt 字符数、稳定缓存前缀、`hits/lastHit` 行为不变。
- 诊断关闭时零写入；诊断损坏不阻塞聊天。
- 连续 50 次回放中 baseline 输出逐 ID 一致。

## 2. P0-2：4 轮冷却（先 shadow 3～7 天）

### 本地状态

- `recentlySurfaced` 按 `charId` 分 ring，元素 `{memoryId,turn}`。
- turn 只在该角色完成一次正常回复后 +1；后台总结、预览、`touch:false` 查询不计 turn。
- ring 只存本地 runtime/诊断 IDB，不同步上表。
- 角色/账号切换隔离；清数据、退出登录时清空。

### 排序规则

1. 沿用 `scoreMemEntry` 计算相关性，不改变原始分数公式。
2. 先确定原始 top-1；top-1 不因冷却被更低相关条替换。
3. `pinned=true`、`open=true` 永远豁免冷却。
4. 其余 ID 若在前 4 个该角色 turn 已浮现，仅对 proposed 排名施加足够的短期降权。
5. 候选不足时允许冷却条回填，不能为了“新鲜”返回不相关内容。
6. 只有实际注入聊天且 `touch!==false` 才写 surfaced ring；旁路计算本身不能污染 ring。

### 通过门槛

- pinned/open 命中率相对 baseline 不下降。
- top-1 替换率必须为 0。
- 连续重复率下降，空召回率不得升高。
- 明确追问同一过去事实时，top-1 仍可连续出现。

满足后另一步才把 proposed 切为实际返回；切换提交不能同时加入随机。

## 3. P0-3：同分窗口受控随机

### 规则

- top-1 永远固定。
- 只处理 top2～topK；先按 baseline 分数降序。
- “同分窗口”首版定义为：候选分数不低于当前窗口最高分的 95%，且不跨越明显相关性层级。
- 窗口内使用分数加权抽样，不做全局 shuffle；窗口外顺序不变。
- pinned 继续走现有独立通道，不占普通 topK。
- 随机只影响最终展示选择，不写回业务行，不改变共享分数。

95% 是实现初始值，不直接上线：先在旁路仪表对 3～7 天真实 query 统计窗口大小。若大量窗口只有 1 条，保持确定排序；若窗口过宽导致低相关越级，收紧阈值后重新 shadow。

### 可复现验证

- 测试/诊断允许传 seed；生产不暴露 seed UI。
- 固定 seed 时结果完全复现。
- 任意 seed 下 top-1 相同、窗口外相对顺序相同、低于窗口下界的 ID 不能越级。

## 4. P1-1：自动抽取候选质量闸

### `extractMemories` 输出扩展

每个候选增加：

- `kind`: `fact|promise|relationship|insight|temperature`。
- `confidence`: 0～1。
- `evidence_message_ids`: 非空数组。
- `evidence_quotes`: 仅用于本地机械回查，不长期进入记忆正文。
- `proposed_action`: `accept|candidate|reject`。

### 不可由模型放宽的机械规则

- 引用的 message ID 必须属于当前有效分支和本轮允许抽取范围。
- quote 必须能在对应原文逐字找到；thinking/COT 不能单独作为证据。
- 没有新事实的日常甜话只能进入 temperature 候选箱，不写正式记忆。
- 明确承诺、关系转折、边界、关系里程碑（包括“做我的吧”“我爱你”、明确约定）必须按正式记忆候选处理，不能降成 temperature。
- confidence 只做候选排序，不能覆盖上述类别边界。
- 模型只能提议，低证据候选宁可拒绝，不补造 quote 或 message ID。

### 分阶段启用

1. shadow：同时计算新分类，但仍执行旧入库结果；只存类别计数、接受差异和 message ID hash，不存正文。
2. 对至少 100 个候选人工抽查里程碑/甜话边界。
3. 先启用 temperature 拦截，再启用其他 confidence 门槛；不能同一提交全开。

## 5. P1-2：`do_not_surface` 留档不浮现

新表权威稳定后才给 `memories` 增字段：

- `surface_state text not null default 'active'`
- 枚举约束：`active|do_not_surface|superseded`
- `supersedes_id text null`，同用户外键指向旧记忆，`ON DELETE RESTRICT`

规则：

- `do_not_surface/superseded` 默认排除召回、自动事件候选和新精炼输入。
- 它们仍在记忆库“留档”筛选中可见，仍可恢复，仍可被历史事件 link 引用。
- 不把 `archived`、`deleted`、`surface_state` 混成一个字段：三者语义分别是精炼归档、撤回软删、主动浮现状态。
- schema、RPC payload、本地 sharedRow、审计指纹必须在同一迁移步骤升级，不能让旧客户端用缺省值把状态复活。

UI 名称使用“留档，不主动想起”；不修改小克措辞。

## 6. P1-3：纠错留环 + 废除 `pruneSubsumed` 硬删

### 当前危险点

`js/app.js` 的 `pruneSubsumed` 当前通过 `existing.filter(...)` 直接把被更详细新条包含的旧条移出数组。实施纠错留环时必须在同一提交废除这条硬删，不能先做一半。

### 新行为

- “更详细包含旧条”只生成 supersede 候选，不立即改变旧条。
- “新事实推翻旧事实”同样生成 supersede 候选，并展示新旧正文与证据。
- Lisa 确认后：新条保持 `active`；旧条设 `surface_state=superseded`、`supersedes_id` 关系由新条指向旧条。
- Lisa 拒绝后：两条保持原状态，候选留审计记录。
- pinned/open 旧条也绝不硬删；若确实被纠正，仍需 Lisa 明确确认。open 不得被“更详细”自动闭环。

### 原子写入

使用 RPC 同事务完成：

1. 校验新旧行同用户且 revision 未变化。
2. 锁定两行。
3. 设置旧条 superseded、新条 active 和关系。
4. 写审计/冲突日志。
5. 任一步失败全部回滚。

不允许 App 先保存新条、再单独隐藏旧条形成半完成状态。

### 回归验收

- 新详细条加入后旧 ID 仍存在于本地与云表。
- 默认召回不出现 superseded；“留档”筛选可见并能追到新条。
- 旧历史事件 link 仍指向原 ID，不自动改写叙事。
- pinned/open 无确认时绝不被降级或消失。
- 离线重试幂等；两设备同时确认产生冲突日志，不静默覆盖。

## 7. 总施工顺序与独立提交线

1. 召回 shadow 仪表，只旁路观察。
2. 冷却 proposed 旁路计算。
3. 冷却切实际返回。
4. 随机 proposed 旁路计算。
5. 随机切实际返回。
6. 抽取质量分类 shadow。
7. temperature 拦截启用。
8. `surface_state/supersedes_id` schema 与旧客户端版本闸。
9. 纠错确认 RPC/UI，并在同一步替换 `pruneSubsumed` 硬删。

第 1 步也必须等⑤切权威完成；第 6～9 步还必须等新表稳定。任一步改变实际召回/入库时，只改一个变量并观察，不能把冷却、随机、质量闸一次全开。
