# ⑤ 记忆行表影子期退场清单

> 最早执行日：2026-07-22（从 2026-07-15 起观察满 7 天后）。
> 当前已知基线：手机显示影子镜像 390 行、outbox 0，旧 `x_memLib` 仍是读取权威。
> 本文是只读验收与回滚准备，不代表已经批准切换。

## 1. 当天先冻结会改变记忆的动作

验收窗口内暂时不要：

- 新增、编辑、归档、恢复或清理记忆。
- 触发自动抽取、月度精炼或 CC `add_memory`。
- 同时在第二台设备打开并修改记忆。

普通只读查看可以继续。若验收期间出现新 outbox，等待发送完成后从头重新导出，不拿两个不同时刻的快照硬比。

## 2. 三份必须保留的原始证据

1. App 导出的完整备份。
2. 当天 App 生成的 `lisa-memory-audit-*.json`。
3. Supabase `memories` 全行导出，包含软删行、revision、updated_at、last_mutation_id。

三份文件名加同一个时间标签，保存在 Lisa 的私有备份位置；不要提交 GitHub。另记录每个文件 SHA-256，防止后续拿错版本。

## 3. App 审计报告硬门槛

第二次报告必须以当天主手机的旧权威 `x_memLib` 与云端旧 blob 为输入，并满足：

- 两侧解析成功。
- 本地 ID 唯一，云端 ID 唯一。
- `missingInLocal=[]`。
- `missingInCloud=[]`。
- `changed=[]`（使用当前 shared-business-field 指纹；`hits/lastHit` 已按决定只存本地，不进入云表指纹）。
- 本地有效记忆数与准备切换的 `memories.deleted=false` 行数相同。

不能只看总数。390=390 仍可能是一条缺失加一条额外，必须比较完整 ID 集和逐 ID 指纹。

## 4. 行表健康报告硬门槛

运行 `memory_shadow_health.sql`，保存原始 JSON 结果，必须满足：

- `structural_health=true`。
- `duplicate_ids=0`。
- `conflicts=0`；若非 0，逐条解释和处理后重新验收。
- `inbox_pending=0`。
- App 页面 outbox=0。
- RLS enabled/forced=true。
- physical delete blocked=true。
- revision 最小值 ≥1，没有非法空 user/id/text。

source 分布、open 数、archived 数与当天 App 审计统计需能解释；任何无法解释的差异都视为失败，不切换。

## 5. 逐 ID 行表指纹

对每条 `deleted=false` 行构造与 App 一致的共享业务对象，只包含：

```text
id,text,tags,charIds,v,a,open,pinned,ts,
archived,archivedBatch,archivedTs,source
```

规范化规则必须与 `js/memory-audit.js`/`js/memory-sync.js` 一致：

- 数组顺序按现有业务值保留，不擅自排序后掩盖差异。
- 缺省布尔与数值使用当前 sharedRow 默认值。
- 不包含 `hits/lastHit`、revision、updated_at、device_id。
- 每个 ID 计算 SHA-256，再比较完整 `{id,fingerprint}` 集合。

通过条件：缺失 0、额外 0、内容差异 0、重复 ID 0。

## 6. 切换前备份与回滚包

切换前必须能明确指出以下四份材料的位置：

1. 迁移最初基线备份。
2. 切换当天旧 `x_memLib` 原始 JSON。
3. 切换当天 `memories` 全表导出。
4. 未部署的上一版 App Git commit。

回滚原则：不 drop、不 truncate、不物理删表；若切换代码出错，恢复 legacy read 闸，同时把切换后产生的新行按 ID/revision 合回旧镜像，不能用旧备份整份盖掉新数据。

## 7. 切换批准记录

在真正写切换代码前，给 Lisa 展示一页大白话报告：

- 观察起止时间。
- 旧库有效条数、行表有效条数。
- ID 缺失/额外/重复/指纹差异各多少。
- outbox、conflicts、信箱 pending 各多少。
- RLS/物理删除保护是否通过。
- 三份新备份是否完成。
- 明确写“当前仍读旧库”；等待 Lisa 说可以切换。

Lisa 未明确批准，就继续影子观察。

## 8. 切换后观察与信箱

- 切换后的 7 天内保留 legacy read 紧急闸与切换前 JSON，不清理旧 blob。
- `cc_mem_inbox` 继续保留；直到 MCP 直写表稳定后才停止新投递。
- 停止新投递后继续消费到 pending=0，再观察 30 天，仅封存，不删表。
- 事件层第 1 步 SQL 只能在记忆权威切换成功并稳定后另行部署；不能和切换放在同一提交/同一验收窗口。
