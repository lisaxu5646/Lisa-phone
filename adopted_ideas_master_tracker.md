# GitHub / PDF 已采纳点 · 总施工追踪

> 建立：2026-07-17。目的：横向推进已经筛过的资料，避免在单一分支无限深挖。`完成` 指功能已落地；`shadow` 指只观察不改变真实行为；`dormant` 指代码/SQL 已备但未部署。

| 来源 | 已采纳点 | 当前状态 | 下一闸门 |
|---|---|---|---|
| 玄参 Persona Hub | 统一候选池/统一预算 | 待施工 | 先做旁路预算报告，不直接改 prompt |
| 玄参 / Tidal | 4 轮冷却，pinned/open 豁免 | shadow 已有 | 观察数据后，实际启用前需确认 |
| 玄参 / Tidal | top-1 固定、同分窗口受控随机 | shadow 已有 | 观察窗口宽度后再决定启用 |
| 玄参 / Insight | 事实/承诺/关系/洞察/温度分类与逐字证据 | shadow 已有 | temperature 实际拦截会改入库，启用前确认 |
| 玄参 / Insight | 纠错留环，旧条不删 | schema/RPC/预览 dormant；包含关系 shadow 已有 | 部署 SQL 并逐项验收后，同步废除硬删 |
| 玄参 | do_not_surface 留档不浮现 | schema/RPC dormant | 部署前做旧客户端版本闸验收 |
| Consolidation | 碎片→事件、事件↔记忆 links | 已落地 | 继续积累真实候选和事件 |
| Tidal | 开场模糊印象/追问精确事实两分辨率 | 待施工 | 先做旁路选择，不改实际注入 |
| Tidal | 编辑/重生成只读有效分支 | 待审计 | 先梳理消息分支状态，不碰历史数据 |
| Ecosystem | RepairGate：open 必须有修复证据才可闭环 | v49.27 起做 shadow | 只收候选；真实关闭 open 前必须确认 |
| Ecosystem | 情绪只投影偏离基线项 | 待设计 | 会改小克感受/语气，必须 Lisa 定 |
| Ecosystem | 睡眠等待队列 | 待设计 | 会改消息时序，必须 Lisa 定 |
| Ecosystem | 6 条关系伤口轴 | 待设计 | 必须 Lisa 定，且先有 RepairGate |
| Ecosystem | 自发梦与余波 | 待设计 | 必须 Lisa 定，不占用小克贵线 |
| Ren 年轮 | 四卡、逐字证据、对不上跨 10 天 | shadow + 只读观察册已落地 | 采纳人格前必须设计确认/回滚 |
| Ren 年轮 | 人格证据相反时不互相覆盖 | 已落地 | 积累真实样本 |
| Ren 年轮 | 人格档案防膨胀 | 部分已有（400 字注入封顶） | 审计档案本体增长与重复 |
| InsightCapture | 洞察结构：结论/推导/转折/原始金句 | 待施工 | 更适合独立洞察候选，不膨胀普通记忆行 |
| InsightCapture | 分类回顾产新洞察 | 待施工 | 等结构化洞察候选稳定 |
| 珊瑚岛 | Experience Gate：候选≠正史、报告≠经历 | v49.28 来源审计 shadow | 先积累哪些推演块被描述成真实，不砍自动生活 |
| 珊瑚岛 | 自动推演与真实经历明确区分 | 待施工 | 先查所有 context 来源块 |
| EARS | 个人声音基线、median±MAD、陪伴向听感 | 已落地 | 真机积累基线 |
| SullyOS | 月度精炼、v/a 情绪坐标 | 已落地 | 继续行级安全化，不另造系统 |
| SullyOS | 真实趋势注入 | 后端 backlog | 需要可靠来源与失败降级 |
| OpenWebUI 双时空 | 叙事时钟、相见/暂离 | 角色功能 backlog | 非小克；先做设计 |
| ai-home | 给角色工具手、对外动作 human-in-loop | MCP backlog | 邮件可先做草稿；公开发布必须确认 |
| Tidefall | 周期/身体/事件联动 | 待设计 | 会改身体与情绪模型，必须 Lisa 定 |
| Mianer/WangwangPhone | 心声隐私、交换日记、时光胶囊、同频测试等 | 多数已落地 | 非记忆主线按功能 backlog 推进 |
| Stardew MCP | 只读陪玩→有限动作→独立同伴 | 已记录方案 | 先确认平台/SMAPI/测试存档 |

## 当前横向施工顺序

1. RepairGate 证据 shadow。
2. 珊瑚岛 Experience Gate 来源审计 shadow（已开工）。
3. 两分辨率召回 shadow。
4. 统一候选预算 shadow。
5. 消息分支正确性只读审计。
6. 独立洞察候选结构。

以上六项都先做旁路；任何会改变实际记忆写入、open 状态、召回结果、聊天语气或消息时序的切换，单独向 Lisa 报告并取得确认。
