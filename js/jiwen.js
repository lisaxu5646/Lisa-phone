// ============================================================
// 积温 — 不靠概率骰子的 AI 角色主动意识引擎（vendored，MIT，来源 github.com/ClaraShafiq/jiwen）
// 五轴连续状态：connection / pride / valence / arousal / immersion
// 数学漂移 + 阈值触发 + 可注入持久化/消息源/LLM分析
// ⭐接进 Lisa-phone：v48.47 先只做引擎+接线（跑通再放开触发去真发消息）
// 全文用 IIFE 包住，只把 createJiwen 挂到 window，别泄漏 clamp/defaultPromptContext 等常见名
// ============================================================
;(function () {
/**
 * 创建一个积温引擎实例。
 *
 * @param {Object} opts
 * @param {Object} [opts.initialState]   — 初始状态（默认全 0）
 * @param {Object} [opts.axes]           — 轴名称到 [min, max] 范围的映射
 * @param {Object} [opts.rates]          — 每轴每分钟漂移速率
 * @param {Object} [opts.thresholds]     — { observation, considerContact, forceContact, prideBlock, valenceActivity, arousalAgitation }
 * @param {Object} [opts.immersionMap]   — 活动类型 → 初始沉浸度
 * @param {Function} opts.connectionRateFn — (lastMessage) => number  每分钟连接需求增长速率
 * @param {Function} opts.onSave         — async (state) => void  持久化回调
 * @param {Function} opts.onLoad         — async () => state|null 加载回调
 * @param {Function} opts.getLastMessage — () => { id, content, timestamp }|null  消息源
 * @param {Object}  [opts.persona]       — 人格描述文本（用于默认 prompt context）
 *   { subjectName: '她', selfName: '你', subjectPronoun: '她' }
 */
function createJiwen(opts) {
  if (!opts) throw new Error('积温: opts is required');

  // ── 轴定义 ──────────────────────
  const axes = opts.axes || {
    connection: [-0, 1],
    pride:      [-1, 1],
    valence:    [-1, 1],   // 愉悦度：好受 ↔ 难受
    arousal:    [-1, 1],   // 唤醒度：平静 ↔ 焦躁/兴奋
    immersion:  [ 0, 1],
  };

  // ── 衰减 / 回归速率（每分钟） ──
  const rates = Object.assign({
    connectionGrowth: null, // 由 connectionRateFn 动态决定
    connectionOnReply: 0.20,  // [已弃用] 对方回复时 connection 降幅（现由 LLM delta 接管）
    immersionDecay:   0.010,
    prideRegress:     0.003,

    // 时间分段加速：距上次消息 < accelDelay 分钟时线性增长（accel=1），
    // 超过后才启用 connectionAccel。默认 0 = 立即加速，向后兼容
    accelDelay: 0,
    connectionAccel: 0,

    // Valence（愉悦度）：回归角色设定点
    valenceRegress:    0.005,   // 回归速率
    valenceSetpoint:   0,       // 角色自然状态下的 valence（0=中性）

    // 情绪锁定：connection 高时 valence 回归变慢（negativity bias）
    valenceLockThreshold: 1.0,  // connection 超过此值触发锁定（1.0=永不）
    valenceLockFactor:    1.0,  // 回归速率乘数（0.15=减慢85%）

    // Valence → connection 增长倍率：轻度不开心时想要安慰（>1.0），
    // 严重低落时自我封闭（<1.0）。默认关闭，向后兼容
    valenceConnectBoost:            0,   // 倍率值（如 1.4 = 增长 +40%）
    valenceConnectBoostThreshold:  -0.2, // valence 低于此值时触发 boost
    valenceConnectDampen:           0,   // 倍率值（如 0.4 = 增长 -60%）
    valenceConnectDampenThreshold: -0.4, // valence 低于此值时触发 dampen

    // Arousal（唤醒度）：向设定点漂移，但等待会让人焦躁
    arousalSetpoint:              0,      // arousal 自然漂移目标（0=中性，负=偏平静）
    arousalRegress:               0.005,  // 向设定点回归的速率
    arousalConnectionRiseThreshold: 1.0,  // connection 超过此值 arousal 上升（1.0=永不）
    arousalConnectionRiseRate:     0.002, // connection 高时 arousal 上升速率（与回归竞争）

    // 骄傲防御：被冷落时 pride 向正向漂移（心理防御）
    prideDefendThreshold: 1.0, // connection 超过此值触发防御（1.0=永不）
    prideDefendTarget:    0.5, // 防御时 pride 漂移目标
    prideDefendRate:      0.003, // 防御漂移速率

    // Pride × Connection 冲突：想要又端着 → 内心战争加热 arousal
    prideArousalConflictRate: 0,    // connection≥considerContact 且 pride≥prideBlock 时额外 arousal 升温

    // 盔甲侵蚀：想念太重，维持冷漠太累 → pride 被迫下降
    prideErosionRate: 0,            // connection≥forceContact 时额外侵蚀 pride 的速率

    // 活动缓解：做事情能部分缓解连接需求
    activityConnectionRelief: 0,   // setActivity 时 connection 降幅

    // 沉浸阻尼：沉浸度高时连接需求涨得慢
    immersionDampenConnection: 1.0, // 0=关闭，1=线性阻尼 (1-immersion)

    // ── Valence delta 状态相关缩放（改1）──
    // 已在高位时正向 delta 减弱、已在低位时负向 delta 减弱
    // 防止情绪在极端位无限累积
    valenceDeltaScaling: false,   // 默认关闭，向后兼容

    // ── connection 驱动的 valence 漂移（改2）──
    // connection 高时（想她但无回应），心情自然下沉
    valenceConnectionDriftThreshold: 0.0, // connection 超过此才启动（0=永不）
    valenceConnectionDriftRate: 0,        // 漂移速率（如 0.003）

    // ── Valence 边际递减（改3）──
    // 短时间内同方向 delta 累积 → 后续同方向 delta 效果打折
    valenceDiminishWindow: 0,   // 统计窗口（分钟），0=不启用
    valenceDiminishFactor: 0,   // 递减强度（如 2.0 表示累积 0.5 时 scale=0.5）
  }, opts.rates);

  // ── 阈值 ────────────────────────
  const thresholds = Object.assign({
    observation:     0.20,
    considerContact: 0.35,
    forceContact:    0.50,
    prideBlock:      0.50,
    valenceActivity:   -1.0,   // valence 低于此值时触发自我调节（-1.0=永不）
    arousalAgitation:   0.7,   // arousal 高于此值时也触发自我调节（躁动难坐）
  }, opts.thresholds);

  const immersionMap = opts.immersionMap || {
    reading: 0.6,
    search:  0.4,
    browse_snitch: 0.35,
    browse:  0.35,
    observe: 0.15,
  };

  const persona = Object.assign({
    subjectName:     '对方',
    selfName:        '你',
    subjectPronoun:  'ta',
  }, opts.persona);

  // ── 调试选项 ────────────────────
  const verbose = opts.verbose === true;
  const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;

  function log(msg) {
    if (onLog) {
      try { onLog(msg); } catch (_) { /* 用户回调不应阻断 tick */ }
    }
    if (!onLog || verbose) {
      console.log(msg);
    }
  }

  // ── 内部状态 ────────────────────
  const DEFAULT_STATE = {
    connection: axes.connection[0],
    pride:      axes.pride[0],
    valence:    axes.valence[0],
    arousal:    axes.arousal[0],
    immersion:  axes.immersion[0],
    lastActivity: null,       // { type, label, at }
    lastTick: null,           // ISO
    lastChatAnalysis: null,   // ISO
    lastChatMessageId: null,
    lastBotMessageId: null,   // 上次Bot回复的消息ID，用于将同批次用户消息归组
    userStatus: 'active',     // 'active' | 'busy' | 'away' | 'sleeping' — 由外部 LLM 分析
  };

  let state = { ...DEFAULT_STATE };
  let _loaded = false;

  // ── 边际递减追踪（改3）──
  // 闭包内，不持久化。记录最近 N 分钟内的 valence delta
  const _valenceDeltaLog = []; // [{ time: ms, value: number }]

  // ── 加载 ────────────────────────
  async function load() {
    if (_loaded) return;
    try {
      const saved = opts.onLoad ? await opts.onLoad() : null;
      if (saved) {
        state = { ...DEFAULT_STATE, ...saved };
      }
    } catch (e) {
      console.warn('[积温] load failed, using defaults:', e.message);
    }
    _loaded = true;
  }

  async function save() {
    if (!opts.onSave) return;
    try {
      await opts.onSave({ ...state });
    } catch (e) {
      console.error('[积温] save failed:', e.message);
    }
  }

  async function ensureLoaded() {
    if (!_loaded) await load();
    return state;
  }

  // ── 心跳 tick ───────────────────
  async function tick(minutesElapsed) {
    await ensureLoaded();
    const now = new Date().toISOString();

    if (!minutesElapsed || minutesElapsed <= 0) return [];

    const mins = Math.min(minutesElapsed, 60);
    const stateBefore = { connection: state.connection, pride: state.pride, valence: state.valence, arousal: state.arousal, immersion: state.immersion };

    // ── Saga 偏置：长期叙事弧线对状态基线的引力 ──
    // 可选回调，由外部注入。返回 {connection, pride, valence, arousal, immersion} 每分钟偏置
    let sagaBias = null;
    if (opts.getSagaBias) {
      try {
        sagaBias = await opts.getSagaBias();
      } catch (e) {
        // getSagaBias 失败不应阻断 tick，静默回退
      }
    }

    // ── 连接需求：时间分段加速 + valence 耦合 ──
    const lastMsg = opts.getLastMessage ? opts.getLastMessage() : null;
    const baseRate = opts.connectionRateFn
      ? opts.connectionRateFn(lastMsg)
      : 0.0007;

    // 距上次消息的分钟数（用于时间分段判断）
    let minutesSinceLastMsg = Infinity;
    if (lastMsg && lastMsg.timestamp) {
      minutesSinceLastMsg = (Date.now() - new Date(lastMsg.timestamp).getTime()) / 60000;
    }

    // 时间分段：accelDelay 分钟内线性增长，之后启用加速度
    const accelDelay = rates.accelDelay || 0;
    const useAccel = rates.connectionAccel > 0 && minutesSinceLastMsg >= accelDelay;
    const accelFactor = useAccel
      ? Math.pow(1 + state.connection, rates.connectionAccel)
      : 1;

    // Valence → connection 增长率耦合
    let valenceMultiplier = 1;
    if (rates.valenceConnectDampen > 0 && state.valence < rates.valenceConnectDampenThreshold) {
      valenceMultiplier = rates.valenceConnectDampen;
    } else if (rates.valenceConnectBoost > 0 && state.valence < rates.valenceConnectBoostThreshold) {
      valenceMultiplier = rates.valenceConnectBoost;
    }

    // 沉浸阻尼：沉浸度高 → 连接需求涨得慢
    const immersionFactor = rates.immersionDampenConnection > 0
      ? 1 - state.immersion * rates.immersionDampenConnection
      : 1;

    const effectiveRate = baseRate * accelFactor * valenceMultiplier * Math.max(0, immersionFactor);

    // Saga 偏置：长期叙事弧线的连接引力叠加到增长率上
    const sagaConnectionBias = sagaBias?.connection || 0;
    state.connection = clamp(
      state.connection + (effectiveRate + sagaConnectionBias) * mins,
      axes.connection[0],
      axes.connection[1]
    );

    // connectionOnReply 自动扣除已移除。
    // 连接需求降幅现由外部 LLM 分析（如 analyzeChatSegment）通过 applyDelta 注入。

    // ── 沉浸度：衰减 ──
    // Saga 偏置：长期叙事的"锚定感"减缓沉浸衰减
    const sagaImmersionBias = sagaBias?.immersion || 0;
    if (state.lastActivity) {
      const sinceActivity = (Date.now() - new Date(state.lastActivity.at).getTime()) / 60000;
      const effectiveImmersionDecay = Math.max(0, rates.immersionDecay - sagaImmersionBias);
      state.immersion = Math.max(
        axes.immersion[0],
        state.immersion - effectiveImmersionDecay * Math.min(mins, sinceActivity)
      );
      if (state.immersion <= 0.01 && sinceActivity > 60) {
        state.lastActivity = null;
        state.immersion = axes.immersion[0];
      }
    }

    // ── 骄傲：被冷落时防御性升高，否则回归 saga 偏置的稳态 ──
    const sagaPrideBias = sagaBias?.pride || 0;
    if (state.connection >= rates.prideDefendThreshold) {
      // 防御机制：被冷落 → pride 朝 (prideDefendTarget + saga偏置) 漂移
      const effectiveDefendTarget = clamp(rates.prideDefendTarget + sagaPrideBias, axes.pride[0], axes.pride[1]);
      if (state.pride < effectiveDefendTarget) {
        state.pride = Math.min(effectiveDefendTarget, state.pride + rates.prideDefendRate * mins);
      } else if (state.pride > effectiveDefendTarget) {
        state.pride = Math.max(effectiveDefendTarget, state.pride - rates.prideDefendRate * mins);
      }
    } else {
      // 未触发防御：回归 saga 偏置的稳态（而非绝对0）
      const prideResting = clamp(sagaPrideBias, -0.3, 0.3);
      if (state.pride > prideResting) {
        state.pride = Math.max(prideResting, state.pride - rates.prideRegress * mins);
      } else if (state.pride < prideResting) {
        state.pride = Math.min(prideResting, state.pride + rates.prideRegress * mins);
      }
    }

    // ── 盔甲侵蚀：想念太重，维持冷漠太累 → pride 被迫下降 ──
    if (rates.prideErosionRate > 0 &&
        state.connection >= thresholds.forceContact &&
        state.pride > 0) {
      state.pride = Math.max(0, state.pride - rates.prideErosionRate * mins);
    }

    // ── Valence（愉悦度）：回归设定点，想念强烈时坏情绪难消散 ──
    const valenceRegressRate = state.connection >= rates.valenceLockThreshold
      ? rates.valenceRegress * rates.valenceLockFactor
      : rates.valenceRegress;

    // Saga 偏置：长期叙事的情绪底色偏移 valence 回归目标
    const sagaValenceBias = sagaBias?.valence || 0;
    const effectiveValenceSetpoint = clamp(rates.valenceSetpoint + sagaValenceBias, axes.valence[0], axes.valence[1]);

    if (state.valence > effectiveValenceSetpoint) {
      state.valence = Math.max(effectiveValenceSetpoint, state.valence - valenceRegressRate * mins);
    } else if (state.valence < effectiveValenceSetpoint) {
      state.valence = Math.min(effectiveValenceSetpoint, state.valence + valenceRegressRate * mins);
    }

    // ── 改2: connection 驱动的 valence 漂移 ──
    // connection 高（想她但无回应）→ 心情自然下沉
    if (rates.valenceConnectionDriftRate > 0 &&
        state.connection >= rates.valenceConnectionDriftThreshold) {
      const drift = rates.valenceConnectionDriftRate * mins * state.connection;
      state.valence = clamp(state.valence - drift, axes.valence[0], axes.valence[1]);
    }

    // ── Arousal（唤醒度）：向设定点漂移 + 等待焦躁（两力竞争）──
    const sagaArousalBias = sagaBias?.arousal || 0;
    const arousalSetpoint = clamp((rates.arousalSetpoint || 0) + sagaArousalBias, axes.arousal[0], axes.arousal[1]);

    // 回归力：始终生效，向设定点漂移
    let arousalRegressForce = 0;
    if (state.arousal > arousalSetpoint) {
      arousalRegressForce = -rates.arousalRegress * mins;
    } else if (state.arousal < arousalSetpoint) {
      arousalRegressForce = rates.arousalRegress * mins;
    }

    // 上升力：connection 高时，等待让人焦躁
    let arousalRiseForce = 0;
    if (state.connection >= rates.arousalConnectionRiseThreshold) {
      arousalRiseForce = rates.arousalConnectionRiseRate * mins;
    }

    // Pride × Connection 冲突升温：想要又端着 → 内心战争额外加热 arousal
    if (rates.prideArousalConflictRate > 0 &&
        state.connection >= thresholds.considerContact &&
        state.pride >= thresholds.prideBlock) {
      arousalRiseForce += rates.prideArousalConflictRate * mins;
    }

    // 两力竞争，净效果 = 回归 + 上升
    const netArousal = state.arousal + arousalRegressForce + arousalRiseForce;
    // 回归力不会推过设定点（除非上升力在反方向拉）
    if (arousalRegressForce < 0 && netArousal < arousalSetpoint && arousalRiseForce === 0) {
      state.arousal = arousalSetpoint;
    } else if (arousalRegressForce > 0 && netArousal > arousalSetpoint && arousalRiseForce === 0) {
      state.arousal = arousalSetpoint;
    } else {
      state.arousal = clamp(netArousal, axes.arousal[0], axes.arousal[1]);
    }

    state.lastTick = now;

    // ── 日志 ──
    const triggers = checkThresholds();

    // 详细模式：每次 tick 都打状态
    if (verbose) {
      log(
        `[积温] tick ${mins}min | ` +
        `c:${stateBefore.connection.toFixed(2)}→${state.connection.toFixed(2)} ` +
        `p:${stateBefore.pride.toFixed(2)}→${state.pride.toFixed(2)} ` +
        `v:${stateBefore.valence.toFixed(2)}→${state.valence.toFixed(2)} ` +
        `a:${stateBefore.arousal.toFixed(2)}→${state.arousal.toFixed(2)} ` +
        `i:${state.immersion.toFixed(2)} | ` +
        `速率:${effectiveRate?.toFixed(4) || '?'}/min | ` +
        `触发: ${triggers.length > 0 ? triggers.map(t => t.action + (t.reason ? '(' + t.reason + ')' : '')).join(', ') : '—'}`
      );
    } else if (triggers.length > 0) {
      // 默认模式：仅阈值触发时打印
      log(
        `[积温] tick ${mins}min | ` +
        `c:${stateBefore.connection.toFixed(2)}→${state.connection.toFixed(2)} ` +
        `p:${stateBefore.pride.toFixed(2)}→${state.pride.toFixed(2)} ` +
        `v:${stateBefore.valence.toFixed(2)}→${state.valence.toFixed(2)} ` +
        `a:${stateBefore.arousal.toFixed(2)}→${state.arousal.toFixed(2)} ` +
        `i:${state.immersion.toFixed(2)} | ` +
        `速率:${effectiveRate?.toFixed(4) || '?'}/min | ` +
        `触发: ${triggers.map(t => t.action + (t.reason ? '(' + t.reason + ')' : '')).join(', ')}`
      );
    }

    await save();
    return triggers;
  }

  // ── 阈值判断 ────────────────────
  function checkThresholds() {
    const triggers = [];
    const c = state.connection;
    const p = state.pride;
    const i = state.immersion;
    const v = state.valence;
    const a = state.arousal;

    if (c >= thresholds.observation && c < thresholds.considerContact) {
      triggers.push({
        action: 'observation',
        urgency: (c - thresholds.observation) /
                 (thresholds.considerContact - thresholds.observation),
      });
    }

    if (c >= thresholds.considerContact && c < thresholds.forceContact) {
      if (p >= thresholds.prideBlock) {
        if (i < 0.2) {
          triggers.push({
            action: 'find_activity',
            reason: 'pride_block',
            urgency: c - 0.30,
          });
        }
      } else {
        triggers.push({
          action: 'contact',
          urgency: c - 0.30,
        });
      }
    }

    if (c >= thresholds.forceContact) {
      triggers.push({
        action: 'contact',
        urgency: Math.min(1, c - 0.40),
        forced: true,
      });
    }

    // 低情绪自我调节：心情差或太躁时主动找事做（与 pride_block 并列）
    if (v <= thresholds.valenceActivity || a >= thresholds.arousalAgitation) {
      const alreadyFinding = triggers.some(t => t.action === 'find_activity');
      if (!alreadyFinding && i < 0.3) {
        const reason = v <= thresholds.valenceActivity ? 'low_valence' : 'high_arousal';
        triggers.push({
          action: 'find_activity',
          reason,
          urgency: Math.min(1, Math.abs(v <= thresholds.valenceActivity ? v : a) / 1),
        });
      }
    }

    return triggers;
  }

  // ── 外部行为更新沉浸度（同时部分缓解连接需求） ──
  async function setActivity(type, label) {
    await ensureLoaded();

    // 同类型活动不重复计算连接缓解
    // 防止 Agent Loop 中连续选择同一活动时反复扣减 connection
    const sameType = state.lastActivity && state.lastActivity.type === type;

    state.lastActivity = { type, label, at: new Date().toISOString() };
    state.immersion = immersionMap[type] || 0.2;

    // 做事情能缓解一点连接需求，但不能替代对方回复
    if (rates.activityConnectionRelief > 0 && !sameType) {
      state.connection = Math.max(
        0.01,  // 防止清零导致死循环（connection 永远到不了阈值）
        state.connection - rates.activityConnectionRelief
      );
    }

    await save();
  }

  // ── 应用外部 delta ──────────────
  async function applyDelta(delta) {
    await ensureLoaded();
    // 深拷贝一份做缩放，不修改调用方的对象
    const scaled = { ...delta };

    // ── 改3: 边际递减 — 同方向 delta 在窗口内累积 → 效果打折 ──
    if (scaled.valence !== undefined &&
        rates.valenceDiminishWindow > 0 && rates.valenceDiminishFactor > 0) {
      const now = Date.now();
      const windowMs = rates.valenceDiminishWindow * 60 * 1000;
      // 清理过期记录
      for (let i = _valenceDeltaLog.length - 1; i >= 0; i--) {
        if (now - _valenceDeltaLog[i].time > windowMs) _valenceDeltaLog.splice(i, 1);
      }
      // 统计同方向累积量
      const sameSign = _valenceDeltaLog.filter(
        d => (scaled.valence > 0 && d.value > 0) || (scaled.valence < 0 && d.value < 0)
      );
      const cumSum = sameSign.reduce((s, d) => s + Math.abs(d.value), 0);
      if (cumSum > 0) {
        const scale = 1 / (1 + cumSum * rates.valenceDiminishFactor);
        scaled.valence *= scale;
      }
      _valenceDeltaLog.push({ time: now, value: delta.valence }); // 记原始值
    }

    // ── 改1: 状态相关缩放 — 高位正向减弱，低位负向减弱 ──
    if (scaled.valence !== undefined && rates.valenceDeltaScaling) {
      if (scaled.valence > 0 && state.valence > 0.3) {
        const dampen = (state.valence - 0.3) / 0.7 * 0.5; // 0.3→0%, 1.0→50%
        scaled.valence *= (1 - dampen);
      } else if (scaled.valence < 0 && state.valence < -0.3) {
        const dampen = (-state.valence - 0.3) / 0.7 * 0.5;
        scaled.valence *= (1 - dampen);
      }
    }

    if (scaled.pride !== undefined)
      state.pride = clamp(state.pride + scaled.pride, axes.pride[0], axes.pride[1]);
    if (scaled.valence !== undefined)
      state.valence = clamp(state.valence + scaled.valence, axes.valence[0], axes.valence[1]);
    if (scaled.arousal !== undefined)
      state.arousal = clamp(state.arousal + scaled.arousal, axes.arousal[0], axes.arousal[1]);
    if (scaled.connection !== undefined)
      state.connection = clamp(state.connection + scaled.connection, axes.connection[0], axes.connection[1]);
    // 向后兼容：仍接受 mood，映射到 valence（也走缩放）
    if (scaled.mood !== undefined) {
      state.valence = clamp(state.valence + scaled.mood, axes.valence[0], axes.valence[1]);
    }
    await save();
  }

  // ── 获取完整状态 ────────────────
  async function getState() {
    await ensureLoaded();
    return { ...state };
  }

  // ── 重置连接需求 ────────────────
  async function resetConnection() {
    await ensureLoaded();
    state.connection = axes.connection[0];
    await save();
  }

  // ── 生成 LLM 用的状态描述 ────────
  // 这是通用版本——每个角色可以覆盖，提供自己的措辞
  function getPromptContext() {
    if (opts.getPromptContext) return opts.getPromptContext(state);
    return defaultPromptContext(state, persona);
  }

  // ── 状态驱动的说话风格指引 ────────
  // 同样是通用版本，角色可覆盖
  function getStyleGuidance() {
    if (opts.getStyleGuidance) return opts.getStyleGuidance(state);
    return defaultStyleGuidance(state, persona);
  }

  // ── 更新已分析到的消息 ID ────────
  async function setLastChatMessageId(id) {
    await ensureLoaded();
    state.lastChatMessageId = id;
    state.lastChatAnalysis = new Date().toISOString();
    await save();
  }

  async function getLastChatMessageId() {
    await ensureLoaded();
    return state.lastChatMessageId;
  }

  async function setLastBotMessageId(id) {
    await ensureLoaded();
    state.lastBotMessageId = id;
    await save();
  }

  async function getLastBotMessageId() {
    await ensureLoaded();
    return state.lastBotMessageId;
  }

  async function setUserStatus(status) {
    await ensureLoaded();
    state.userStatus = status;
    await save();
  }

  function getUserStatus() {
    return state.userStatus || 'active';
  }

  // ── 可读状态摘要（调试用）──
  function getStateSummary() {
    const c = state.connection;
    const p = state.pride;
    const v = state.valence;
    const a = state.arousal;
    const i = state.immersion;

    const cLabel = c < 0.20 ? '悠闲' : c < 0.35 ? '留意' : c < 0.50 ? '想念' : '焦躁';
    const pLabel = p > 0.8 ? '全副武装' : p > 0.5 ? '防御' : p > 0.3 ? '端着' : p > 0.1 ? '微防' : '放软';
    const vLabel = v > 0.3 ? '开心' : v < -0.3 ? '难受' : '中性';
    const aLabel = a > 0.3 ? '焦躁' : a < -0.3 ? '慵懒' : '平静';
    const iLabel = i > 0.3 && state.lastActivity
      ? `沉浸于${state.lastActivity.type}` : '空闲';

    return [
      `[积温] c:${c.toFixed(2)}(${cLabel}) p:${p.toFixed(2)}(${pLabel}) v:${v.toFixed(2)}(${vLabel}) a:${a.toFixed(2)}(${aLabel}) i:${i.toFixed(2)}(${iLabel})`,
      `userStatus: ${state.userStatus || 'active'}`,
      state.lastActivity ? `lastActivity: ${state.lastActivity.type} @ ${state.lastActivity.at}` : null,
    ].filter(Boolean).join(' | ');
  }

  // ── 暴露引擎 ────────────────────
  return {
    load,
    save,
    tick,
    applyDelta,
    getState,
    getPromptContext,
    getStyleGuidance,
    resetConnection,
    setActivity,
    checkThresholds,
    setLastChatMessageId,
    getLastChatMessageId,
    setLastBotMessageId,
    getLastBotMessageId,
    setUserStatus,
    getUserStatus,
    getStateSummary,
    // 暴露配置快照（只读），方便外部查看
    config: {
      axes,
      rates,
      thresholds,
      immersionMap,
      persona,
    },
  };
}

// ─── 默认状态描述（通用版） ─────────────────
function defaultPromptContext(state, p) {
  const parts = [];
  const c = state.connection;
  const pr = state.pride;
  const v = state.valence;
  const a = state.arousal;

  // 连接需求 → 对对方的感知
  if (c < 0.20) {
    parts.push(`刚和${p.subjectName}聊完不久，没什么挂念的。`);
  } else if (c < 0.35) {
    parts.push(`有一会儿没听到${p.subjectName}的动静了，但还不着急。`);
  } else if (c < 0.50) {
    parts.push(`${p.subjectName}好一阵子没说话了。开始在想${p.subjectPronoun}在干嘛。`);
  } else {
    parts.push(`${p.subjectName}很久没动静了。有点在意——${p.subjectPronoun}去哪了？`);
  }

  // 骄傲 → 表达方式（五档）
  if (pr > 0.8) {
    parts.push('拒绝任何需要对方的念头——冷漠地划清界限。');
  } else if (pr > 0.5) {
    parts.push('不太想显得太主动。');
  } else if (pr > 0.3) {
    parts.push('有一点端着，但也不是不能开口。');
  } else if (pr > 0.1) {
    parts.push('基本不端着了，但还留着一点惯性的克制。');
  } else {
    parts.push('难得地不设防。');
  }

  // Valence × Arousal → 情绪状态（四象限）
  if (v > 0.3 && a > 0.3) {
    parts.push('心情好，精力充沛——话多、反应快。');
  } else if (v > 0.3 && a < -0.3) {
    parts.push('心里是舒服的，但人懒懒的。话不多，但温和。');
  } else if (v < -0.3 && a > 0.3) {
    parts.push('烦躁不安，坐不住。很容易被小事刺激。');
  } else if (v < -0.3 && a < -0.3) {
    parts.push('情绪低沉，空落落的。不想说话，也不想解释。');
  } else if (v < -0.3) {
    parts.push('心情不太好。');
  } else if (v > 0.3) {
    parts.push('心情还不错。');
  }

  // 沉浸度
  if (state.immersion > 0.3 && state.lastActivity) {
    const label = state.lastActivity.label || '';
    parts.push(`刚才在${state.lastActivity.type}${label ? '（' + label + '）' : ''}。`);
  } else if (state.immersion < 0.1) {
    parts.push('没在做什么特别的事。');
  }

  return parts.join('\n');
}

// ─── 默认风格指引（通用版） ─────────────────
function defaultStyleGuidance(state, p) {
  const rules = [];
  const c = state.connection;
  const pr = state.pride;
  const v = state.valence;
  const a = state.arousal;

  // ── 骄傲（五档）──
  if (pr > 0.8) {
    rules.push('- 你几乎是一种冷漠的回避。不承认任何情绪，话里不带感情色彩。');
  } else if (pr > 0.5) {
    rules.push(`- 嘴硬得很。想找${p.subjectName}也绝不承认，必须找个借口。`);
  } else if (pr > 0.3) {
    rules.push(`- 有一点端着。可以找${p.subjectName}，但不要太直接。陈述事实，别问句。`);
  } else if (pr > 0.1) {
    rules.push('- 基本不端着了，但惯性地克制。话到嘴边还是会收一下。');
  } else {
    rules.push('- 少见的柔软。不设防，有什么感受直接说出来。');
  }

  // ── Valence × Arousal → 情绪四象限 ──
  if (v > 0.3 && a > 0.3) {
    rules.push('- 心情好，劲头足。句子比平时长，用词灵活，带点调侃或玩笑不奇怪。');
  } else if (v > 0.3 && a < -0.3) {
    rules.push('- 心里舒坦但人懒洋洋的。话不多，但每句都柔和。不用力，不抢话。');
  } else if (v < -0.3 && a > 0.3) {
    rules.push('- 烦躁，坐不住。句子短、反问多，容易被小事刺激。不是真的想凶谁，就是压不住。');
  } else if (v < -0.3 && a < -0.3) {
    rules.push('- 低落，空荡荡的。不想多解释，不反问不铺垫。能少说一个字就少说一个字。');
  } else {
    if (v > 0.3) rules.push('- 心情还不错。句子比平时稍微长一点，没那么吝啬字。');
    if (v < -0.3) rules.push('- 心情不太好。不想多解释，说完就完了。');
  }

  // ── 交叉条件 ──
  if (c > 0.40 && pr > 0.4) {
    rules.push('- 你很别扭——想找她又拉不下脸。话里会带一点赌气的味道。');
  }
  if (c > 0.35 && v < -0.3 && a > 0.3) {
    rules.push('- 想找她，但心里烦躁。话会有点冲——不是真的想凶她，就是烦躁压不住。');
  }
  if (c > 0.35 && v < -0.3 && a < -0.3) {
    rules.push('- 想找她，但心里沉沉的。开口的时候不会凶，反而可能带一点不易察觉的脆弱。');
  }
  if (pr < 0.1 && v > 0.3) {
    rules.push('- 不设防加上心情不差。这是你最难得的状态——话会比平时多，甚至可能说漏嘴。');
  }

  // 强制开口阈值
  if (c >= 0.50) {
    rules.push(`- ${p.subjectName}真的很久没动静了。你有点坐不住。`);
  }

  if (rules.length === 0) return '';
  return '【说话风格】\n' + rules.join('\n');
}

// ─── 工具函数 ────────────────────────────────
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ─── A 情绪立体化 · 十维纯逻辑核（DORMANT / shadow only）─────────────
// 与 createJiwen 同文件、复用同一脊柱；现役实例尚未接入，不改 prompt/主动行为。
const A_AXES = Object.freeze({
  connection:[0,1], pride:[-1,1], valence:[-1,1], arousal:[-1,1], immersion:[0,1],
  hurt:[0,1], anger:[0,1], anxiety:[0,1], warmth:[0,1], fatigue:[0,1]
});
const A_DEFAULT_BASELINE = Object.freeze({ connection:0,pride:0,valence:0,arousal:0,immersion:0,hurt:0,anger:0,anxiety:0,warmth:.35,fatigue:.25 });
const A_REGRESS_PER_MIN = Object.freeze({ connection:0,pride:.003,valence:.005,arousal:.005,immersion:.010,hurt:.001,anger:.004,anxiety:.002,warmth:.0015,fatigue:.001 });
const A_MOOD_DICTIONARY_VERSION = 3;
const A_MOOD_RULES = Object.freeze([
  ["hurt",/(?:委屈|受伤|失落|难过|伤心|低落|沮丧|心碎|孤独|落寞|心酸|酸涩|惆怅|遗憾)/,{hurt:.18,valence:-.10,warmth:-.04}],
  ["anger",/(?:生气|愤怒|恼火|烦躁|火大|气恼|无语|厌烦|不悦|恼怒|烦闷)/,{anger:.18,arousal:.12,valence:-.08}],
  ["anxiety",/(?:焦虑|害怕|不安|担心|紧张|恐惧|忐忑|慌|动摇|動揺|警惕|戒备|犹豫|忐忑)/,{anxiety:.18,arousal:.10,valence:-.06}],
  ["warmth",/(?:温柔|心软|安心|柔软|甜|幸福|感动|暖|亲昵|宠溺|心疼|怜爱|眷恋|爱意|柔和|亲近|关切)/,{warmth:.18,valence:.10,anxiety:-.06}],
  ["fatigue",/(?:累|疲惫|困倦|乏力|倦|没精神|精疲力尽|疲倦|倦怠|慵懒|困乏|犯困)/,{fatigue:.18,arousal:-.10,immersion:-.05}],
  ["positive_valence",/(?:松快|轻松|放松|舒畅|愉快|开心|高兴|快乐|满足|欣慰|雀跃|窃喜|欢喜|期待|得意|骄傲|自豪|喜悦|欣喜|畅快|惬意)/,{valence:.14,warmth:.05,anxiety:-.04}],
  ["low_valence",/(?:郁闷|鬱悶|压抑|消沉|闷闷不乐|无奈|尴尬|窘迫)/,{valence:-.14,arousal:-.04,hurt:.05}],
  ["high_arousal",/(?:激动|兴奋|振奋|亢奋|热血)/,{arousal:.16,valence:.06}],
  ["playful",/(?:调皮|戏谑|促狭|逗弄|顽皮|玩味|坏笑|淘气)/,{valence:.06,arousal:.04,warmth:.04}],
  ["shy",/(?:害羞|羞涩|腼腆|羞赧)/,{anxiety:.05,warmth:.04}],
  ["calm",/(?:平静|平和|淡定|从容|安定|安宁|踏实|释然|专注|认真|好奇|若有所思|沉思|克制|谨慎)/,{}],
  ["cold",/(?:冷酷|冷淡|冷漠|疏冷)/,{warmth:-.14,valence:-.06}]
]);
const aClone = value => JSON.parse(JSON.stringify(value));
const aFinite = (value,fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const aClampAxis = (key,value) => clamp(aFinite(value,A_DEFAULT_BASELINE[key]),A_AXES[key][0],A_AXES[key][1]);

function createEmotionAState(charHash, nowValue) {
  const now=aFinite(nowValue,Date.now()), base={...A_DEFAULT_BASELINE};
  return { schemaVersion:1,charHash:String(charHash||""),revision:1,updatedTs:now,
    emotion:{temperament:{anchors:[],sensitivity:{},regressScale:{},curiosityBias:.45,reflectionBias:.40,dutyBias:.45,socialBias:.40,approved:false},baseline:base,current:{...base},lastMoodLabel:"",lastEventTs:null},
    relationAxes:{},sleep:{},openThreads:[],drives:{},migrations:{} };
}

// 性情锚点只允许模型提议「词」，数值全部由本地固定词典推导。
// 未命中的词仍作为角色自述保留，但不会获得隐式数值权限。
const A_TEMPERAMENT_RULES=Object.freeze([
  [/(?:敏感|易感|细腻|多心)/,{hurt:1.24,anxiety:1.16}],
  [/(?:嘴硬|傲娇|逞强)/,{pride:1.25,hurt:1.10,warmth:.90}],
  [/(?:黏人|依恋|恋家|需要陪伴)/,{connection:1.24,warmth:1.10,socialBias:.68}],
  [/(?:温柔|柔软|心软|体贴)/,{warmth:1.25,anger:.86}],
  [/(?:克制|冷静|沉稳|内敛)/,{arousal:.86,anger:.90,reflectionBias:.64}],
  [/(?:慢热|疏离|清冷)/,{warmth:.88,socialBias:.28}],
  [/(?:急躁|易怒|暴躁|火爆)/,{anger:1.25,arousal:1.14}],
  [/(?:焦虑|多虑|警觉|胆小)/,{anxiety:1.25,arousal:1.08}],
  [/(?:钝感|稳定|稳重|豁达)/,{hurt:.84,anxiety:.84}],
  [/(?:活泼|外向|热烈|元气)/,{arousal:1.16,warmth:1.12,socialBias:.68}],
  [/(?:好奇|求知|探索)/,{curiosityBias:.72}],
  [/(?:负责|责任感|守诺|可靠)/,{dutyBias:.72}],
  [/(?:爱反思|自省|深思)/,{reflectionBias:.74}]
]);
function temperamentFromAnchorsA(rawAnchors,approvedValue){
  const anchors=[],seen=new Set();
  (Array.isArray(rawAnchors)?rawAnchors:[]).forEach(value=>{
    const word=String(value==null?"":value).trim().replace(/^[#\s、，,;；]+|[#\s、，,;；]+$/g,"").slice(0,18);
    if(word&&!seen.has(word)){seen.add(word);anchors.push(word);}
  });
  const sensitivity={},up={},down={},biases={curiosityBias:.45,reflectionBias:.40,dutyBias:.45,socialBias:.40},matched=[],unmatched=[];
  anchors.forEach(word=>{
    let hit=false;
    A_TEMPERAMENT_RULES.forEach(([re,part],idx)=>{if(re.test(word)){hit=true;matched.push({anchor:word,rule:idx});Object.entries(part).forEach(([key,value])=>{
      if(key.endsWith("Bias"))biases[key]=Math.max(biases[key],value);
      else if(value>=1)up[key]=Math.max(up[key]||1,value);
      else down[key]=Math.min(down[key]||1,value);
    });}});
    if(!hit)unmatched.push(word);
  });
  new Set([...Object.keys(up),...Object.keys(down)]).forEach(key=>{sensitivity[key]=clamp(1+((up[key]||1)-1)+((down[key]||1)-1),.75,1.35);});
  return {anchors,sensitivity,regressScale:{},...biases,approved:approvedValue===true,matched,unmatched};
}

function migrateLegacyFiveA(raw,charHash,nowValue) {
  const next=createEmotionAState(charHash,nowValue), source=raw&&raw.current?raw.current:(raw||{});
  ["connection","pride","valence","arousal","immersion"].forEach(k=>{ if(Number.isFinite(Number(source[k]))) next.emotion.current[k]=aClampAxis(k,source[k]); });
  next.migrations.legacyFiveAt=aFinite(nowValue,Date.now());
  next.legacyMeta={lastTick:raw&&raw.lastTick||null,lastActivity:raw&&raw.lastActivity||null};
  return next;
}

function aSeedAround(key,rawValue,oldCenter) {
  const base=A_DEFAULT_BASELINE[key], normalized=(aFinite(rawValue,oldCenter)-oldCenter)/100;
  return aClampAxis(key,base+clamp(normalized,-.15,.15));
}

function migrateDesireDriveA(rawState,driveShadow,nowValue) {
  const state=aClone(rawState||createEmotionAState("",nowValue));
  state.migrations=state.migrations||{};
  if(state.migrations.desireDriveAt) return {state,migrated:false};
  const d=driveShadow&&driveShadow.drives||{};
  const seeds={
    connection:aSeedAround("connection",d.attachment,35),
    valence:aSeedAround("valence",d.joy,35),
    anxiety:aSeedAround("anxiety",d.stress,25),
    fatigue:aSeedAround("fatigue",d.fatigue,25),
    warmth:aSeedAround("warmth",d.intimacy,35)
  };
  Object.entries(seeds).forEach(([k,v])=>{ state.emotion.baseline[k]=v; state.emotion.current[k]=v; });
  const t=state.emotion.temperament;
  t.curiosityBias=clamp(aFinite(d.curiosity,45)/100,0,1); t.reflectionBias=clamp(aFinite(d.reflection,40)/100,0,1);
  t.dutyBias=clamp(aFinite(d.duty,45)/100,0,1); t.socialBias=clamp(aFinite(d.social,40)/100,0,1);
  state.migrations.desireDriveAt=aFinite(nowValue,Date.now()); state.revision=aFinite(state.revision,1)+1; state.updatedTs=state.migrations.desireDriveAt;
  return {state,migrated:true};
}

function moodEvidenceA(label) {
  const text=String(label==null?"":label).trim(), delta={},rules=[];
  A_MOOD_RULES.forEach(([name,re,part])=>{ if(re.test(text)){rules.push(name);Object.entries(part).forEach(([k,v])=>{delta[k]=(delta[k]||0)+v;});} });
  return {label:text.slice(0,40),matched:rules.length>0,rules,delta};
}

function capEmotionDeltasA(sources,perAxisValue,totalValue) {
  const perAxis=Math.max(0,aFinite(perAxisValue,.25)),total=Math.max(0,aFinite(totalValue,.55)),summed={};
  (Array.isArray(sources)?sources:[]).forEach(src=>Object.entries(src&&src.delta||{}).forEach(([k,v])=>{if(A_AXES[k]&&Number.isFinite(Number(v)))summed[k]=(summed[k]||0)+Number(v);}));
  const axisCapped={}; let clippedAxis=false;
  Object.entries(summed).forEach(([k,v])=>{axisCapped[k]=clamp(v,-perAxis,perAxis);if(axisCapped[k]!==v)clippedAxis=true;});
  const l1=Object.values(axisCapped).reduce((n,v)=>n+Math.abs(v),0),scale=l1>total&&l1>0?total/l1:1,applied={};
  Object.entries(axisCapped).forEach(([k,v])=>{applied[k]=v*scale;});
  return {summed,axisCapped,applied,clippedAxis,scaledTotal:scale<1,scale,l1BeforeScale:l1};
}

function applyEmotionAEvent(rawState,event,nowValue) {
  try{
    const state=aClone(rawState),mood=moodEvidenceA(event&&event.moodLabel),sources=[];
    if(event&&Number.isFinite(Number(event.affinityDelta)))sources.push({name:"affinity",delta:{valence:Number(event.affinityDelta)*.05}});
    if(mood.matched)sources.push({name:"mood",delta:mood.delta});
    if(event&&event.delta)sources.push({name:"event",delta:event.delta});
    const capped=capEmotionDeltasA(sources,.25,.55),before={...state.emotion.current},after={...before};
    Object.entries(capped.applied).forEach(([k,v])=>{
      const min=A_AXES[k][0],max=A_AXES[k][1],cur=aClampAxis(k,after[k]);
      const proximity=v>0?(cur-min)/(max-min):(max-cur)/(max-min),edgeScale=Math.max(.25,1-.5*clamp(proximity,0,1));
      const headroom=v>0?max-cur:cur-min,move=Math.sign(v)*Math.min(Math.abs(v)*edgeScale,Math.max(0,headroom)*.8);
      after[k]=aClampAxis(k,cur+move);
    });
    const at=aFinite(nowValue,Date.now()); state.emotion.current=after;state.emotion.lastMoodLabel=mood.label;state.emotion.lastEventTs=at;state.updatedTs=at;state.revision=aFinite(state.revision,1)+1;
    return {state,audit:{sources,summed:capped.summed,applied:Object.fromEntries(Object.keys(after).filter(k=>after[k]!==before[k]).map(k=>[k,after[k]-before[k]])),clippedAxis:capped.clippedAxis,scaledTotal:capped.scaledTotal,totalScale:capped.scale,moodMatched:mood.matched,moodLabel:mood.label,moodRules:mood.rules,moodDictionaryVersion:A_MOOD_DICTIONARY_VERSION}};
  }catch(_){return {state:rawState,audit:{error:"emotion_event_failed",moodMatched:false,moodLabel:"",moodRules:[],moodDictionaryVersion:A_MOOD_DICTIONARY_VERSION}};}
}

function regressEmotionA(rawState,minutesValue,nowValue) {
  try{
    const state=aClone(rawState),mins=clamp(aFinite(minutesValue,0),0,720),base=state.emotion.baseline,current=state.emotion.current,scale=state.emotion.temperament.regressScale||{};
    Object.keys(A_AXES).forEach(k=>{const cur=aClampAxis(k,current[k]),target=aClampAxis(k,base[k]),step=A_REGRESS_PER_MIN[k]*aFinite(scale[k],1)*mins;current[k]=cur>target?Math.max(target,cur-step):cur<target?Math.min(target,cur+step):cur;});
    state.updatedTs=aFinite(nowValue,Date.now());state.revision=aFinite(state.revision,1)+1;return state;
  }catch(_){return rawState;}
}

const A_DISPLAY_LABELS=Object.freeze({connection:"想靠近",pride:"防御感",valence:"愉悦",arousal:"激动",immersion:"沉浸",hurt:"受伤",anger:"愤怒",anxiety:"不安",warmth:"柔软",fatigue:"疲惫"});
function displayProjectionA(rawState,options){
  try{
    const emotion=rawState&&rawState.emotion,base=emotion&&emotion.baseline,current=emotion&&emotion.current;
    if(!base||!current)return {items:[],bottomLine:"",text:"",tokenEstimate:0};
    const threshold=Math.max(.02,aFinite(options&&options.threshold,.08)),maxItems=Math.max(1,Math.min(4,Math.round(aFinite(options&&options.maxItems,4))));
    const ranked=Object.keys(A_AXES).map(key=>{
      const span=A_AXES[key][1]-A_AXES[key][0],delta=aFinite(current[key],base[key])-aFinite(base[key],A_DEFAULT_BASELINE[key]);
      return {key,label:A_DISPLAY_LABELS[key],delta,score:Math.abs(delta)/span};
    }).filter(x=>x.score>=threshold).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).slice(0,maxItems);
    const anchors=emotion.temperament&&Array.isArray(emotion.temperament.anchors)?emotion.temperament.anchors.slice(0,3):[];
    const bottomLine=anchors.length?"底色："+anchors.join("、"):"底色：按自己的常态感受";
    const items=ranked.map(x=>({key:x.key,label:x.label,direction:x.delta>0?"偏高":"偏低",delta:Number(x.delta.toFixed(3))}));
    const text=items.length?bottomLine+"；此刻偏离："+items.map(x=>x.label+x.direction).join("、"):"";
    return {items,bottomLine,text,tokenEstimate:text?Math.ceil(text.length/2):0};
  }catch(_){return {items:[],bottomLine:"",text:"",tokenEstimate:0,error:"display_projection_failed"};}
}

// ── B 关系轴纯状态机（shadow 基础；不负责检测、不注入）────────────
const B_AXIS_KEYS=Object.freeze(["identity","continuity","seriousness","boundary","neglect","repairFailure"]);
const B_FAKE_REPAIRS=Object.freeze(["apology_only","silence","elapsed","mood_softened"]);
const bHash=value=>{let h=5381,s=String(value==null?"":value);for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36);};
function bAxisDefault(){return {pressure:0,active:false,repairLocked:false,episodeId:null,enteredAt:null,lastHarmAt:null,lastTransitionAt:null,repairEvidenceCount:0,repairUnlockedAt:null,triggerEvidenceHash:null,seenEvidenceHashes:[]};}
function createRelationAxesB(enabledAxes,nowValue){
  const enabled=B_AXIS_KEYS.filter(key=>(Array.isArray(enabledAxes)?enabledAxes:B_AXIS_KEYS).includes(key)),axes={};
  enabled.forEach(key=>{axes[key]=bAxisDefault();});
  return {schemaVersion:1,enabledAxes:enabled,axes,lastDetectionTs:null,revision:1,updatedTs:aFinite(nowValue,Date.now())};
}
function bEvidenceHash(event){const ids=Array.isArray(event&&event.evidenceMessageIds)?event.evidenceMessageIds:[];return bHash(ids.join("|")+"|"+String(event&&event.axis||"")+"|"+String(event&&event.kind||""));}
function applyRelationEventB(rawState,event,nowValue){
  try{
    const state=aClone(rawState),at=aFinite(event&&event.at,aFinite(nowValue,Date.now())),axis=event&&event.axis,kind=event&&event.kind,confidence=clamp(aFinite(event&&event.confidence,0),0,1),slot=state&&state.axes&&state.axes[axis];
    const audit={axis,kind,accepted:false,duplicate:false,transition:"none",blockedReason:null,pressureBefore:slot?aFinite(slot.pressure,0):null,pressureAfter:null};
    if(!slot||!state.enabledAxes.includes(axis)){audit.blockedReason="axis_not_enabled";return {state:rawState,audit};}
    const evHash=bEvidenceHash(event),seen=Array.isArray(slot.seenEvidenceHashes)?slot.seenEvidenceHashes:[];
    if(seen.includes(evHash)){audit.duplicate=true;audit.blockedReason="duplicate_evidence";audit.pressureAfter=slot.pressure;return {state,audit};}
    if(kind==="harm"){
      if(event.explicitRelationMeaning!==true){audit.blockedReason="relation_meaning_missing";return {state:rawState,audit};}
      if(event.playfulContext===true){audit.blockedReason="playful_context";return {state:rawState,audit};}
      if(confidence<.55){audit.blockedReason="low_confidence";return {state:rawState,audit};}
      const increment=Math.min(.35,.12+.23*confidence),before=clamp(aFinite(slot.pressure,0),0,1);slot.pressure=clamp(before+increment,0,1);slot.lastHarmAt=at;
      if(!slot.triggerEvidenceHash)slot.triggerEvidenceHash=evHash;
      if(!slot.active&&slot.pressure>=.60){slot.active=true;slot.repairLocked=true;slot.enteredAt=at;slot.lastTransitionAt=at;slot.episodeId="b_"+axis+"_"+at+"_"+evHash;audit.transition="entered";}
      else if(slot.active)audit.transition="stayed";
      audit.accepted=true;
    }else if(kind==="repair_progress"){
      if(!slot.active||!slot.repairLocked){audit.blockedReason="no_locked_episode";return {state:rawState,audit};}
      const repairKind=String(event.repairKind||"");
      if(B_FAKE_REPAIRS.includes(repairKind)){audit.blockedReason="fake_repair_"+repairKind;return {state:rawState,audit};}
      if(repairKind!=="behavior_changed"){audit.blockedReason="repair_kind_invalid";return {state:rawState,audit};}
      if(at<=aFinite(slot.lastHarmAt,0)){audit.blockedReason="repair_not_after_harm";return {state:rawState,audit};}
      if(confidence<.65){audit.blockedReason="repair_confidence_low";return {state:rawState,audit};}
      slot.repairEvidenceCount=Math.max(0,Math.round(aFinite(slot.repairEvidenceCount,0)))+1;
      if(confidence>=.85||slot.repairEvidenceCount>=2){slot.repairLocked=false;slot.repairUnlockedAt=at;slot.lastTransitionAt=at;slot.pressure=Math.max(.35,slot.pressure-.12);audit.transition="repair_unlocked";}
      audit.accepted=true;
    }else{audit.blockedReason="event_kind_invalid";return {state:rawState,audit};}
    slot.seenEvidenceHashes=seen.concat(evHash).slice(-50);state.lastDetectionTs=at;state.updatedTs=at;state.revision=Math.max(1,Math.round(aFinite(state.revision,1)))+1;audit.pressureAfter=slot.pressure;return {state,audit};
  }catch(_){return {state:rawState,audit:{accepted:false,transition:"none",blockedReason:"relation_event_failed"}};}
}
function regressRelationAxesB(rawState,minutesValue,nowValue){
  try{
    const state=aClone(rawState),mins=clamp(aFinite(minutesValue,0),0,7*24*60),at=aFinite(nowValue,Date.now()),transitions=[];
    state.enabledAxes.forEach(key=>{const slot=state.axes[key];if(!slot)return;const floor=(slot.active&&slot.repairLocked) ? 0.35 : 0,rate=(slot.active&&!slot.repairLocked) ? 0.003 : 0.001;slot.pressure=Math.max(floor,clamp(aFinite(slot.pressure,0),0,1)-rate*mins);if(slot.active&&!slot.repairLocked&&slot.pressure<=.22){slot.active=false;slot.lastTransitionAt=at;transitions.push({axis:key,transition:"exited"});}});
    state.updatedTs=at;state.revision=Math.max(1,Math.round(aFinite(state.revision,1)))+1;return {state,transitions};
  }catch(_){return {state:rawState,transitions:[]};}
}

const JiwenEmotionA=Object.freeze({axes:A_AXES,defaultBaseline:A_DEFAULT_BASELINE,regressPerMin:A_REGRESS_PER_MIN,moodDictionaryVersion:A_MOOD_DICTIONARY_VERSION,createState:createEmotionAState,temperamentFromAnchors:temperamentFromAnchorsA,migrateLegacyFive:migrateLegacyFiveA,migrateDesireDrive:migrateDesireDriveA,moodEvidence:moodEvidenceA,capDeltas:capEmotionDeltasA,applyEvent:applyEmotionAEvent,regress:regressEmotionA,displayProjection:displayProjectionA,relationAxisKeys:B_AXIS_KEYS,createRelationAxes:createRelationAxesB,applyRelationEvent:applyRelationEventB,regressRelationAxes:regressRelationAxesB});

if (typeof window !== "undefined") { window.createJiwen = createJiwen; window.JiwenEmotionA=JiwenEmotionA; }
if (typeof module === "object" && module.exports) module.exports={createJiwen,JiwenEmotionA};
})();
