"use strict";
// ============================================================
// 小游戏（games）—— 派对游戏中枢：谁是卧底 / 真心话大冒险 / 狼人杀 / 阿瓦隆
// 每个游戏三种模式（正常/放水/观战）+ 人数上下限 + NPC凑数 + 可选注入最近聊天抓人设。
// 和辩论/梦境一样是独立娱乐场：不写回聊天记忆。
// 引擎逐个做——GAMES[].ready 标记是否已实现；未实现进占位对局。
// ============================================================
(function () {
  const MODES = [
    { key: "normal", zh: "正常", hint: "角色按各自人设发挥真实水平，该赢赢、该拆穿就拆穿。" },
    { key: "easy", zh: "放水", hint: "角色会让着你——关键时刻手下留情、看破也不点破，图个乐。" },
    { key: "spectate", zh: "观战", hint: "你不下场，纯看角色和 NPC 互相博弈；随时能插嘴吐槽、带节奏。" }
  ];
  // 各游戏规格。ready:false = 引擎还没做，先占位。min/max 是「总玩家数」上下限。
  const GAMES = [
    { key: "spy", emoji: "🕵️", zh: "谁是卧底", en: "Who's the Spy", min: 3, max: 12, ready: true,
      desc: "每人拿到一个词，卧底的词略有不同。轮流描述、投票揪出卧底。", rule: "3~12 人 · 1~2 名卧底 · 词系统出" },
    { key: "haigui", emoji: "🐢", zh: "海龟汤", en: "Lateral Puzzle", min: 2, max: 8, ready: false,
      desc: "主持人给一个诡异「汤面」，你们只能问是 / 否问题，一步步还原真相。", rule: "2~8 人 · 题目系统出" },
    { key: "q25", emoji: "❓", zh: "25 问", en: "20 Questions", min: 2, max: 8, ready: false,
      desc: "系统心里想一个东西，你们轮流问是 / 否问题，25 问内猜出来。", rule: "2~8 人 · 题目系统出" },
    { key: "tod", emoji: "🎲", zh: "真心话大冒险", en: "Truth or Dare", min: 2, max: 10, ready: false,
      desc: "转瓶子，指到谁就选真心话或大冒险，题目由在场的人出。", rule: "2~10 人" },
    { key: "werewolf", emoji: "🐺", zh: "狼人杀", en: "Werewolf", min: 5, max: 12, ready: true,
      desc: "狼人夜里行凶，好人白天靠推理投票放逐。当前板子：狼人 + 预言家 + 平民。", rule: "5~12 人 · 预言家局 · 不翻牌" },
    { key: "avalon", emoji: "⚔️", zh: "阿瓦隆", en: "Avalon", min: 5, max: 10, ready: false,
      desc: "正义与邪恶的任务对抗，梅林认得坏人、刺客要在结局刺杀梅林。", rule: "5~10 人 · 任务制" }
  ];
  // 游戏生成统一走这个：更长超时 + 失败重试（人多时单次请求大、思考型模型慢，别一次超时就崩）
  async function callRetry(api, sys, msgs, opts) {
    opts = Object.assign({ timeout: 90000 }, opts || {});
    let last;
    for (let i = 0; i < 2; i++) { try { return await callAI(api, sys, msgs, opts); } catch (e) { last = e; } }
    throw last;
  }
  // 能力≠性格：所有游戏共用的反刻板铁律，焊进每次生成
  const SKILL_RULE ="【能力与性格分开·非常重要】把「性格风格」和「真实水平」当成两件事：性格只决定 TA 怎么说话、什么语气；真实水平由 TA 的职业、背景、受过的训练、人生经历决定，和性格无关。绝不能因为性格开朗 / 单纯 / 憨 / 软就把 TA 演成脑子不好、推理拉垮——一个性格像小太阳但职业是程序员的人，逻辑和推理其实很强、玩推理游戏心里门儿清，只是嘴上仍旧暖乎乎的。按真实水平决定「玩得多好」，按性格决定「怎么表达」。";

  // ---- 通用：分段控件 ----
  function Segmented(props) {
    const t = props.t;
    return h("div", { style: { display: "flex", gap: 6, background: t.bg2, borderRadius: 12, padding: 4 } },
      props.options.map(function (o) {
        const on = o.key === props.value;
        return h("button", { key: o.key, onClick: function () { props.onChange(o.key); },
          style: { flex: 1, padding: "8px 4px", borderRadius: 9, fontFamily: F_BODY, fontSize: 13.5, fontWeight: on ? 700 : 400, color: on ? "#f3efe6" : t.sub, background: on ? t.ink : "transparent", transition: "all .15s" } }, o.zh);
      }));
  }

  // ---- 通用：开关行 ----
  function ToggleRow(props) {
    const t = props.t;
    return h("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0" } },
      h("div", { style: { flex: 1 } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, color: t.ink } }, props.label),
        props.sub ? h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, props.sub) : null),
      h("button", { onClick: props.onToggle, className: "shrink-0", style: { width: 50, height: 29, borderRadius: 999, background: props.on ? t.ink : t.line, position: "relative", transition: "background .2s" } },
        h("span", { style: { position: "absolute", top: 3, left: props.on ? 24 : 3, width: 23, height: 23, borderRadius: 999, background: "#fff", transition: "left .2s" } })));
  }

  // ---- 通用：步进器 ----
  function Stepper(props) {
    const t = props.t;
    const btn = function (label, fn, dis) { return h("button", { onClick: fn, disabled: dis, style: { width: 26, height: 26, borderRadius: 7, border: "1px solid " + t.line, color: dis ? t.line : t.sub, fontFamily: F_BODY, fontSize: 16, lineHeight: "22px", background: t.bg2 } }, label); };
    return h("div", { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } },
      btn("−", function () { props.onChange(Math.max(props.min, props.value - 1)); }, props.value <= props.min),
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, minWidth: 18, textAlign: "center" } }, props.value),
      btn("+", function () { props.onChange(Math.min(props.max, props.value + 1)); }, props.value >= props.max));
  }

  // ---- 存档（非 x_ 前缀 → 不进云同步，对局是临时的）----
  const WOLF_SAVE = "wolf_save";
  function loadWolfSave() { try { return JSON.parse(localStorage.getItem(WOLF_SAVE) || "null"); } catch (e) { return null; } }
  function saveWolf(s) { try { localStorage.setItem(WOLF_SAVE, JSON.stringify(s)); } catch (e) {} }
  function clearWolf() { try { localStorage.removeItem(WOLF_SAVE); } catch (e) {} }

  // ---- 玩家详情卡：点头像回看系统分配的「能力小传」+人设（结束时也给身份）----
  function PlayerCard(props) {
    const t = props.t, p = props.p;
    // 真人角色只显一句 tagline，别把名录里整份人设档案搬进来；NPC 用生成的一句人设
    const persona = p.isUser ? "" : (p.isNpc ? (p.persona || "") : ((p.char && p.char.tagline) || ""));
    return h("div", { onClick: props.onClose, style: { position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 } },
      h("div", { onClick: function (e) { e.stopPropagation(); }, style: { background: t.bg, borderRadius: 16, padding: "18px 18px 20px", width: "100%", maxWidth: 320, maxHeight: "76%", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,.3)" } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } }, props.avatar,
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, p.name + (p.isUser ? "（你）" : "")),
            props.roleText ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: props.roleBad ? "#c0553f" : t.tint, marginTop: 2 } }, props.roleText) : (p.alive === false ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, "已出局（身份不公开）") : null))),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.tint, letterSpacing: .5, marginBottom: 5 } }, "牌桌能力小传（系统评估）"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, color: t.ink, marginBottom: persona ? 14 : 0 } }, p.isUser ? "这是你本人，系统没有替你评估水平——你自己发挥。" : (p.skill || "（没评估到）")),
        persona ? h("div", null,
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, letterSpacing: .5, marginBottom: 5 } }, "人设 / 补充"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.65, color: t.sub } }, persona)) : null,
        h("button", { onClick: props.onClose, style: { marginTop: 16, width: "100%", fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "9px" } }, "关了")));
  }

  // ============================================================
  // 中枢（书架式游戏卡）
  // ============================================================
  function Games(props) {
    const t = useTheme();
    const [game, setGame] = useState(null);       // 进入配置的游戏
    const [session, setSession] = useState(null);  // {game, config, resume, saved} 进入对局
    const [saveTick, setSaveTick] = useState(0);   // 存档变动后强刷横幅
    const wolfSave = loadWolfSave();

    if (session) {
      const engineProps = { config: session.config, game: session.game, active: props.active, bgActive: props.bgActive, characters: props.characters, profile: props.profile, recentChatFor: props.recentChatFor, t: t, toast: props.toast, onBack: function () { setSession(null); setSaveTick(function (x) { return x + 1; }); } };
      if (session.game.key === "spy") return h(SpyGame, engineProps);
      if (session.game.key === "werewolf") return h(WolfGame, Object.assign({}, engineProps, { resume: !!session.resume, savedState: session.saved }));
      return h(GamePlay, { game: session.game, config: session.config, characters: props.characters, profile: props.profile, t: t, onBack: function () { setSession(null); } });
    }
    if (game) return h(GameSetup, {
      game: game, characters: props.characters, profile: props.profile, moods: props.moods, t: t,
      onBack: function () { setGame(null); },
      onStart: function (config) { setSession({ game: game, config: config }); }
    });
    const wolfGameDef = GAMES.find(function (g) { return g.key === "werewolf"; });

    // ---- 游戏架 ----
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "小游戏", en: "Games", onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
        // 未打完的存档：继续 / 弃掉
        wolfSave ? h("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 13, background: t.tint + "16", border: "1px solid " + t.tint, margin: "2px 0 14px" } },
          h("div", { style: { fontSize: 22 } }, "🐺"),
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, "狼人杀 · 上一局没打完"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 1 } }, "第 " + (wolfSave.cycle || 1) + " 个昼夜 · " + ((wolfSave.players || []).filter(function (p) { return p.alive; }).length) + " 人存活")),
          h("button", { onClick: function () { setSession({ game: wolfGameDef, config: wolfSave.config, resume: true, saved: wolfSave }); }, style: { fontFamily: F_BODY, fontSize: 13, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 999, padding: "7px 15px" } }, "继续"),
          h("button", { onClick: function () { clearWolf(); setSaveTick(function (x) { return x + 1; }); }, style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "7px 4px" } }, "弃掉")) : null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7, margin: "2px 2px 14px" } }, "邀角色开一局派对游戏。每局可选正常 / 放水 / 观战，人不够能拉 NPC 凑数。（不写进聊天记忆）"),
        h("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
          GAMES.map(function (g) {
            return h("button", { key: g.key, onClick: function () { setGame(g); },
              className: "active:opacity-80", style: { textAlign: "left", display: "flex", gap: 13, padding: "15px 15px", borderRadius: 15, background: t.bg2, border: "1px solid " + t.line } },
              h("div", { style: { fontSize: 30, lineHeight: 1, width: 40, textAlign: "center", flexShrink: 0, marginTop: 2 } }, g.emoji),
              h("div", { style: { flex: 1, minWidth: 0 } },
                h("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
                  h("span", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, g.zh),
                  h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, letterSpacing: .5, textTransform: "uppercase" } }, g.en),
                  g.ready ? null : h("span", { style: { marginLeft: "auto", fontFamily: F_BODY, fontSize: 10, color: t.tint, border: "1px solid " + t.tint, borderRadius: 999, padding: "1px 7px" } }, "即将上线")),
                h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, lineHeight: 1.55, marginTop: 4 } }, g.desc),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 6 } }, g.rule)));
          })),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, textAlign: "center", lineHeight: 1.7, marginTop: 20 } }, "引擎在逐个做，先把玩法和规则定下来～")));
  }

  // ============================================================
  // 开局配置：模式 + 选人（含人数上下限）+ NPC凑数 + 注入最近聊天
  // ============================================================
  function GameSetup(props) {
    const t = props.t, game = props.game;
    const chars = props.characters || [];
    const [mode, setMode] = useState("normal");
    const [picked, setPicked] = useState([]);        // 选中的角色 id
    const [npcFill, setNpcFill] = useState(true);
    const [npcWant, setNpcWant] = useState(-1);      // 用户想要的 NPC 数；-1 = 跟随「补到最低」
    const [injectChat, setInjectChat] = useState(false);

    const spectate = mode === "spectate";
    const humanPlays = !spectate;                    // 观战时用户不算玩家
    const base = picked.length + (humanPlays ? 1 : 0); // 真人参与者
    const minNpc = npcFill ? Math.max(0, game.min - base) : 0;      // 补到最低所需
    const maxNpc = npcFill ? Math.max(minNpc, game.max - base) : 0; // 加满到 max 的上限
    // npcWant=-1 默认贴着「补到最低」；用户调过就用调后的值，随选人上下夹住
    const needNpc = npcFill ? (npcWant < 0 ? minNpc : Math.min(maxNpc, Math.max(minNpc, npcWant))) : 0;
    const total = base + needNpc;
    const overMax = total > game.max;
    // 观战至少要 2 个 AI 玩家才有的看；否则至少 1 个角色
    const tooFew = spectate ? (picked.length + needNpc) < 2 : total < game.min;
    const canStart = !overMax && !tooFew && picked.length + needNpc > 0;

    const toggle = function (id) {
      setPicked(function (p) { return p.indexOf(id) >= 0 ? p.filter(function (x) { return x !== id; }) : p.concat([id]); });
    };
    const modeHint = (MODES.find(function (m) { return m.key === mode; }) || {}).hint || "";

    let countMsg;
    if (overMax) countMsg = "人太多了，" + game.zh + "最多 " + game.max + " 人（现在 " + total + "）";
    else if (tooFew) countMsg = spectate ? "观战至少要 2 个角色下场" : "还差人——至少 " + game.min + " 人" + (npcFill ? "（可加 NPC 凑数）" : "，或开 NPC 凑数");
    else countMsg = "共 " + total + " 人" + (humanPlays ? "（含你）" : "（你观战）") + (needNpc ? " · 含 " + needNpc + " 个 NPC" : "");

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: game.zh, en: game.en, onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-32" },
        // 规则条
        h("div", { style: { display: "flex", gap: 11, alignItems: "center", padding: "12px 14px", borderRadius: 13, background: t.bg2, margin: "2px 0 16px" } },
          h("div", { style: { fontSize: 26, width: 34, textAlign: "center" } }, game.emoji),
          h("div", { style: { flex: 1 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, lineHeight: 1.55 } }, game.desc),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4 } }, game.rule))),

        // 模式
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 13, color: t.ink, marginBottom: 8 } }, "模式"),
        h(Segmented, { t: t, value: mode, options: MODES, onChange: setMode }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.6, margin: "8px 2px 20px" } }, modeHint),

        // 选人
        h("div", { style: { display: "flex", alignItems: "baseline", marginBottom: 8 } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 13, color: t.ink } }, spectate ? "上场的角色" : "邀谁一起玩"),
          h("div", { style: { marginLeft: "auto", fontFamily: F_BODY, fontSize: 11.5, color: overMax || tooFew ? "#c0553f" : t.fog } }, countMsg)),
        chars.length === 0
          ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: "14px 2px" } }, "还没有角色，先去「名录」建几个")
          : h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
              chars.map(function (c) {
                const on = picked.indexOf(c.id) >= 0;
                return h("button", { key: c.id, onClick: function () { toggle(c.id); },
                  style: { display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 12, background: on ? (t.tint + "16") : t.bg2, border: "1px solid " + (on ? t.tint : t.line) } },
                  h(Avatar, { character: c, size: 34, radius: 10 }),
                  h("div", { style: { flex: 1, textAlign: "left", minWidth: 0 } },
                    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.name),
                    h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.tagline || "")),
                  h("div", { style: { width: 22, height: 22, borderRadius: 999, flexShrink: 0, border: "2px solid " + (on ? t.tint : t.line), background: on ? t.tint : "transparent", color: "#fff", fontSize: 13, lineHeight: "19px", textAlign: "center" } }, on ? "✓" : ""));
              })),

        // 选项
        h("div", { style: { marginTop: 14, borderTop: "1px solid " + t.line } },
          h(ToggleRow, { t: t, label: "NPC 凑数", sub: "自动生成 NPC 补到最低人数——NPC 也有自己的人设和水平，不会为了推进而崩。", on: npcFill, onToggle: function () { setNpcFill(!npcFill); } }),
          // NPC 数量步进：默认补到最低，可继续加到 max（人多局更长、更看得出博弈）
          (npcFill && maxNpc > 0) ? h("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0 12px" } },
            h("div", { style: { flex: 1 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, color: t.ink } }, "NPC 数量"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, "最少 " + minNpc + " 个补到 " + game.min + " 人，最多可加到 " + game.max + " 人（局更长、更看得出门道）。")),
            h(Stepper, { t: t, value: needNpc, min: minNpc, max: maxNpc, onChange: function (v) { setNpcWant(v); } })) : null,
          h("div", { style: { borderTop: "1px solid " + t.line } }),
          h(ToggleRow, { t: t, label: "注入最近聊天", sub: "把最近的聊天喂给上场角色，让 TA 带着当前的人设、心情、你俩的近况上场。只读不写——不会记进聊天记忆。", on: injectChat, onToggle: function () { setInjectChat(!injectChat); } }))),

      // 底部开始
      h("div", { className: "shrink-0", style: { padding: "12px 18px calc(env(safe-area-inset-bottom) + 16px)", borderTop: "1px solid " + t.line } },
        h("button", { onClick: function () { if (canStart) props.onStart({ mode: mode, charIds: picked.slice(), npcFill: npcFill, npcCount: needNpc, injectChat: injectChat, total: total }); },
          disabled: !canStart, className: "w-full active:opacity-80",
          style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: canStart ? t.ink : t.line, borderRadius: 13, padding: "13px" } },
          spectate ? "开始观战" : "开始游戏")));
  }

  // ============================================================
  // 对局（引擎未做前的占位：回显本局配置，确认整条链路通）
  // ============================================================
  function GamePlay(props) {
    const t = props.t, game = props.game, cfg = props.config;
    const names = (cfg.charIds || []).map(function (id) { const c = (props.characters || []).find(function (x) { return x.id === id; }); return c ? c.name : null; }).filter(Boolean);
    const modeZh = (MODES.find(function (m) { return m.key === cfg.mode; }) || {}).zh || cfg.mode;
    const row = function (k, v) { return h("div", { style: { display: "flex", padding: "9px 0", borderBottom: "1px solid " + t.line } },
      h("div", { style: { width: 92, fontFamily: F_BODY, fontSize: 13, color: t.fog, flexShrink: 0 } }, k),
      h("div", { style: { flex: 1, fontFamily: F_BODY, fontSize: 13.5, color: t.ink, lineHeight: 1.5 } }, v)); };
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: game.zh, en: game.en, onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-10", style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { textAlign: "center", padding: "30px 0 18px" } },
          h("div", { style: { fontSize: 54, lineHeight: 1 } }, game.emoji),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, marginTop: 12 } }, game.zh + " · 引擎开发中"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, marginTop: 6, lineHeight: 1.6 } }, "玩法和规则已经定好，这局的设置也收到了。\n引擎马上就来，先睹为快 👇")),
        h("div", { style: { background: t.bg2, borderRadius: 14, padding: "6px 15px", marginTop: 8 } },
          row("模式", modeZh),
          row("上场角色", names.length ? names.join("、") : "（无）"),
          row("总人数", cfg.total + " 人" + (cfg.mode === "spectate" ? "（你观战）" : "（含你）")),
          row("NPC 凑数", cfg.npcCount ? "补 " + cfg.npcCount + " 个 NPC" : (cfg.npcFill ? "开（本局够人，没补）" : "关")),
          row("注入最近聊天", cfg.injectChat ? "开——带当前人设/心情上场" : "关")),
        h("button", { onClick: props.onBack, className: "active:opacity-80", style: { marginTop: 22, alignSelf: "center", fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "10px 26px" } }, "返回改设置")));
  }

  // ============================================================
  // 谁是卧底 · 引擎
  // ============================================================
  const AC = (typeof ANTI_CLICHE !== "undefined") ? ANTI_CLICHE + "\n\n" : "";

  // 开局：出词 + 生成 NPC + 给每个玩家写「牌桌能力小传」（能力≠性格）
  async function setupSpy(api, realPlayers, npcCount) {
    const lines = realPlayers.map(function (p, i) { return (i + 1) + ". " + p.name + "：" + (p.persona || "（没写人设）"); }).join("\n");
    const sys = AC + SKILL_RULE + "\n\n你是「谁是卧底」的裁判 + 能力评估器。\n" +
      "1. 出一对词 pair：civ 平民词、spy 卧底词——两词【相关但不同】、都能描述、难度适中、别太生僻，别用明显包含关系的（如「苹果 / 苹果手机」不行；「咖啡 / 奶茶」「钢琴 / 吉他」这种才好）。\n" +
      "2. 生成 " + npcCount + " 个 NPC 玩家：name 中文名 + persona 一句人设（含【职业】与性格，尽量多样、别都是学生、别一个味）。\n" +
      "3. 给【每一个真实玩家】各写一句 skill「牌桌能力小传」：按上面的能力与性格分开原则，点出 TA 玩这种推理游戏时——藏词、听别人描述抓破绽、被怀疑时嘴硬博弈——的【真实强弱】（由职业背景推，别被性格带偏）。NPC 的 skill 也一并给。\n\n" +
      "【真实玩家】\n" + (lines || "（无）") +
      "\n\n【输出】只输出 JSON：{\"pair\":{\"civ\":\"\",\"spy\":\"\"},\"npcs\":[{\"name\":\"\",\"persona\":\"\",\"skill\":\"\"}],\"skills\":[{\"name\":\"真实玩家名\",\"skill\":\"能力小传\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "发牌：给词、" + npcCount + " 个 NPC、每个人的能力小传。" }], { maxTokens: 4500 });
    return extractJSON(raw) || {};
  }

  // 一轮描述：让存活的 AI 玩家各说一句（批量一次调用）
  async function genClues(api, speakers, priorClues, roundNum, mode) {
    const prior = priorClues.length ? priorClues.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n") : "（本轮你们最先描述，前面还没人说）";
    const who = speakers.map(function (s) { return "■ " + s.name + "（TA 的词是「" + s.word + "」）真实水平：" + (s.skill || "普通"); }).join("\n");
    const easy = mode === "easy" ? "\n【放水局】适当留点破绽、别一上来就把话说得滴水不漏，给真人玩家留机会。" : "";
    const sys = AC + SKILL_RULE + "\n\n「谁是卧底」第 " + roundNum + " 轮描述。规则：每人用【一句话】描述自己的词，不能直接说出这个词、也别露骨到一秒被猜穿，但要具体到能自证不是瞎编。各人只知道自己的词、不知道谁和自己不同；若发现别人描述和你的词对不上，说明你可能是少数派（卧底），要沉住气往大家方向靠、别自曝。按每个人的真实水平决定发挥：强的更会藏、更精准，弱的更容易露。" + easy +
      "\n\n【本轮已说过的】\n" + prior + "\n\n【现在这些人各说一句（按顺序）】\n" + who +
      "\n\n【输出】只输出 JSON：{\"clues\":[{\"name\":\"玩家名\",\"text\":\"一句描述\"}]}，顺序照上面。";
    const raw = await callRetry(api, sys, [{ role: "user", content: "各说一句。" }], { maxTokens: 4000 });
    const p = extractJSON(raw);
    return (p && Array.isArray(p.clues)) ? p.clues : [];
  }

  // 投票：存活 AI 各投一人 + 理由（卧底会误导）
  async function genVotes(api, voters, allClues, aliveNames, mode, userName) {
    const clues = allClues.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n");
    const who = voters.map(function (v) { return "■ " + v.name + "（" + (v.role === "spy" ? "你其实是卧底：把票投给某个你觉得像平民的人来误导，别投出真正的少数派" : "你是平民：凭描述投你真心最怀疑的那个") + "）真实水平：" + (v.skill || "普通"); }).join("\n");
    const easy = (mode === "easy" && userName) ? "\n【放水局】别精准锁定真人「" + userName + "」，就算怀疑 TA 也可以手下留情、投别人或说再看看。" : "";
    const sys = AC + SKILL_RULE + "\n\n「谁是卧底」投票。根据目前【所有描述】，下面每人各投一个要投出局的人 + 一句短理由。按真实水平：推理强的投得准，弱的易被带偏。**实在没把握可以弃票**（target 填「弃票」），但别全场弃票。理由别露上帝视角（别说“我是卧底所以…”）。" + easy +
      "\n\n【可投的存活玩家】" + aliveNames.join("、") + "\n\n【目前所有描述】\n" + clues + "\n\n【要投票的人】\n" + who +
      "\n\n【输出】只输出 JSON：{\"votes\":[{\"name\":\"投票人\",\"target\":\"被投的人，或「弃票」\",\"reason\":\"一句理由\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "投票。" }], { maxTokens: 3500 });
    const p = extractJSON(raw);
    return (p && Array.isArray(p.votes)) ? p.votes : [];
  }

  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = r[i]; r[i] = r[j]; r[j] = x; } return r; }

  function SpyGame(props) {
    const t = props.t, cfg = props.config;
    const api = props.active;
    const [phase, setPhase] = useState("loading");   // loading|reveal|describe|vote|result|error
    const [players, setPlayers] = useState([]);
    const [round, setRound] = useState(1);
    const [log, setLog] = useState([]);
    const [roundClues, setRoundClues] = useState([]); // 本轮已收集的描述（含用户）
    const [allClues, setAllClues] = useState([]);     // 全场描述（喂投票）
    const [userClue, setUserClue] = useState("");
    const [userVote, setUserVote] = useState(null);
    const [busy, setBusy] = useState(false);
    const [winner, setWinner] = useState(null);
    const [errMsg, setErrMsg] = useState("");
    const [detail, setDetail] = useState(null);
    const logRef = useRef(null);
    const started = useRef(false);

    const me = players.find(function (p) { return p.isUser; });
    const alive = players.filter(function (p) { return p.alive; });
    const aliveAI = alive.filter(function (p) { return !p.isUser; });
    const pushLog = function (items) { setLog(function (L) { return L.concat(items); }); };
    useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, phase, busy]);

    // ---- 开局 ----
    useEffect(function () {
      if (started.current) return; started.current = true;
      (async function () {
        try {
          if (!api) { setErrMsg("请先到设置配置 API"); setPhase("error"); return; }
          const chars = (cfg.charIds || []).map(function (id) { return (props.characters || []).find(function (c) { return c.id === id; }); }).filter(Boolean);
          const inject = cfg.injectChat && props.recentChatFor;
          const realPlayers = chars.map(function (c) {
            let persona = c.persona || "";
            if (inject) { const rc = props.recentChatFor(c.id); if (rc) persona += "\n（近况参考：" + rc.slice(-500) + "）"; }
            return { id: c.id, name: c.name, persona: persona, char: c };
          });
          const npcNeed = cfg.npcCount || 0;
          const data = await setupSpy(api, realPlayers, npcNeed);
          const pair = data.pair && data.pair.civ && data.pair.spy ? data.pair : { civ: "猫", spy: "老虎" };
          const skillOf = {};
          (data.skills || []).forEach(function (s) { if (s && s.name) skillOf[s.name] = s.skill || ""; });
          // 组装玩家
          const list = [];
          realPlayers.forEach(function (p) { list.push({ key: p.id, name: p.name, char: p.char, isUser: false, isNpc: false, skill: skillOf[p.name] || "" }); });
          if (cfg.mode !== "spectate") { const pf = props.profile || {}; list.push({ key: "user", name: pf.name || "你", char: { name: pf.name || "你", avatarImage: pf.avatarImage, color: pf.color || t.tint }, isUser: true, isNpc: false, skill: "" }); }
          const npcs = (data.npcs || []).slice(0, npcNeed);
          for (let i = 0; i < npcNeed; i++) {
            const n = npcs[i] || {};
            list.push({ key: "npc_" + i, name: n.name || ("玩家" + (i + 1)), char: null, isUser: false, isNpc: true, skill: n.skill || "普通", persona: n.persona || "" });
          }
          // 派角色：随机若干卧底
          const spyCount = list.length >= 6 ? 2 : 1;
          const spies = {};
          shuffle(list.map(function (_, i) { return i; })).slice(0, spyCount).forEach(function (i) { spies[i] = true; });
          list.forEach(function (p, i) { p.role = spies[i] ? "spy" : "civ"; p.word = spies[i] ? pair.spy : pair.civ; p.alive = true; });
          setPlayers(list);
          pushLog([{ type: "info", text: "本局 " + list.length + " 人，其中 " + spyCount + " 名卧底。发牌完毕——" + (cfg.mode === "spectate" ? "你观战，随时可以插嘴带节奏。" : "看看你的词，开始描述。") }]);
          setPhase("reveal");
        } catch (e) { setErrMsg((e && e.message) || "开局失败，重试"); setPhase("error"); }
      })();
    }, []);

    // ---- 描述阶段 ----
    const beginDescribe = function () {
      setRoundClues([]); setUserClue("");
      setPhase("describe");
      // 用户不在场/已出局 → 直接让 AI 描述
      const meAlive = me && me.alive;
      if (!meAlive) aiDescribe([]);
    };
    const aiDescribe = async function (prior) {
      setBusy(true);
      try {
        const speakers = shuffle(aliveAI).map(function (p) { return { name: p.name, word: p.word, skill: p.skill }; });
        const clues = await genClues(api, speakers, prior, round, cfg.mode);
        const norm = speakers.map(function (s) {
          const hit = clues.find(function (c) { return c.name && c.name.indexOf(s.name) >= 0 || (s.name.indexOf(c.name || "###") >= 0); });
          return { name: s.name, text: (hit && hit.text) || "……（想了想，没说清）" };
        });
        const merged = prior.concat(norm);
        setRoundClues(merged);
        setAllClues(function (A) { return A.concat(norm.map(function (c) { return { name: c.name, text: c.text }; })); });
        pushLog((prior.length ? [] : [{ type: "round", n: round }]).concat(norm.map(function (c) { return { type: "clue", name: c.name, text: c.text }; })));
        setPhase("vote"); setUserVote(null);
      } catch (e) { props.toast && props.toast("描述失败：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };
    const submitUserClue = function () {
      const v = userClue.trim(); if (!v) return;
      const mine = [{ name: me.name, text: v }];
      pushLog([{ type: "round", n: round }, { type: "clue", name: me.name, text: v, mine: true }]);
      setAllClues(function (A) { return A.concat([{ name: me.name, text: v }]); });
      setUserClue("");
      aiDescribe(mine);
    };

    // ---- 投票阶段 ----
    const tallyAndEliminate = function (votes) {
      // votes: [{voter, target}]
      pushLog([{ type: "sep", text: "—— 投票 ——" }].concat(votes.map(function (v) { return { type: "vote", name: v.voter, target: v.target, reason: v.reason }; })));
      const count = {};
      votes.forEach(function (v) { if (v.target) count[v.target] = (count[v.target] || 0) + 1; });
      let max = -1, tied = [];
      Object.keys(count).forEach(function (name) { if (count[name] > max) { max = count[name]; tied = [name]; } else if (count[name] === max) tied.push(name); });
      const outName = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
      const out = players.find(function (p) { return p.alive && p.name === outName; });
      if (!out) { // 没投出有效目标，直接进入下一轮
        pushLog([{ type: "info", text: "没投出有效结果，继续下一轮。" }]);
        setRound(function (r) { return r + 1; }); beginDescribe(); return;
      }
      const next = players.map(function (p) { return p === out ? Object.assign({}, p, { alive: false }) : p; });
      pushLog([{ type: "out", name: out.name, role: out.role, isUser: out.isUser }]);
      setPlayers(next);
      // 结算
      const al = next.filter(function (p) { return p.alive; });
      const spyLeft = al.filter(function (p) { return p.role === "spy"; }).length;
      const civLeft = al.length - spyLeft;
      if (spyLeft === 0) { setWinner("civ"); setPhase("result"); return; }
      if (spyLeft >= civLeft) { setWinner("spy"); setPhase("result"); return; }
      setRound(function (r) { return r + 1; });
      // 用最新存活名单重开描述
      setTimeout(function () { setRoundClues([]); setUserClue(""); setPhase("describe"); const meA = next.find(function (p) { return p.isUser; }); if (!(meA && meA.alive)) aiDescribeWith(next, [], round + 1); }, 40);
    };
    // 用指定名单跑 AI 描述（淘汰后名单已变，闭包里的 aliveAI 会过期，这里显式传）
    const aiDescribeWith = async function (plist, prior, rnd) {
      setBusy(true);
      try {
        const aAI = plist.filter(function (p) { return p.alive && !p.isUser; });
        const speakers = shuffle(aAI).map(function (p) { return { name: p.name, word: p.word, skill: p.skill }; });
        const clues = await genClues(api, speakers, prior, rnd, cfg.mode);
        const norm = speakers.map(function (s) { const hit = clues.find(function (c) { return c.name && (c.name.indexOf(s.name) >= 0 || s.name.indexOf(c.name) >= 0); }); return { name: s.name, text: (hit && hit.text) || "……" }; });
        setRoundClues(prior.concat(norm));
        setAllClues(function (A) { return A.concat(norm.map(function (c) { return { name: c.name, text: c.text }; })); });
        pushLog((prior.length ? [] : [{ type: "round", n: rnd }]).concat(norm.map(function (c) { return { type: "clue", name: c.name, text: c.text }; })));
        setPhase("vote"); setUserVote(null);
      } catch (e) { props.toast && props.toast("描述失败：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };
    const runVote = async function (userTarget) {
      setBusy(true);
      try {
        const voters = aliveAI.map(function (p) { return { name: p.name, role: p.role, skill: p.skill }; });
        const aliveNames = alive.map(function (p) { return p.name; });
        const raw = await genVotes(api, voters, allClues.filter(function (c) { return c.name; }), aliveNames, cfg.mode, me && me.alive ? me.name : "");
        const votes = voters.map(function (v) {
          const hit = raw.find(function (r) { return r.name && (r.name.indexOf(v.name) >= 0 || v.name.indexOf(r.name) >= 0); });
          const target = hit && hit.target ? String(hit.target) : "";
          const abstain = !target || /弃票|弃权|不投|放弃|abstain|pass|none|null/i.test(target);
          // 对齐到存活玩家；弃票或对不上名字都算弃票（不再随机硬投）
          const tp = abstain ? null : alive.find(function (p) { return p.name === target || target.indexOf(p.name) >= 0; });
          return { voter: v.name, target: tp ? tp.name : null, reason: (hit && hit.reason) || (abstain ? "弃票" : "") };
        });
        if (me && me.alive && userTarget && userTarget !== "__abstain__") votes.push({ voter: me.name, target: userTarget, reason: "（你的一票）" });
        else if (me && me.alive && userTarget === "__abstain__") votes.push({ voter: me.name, target: null, reason: "弃票" });
        tallyAndEliminate(votes);
      } catch (e) { props.toast && props.toast("投票失败：" + ((e && e.message) || "重试")); setBusy(false); }
    };

    // ---- 渲染 ----
    const pAvatar = function (p, size) {
      if (p && p.char) return h(Avatar, { character: p.char, size: size, radius: Math.round(size * 0.3) });
      return h("div", { style: { width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, background: p && p.isUser ? t.tint : t.line, color: "#fff", fontFamily: F_DISPLAY, fontSize: Math.round(size * 0.46), display: "flex", alignItems: "center", justifyContent: "center" } }, ((p && p.name) || "?").slice(0, 1));
    };
    const pByName = function (nm) { return players.find(function (p) { return p.name === nm; }); };

    const header = h(Head, { zh: "谁是卧底", en: "Who's the Spy", onBack: props.onBack });

    if (phase === "error") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 30 } },
        h("div", { style: { fontSize: 40 } }, "🕵️"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.sub, textAlign: "center", lineHeight: 1.6 } }, errMsg),
        h("button", { onClick: props.onBack, style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "10px 24px" } }, "返回")));

    if (phase === "loading") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 } },
        h("div", { style: { fontSize: 40 } }, "🃏"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, "发牌中·评估每个人的真实水平…")));

    // 存活玩家条
    const roster = h("div", { className: "shrink-0", style: { display: "flex", gap: 10, overflowX: "auto", padding: "10px 16px", borderBottom: "1px solid " + t.line } },
      players.map(function (p) {
        return h("button", { key: p.key, onClick: function () { setDetail(p); }, className: "active:opacity-70", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: p.alive ? 1 : 0.32, flexShrink: 0, width: 46 } },
          h("div", { style: { position: "relative" } }, pAvatar(p, 38),
            !p.alive ? h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 } }, "✖") : null),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.sub, maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" } }, p.name + (p.isUser ? "(你)" : "")));
      }));

    // 日志流
    const logView = h("div", { ref: logRef, className: "flex-1 overflow-y-auto", style: { padding: "12px 16px 16px" } },
      log.map(function (it, i) {
        if (it.type === "round") return h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.fog, margin: "14px 0 8px", letterSpacing: 1 } }, "· 第 " + it.n + " 轮描述 ·");
        if (it.type === "sep") return h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.tint, margin: "12px 0 6px" } }, it.text);
        if (it.type === "info") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.6, margin: "4px 0", textAlign: "center" } }, it.text);
        if (it.type === "out") return h("div", { key: i, style: { textAlign: "center", margin: "8px 0", fontFamily: F_BODY, fontSize: 13, color: it.role === "spy" ? "#3f6d5a" : "#c0553f" } }, "🗳 " + it.name + (it.isUser ? "(你)" : "") + " 被投出局 —— TA 是【" + (it.role === "spy" ? "卧底" : "平民") + "】");
        if (it.type === "clue") {
          const p = pByName(it.name);
          return h("div", { key: i, style: { display: "flex", gap: 8, margin: "8px 0" } },
            pAvatar(p, 30),
            h("div", { style: { flex: 1 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 2 } }, it.name + (it.mine ? "(你)" : "")),
              h("div", { style: { display: "inline-block", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.5, color: t.ink, background: it.mine ? (t.tint + "1c") : t.bg2, borderRadius: 10, padding: "7px 11px" } }, it.text)));
        }
        if (it.type === "vote") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "3px 0", lineHeight: 1.5 } }, "· " + it.name + (it.target ? " → 投 " + it.target : " → 弃票") + (it.reason && it.target ? "：" + it.reason : ""));
        return null;
      }));

    // 底部动作区
    let action = null;
    const myWordBanner = me ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "你的词：", h("b", { style: { color: t.ink, fontSize: 14 } }, me.word)) : null;
    if (phase === "reveal") {
      action = h("div", null, myWordBanner,
        h("button", { onClick: beginDescribe, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "13px" } }, cfg.mode === "spectate" ? "开始（看他们描述）" : "开始描述"));
    } else if (phase === "describe") {
      if (busy) action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…大家在想怎么描述");
      else if (me && me.alive) action = h("div", null, myWordBanner,
        h("div", { style: { display: "flex", gap: 8 } },
          h("input", { value: userClue, onChange: function (e) { setUserClue(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submitUserClue(); }, placeholder: "用一句话描述你的词（别说出词本身）", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "11px 14px", borderRadius: 12, border: "1px solid " + t.line, background: t.bg2, color: t.ink, outline: "none" } }),
          h("button", { onClick: submitUserClue, style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 12, padding: "0 18px" } }, "说")));
      else action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…");
    } else if (phase === "vote") {
      if (busy) action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…计票中");
      else if (me && me.alive) {
        const targets = alive.filter(function (p) { return p.name !== me.name; });
        action = h("div", null,
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "投谁是卧底？"),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 10 } },
            targets.map(function (p) {
              const on = userVote === p.name;
              return h("button", { key: p.key, onClick: function () { setUserVote(p.name); }, style: { display: "flex", alignItems: "center", gap: 6, fontFamily: F_BODY, fontSize: 13, color: on ? "#fff" : t.ink, background: on ? t.tint : t.bg2, border: "1px solid " + (on ? t.tint : t.line), borderRadius: 999, padding: "6px 12px 6px 6px" } }, pAvatar(p, 22), p.name);
            }).concat([h("button", { key: "abstain", onClick: function () { setUserVote("__abstain__"); }, style: { fontFamily: F_BODY, fontSize: 13, color: userVote === "__abstain__" ? "#fff" : t.sub, background: userVote === "__abstain__" ? t.fog : t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 14px" } }, "弃票")])),
          h("button", { onClick: function () { if (userVote) runVote(userVote); }, disabled: !userVote, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: userVote ? t.ink : t.line, borderRadius: 13, padding: "12px" } }, "投票"));
      } else {
        action = h("button", { onClick: function () { runVote(null); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "12px" } }, "看他们投票");
      }
    } else if (phase === "result") {
      action = h("div", null,
        h("div", { style: { textAlign: "center", fontFamily: F_DISPLAY, fontSize: 20, color: winner === "spy" ? "#3f6d5a" : "#c0553f", marginBottom: 6 } }, winner === "spy" ? "🕵️ 卧底获胜" : "🎉 平民获胜"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, textAlign: "center", lineHeight: 1.7, marginBottom: 12 } },
          "卧底：" + players.filter(function (p) { return p.role === "spy"; }).map(function (p) { return p.name; }).join("、") + "　词：平民「" + (players.find(function (p) { return p.role === "civ"; }) || {}).word + "」 / 卧底「" + (players.find(function (p) { return p.role === "spy"; }) || {}).word + "」"),
        h("div", { style: { display: "flex", gap: 10 } },
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "12px" } }, "返回"),
          h("button", { onClick: function () { props.onBack(); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 12, padding: "12px" } }, "回中枢再来一局")));
    }

    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } }, header, roster, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)", maxHeight: "34vh", overflowY: "auto" } }, action),
      detail ? h(PlayerCard, { p: detail, t: t, avatar: pAvatar(detail, 44), roleText: phase === "result" ? ("身份：" + (detail.role === "spy" ? "卧底" : "平民")) : null, roleBad: detail.role === "spy", onClose: function () { setDetail(null); } }) : null);
  }

  // ============================================================
  // 狼人杀 · 引擎（最简板子：狼人 + 预言家 + 平民；完整夜晚交互；不翻牌）
  // ============================================================
  function wolfCount(n) { return n >= 9 ? 3 : n >= 6 ? 2 : 1; }
  // 身份铁律：只有这三种，别自创第四种。以后加神职时改这一处即可。
  const BOARD_LINE = "【身份铁律】本局只有【狼人 / 预言家 / 平民】三种身份，谁都别自创或声称第四种身份——没有女巫、警长、警官、猎人、守卫、白痴等任何神职或头衔；能跳的身份只有『预言家』，狼人也只能悍跳预言家。";

  // 开局：生成 NPC + 每人「牌桌能力小传」（狼人杀相关：悍跳/伪装/逻辑/带节奏）
  async function setupWolf(api, realPlayers, npcCount) {
    const lines = realPlayers.map(function (p, i) { return (i + 1) + ". " + p.name + "：" + (p.persona || "（没写人设）"); }).join("\n");
    const sys = AC + SKILL_RULE + "\n\n你是「狼人杀」的能力评估器 + NPC 生成器。\n" +
      "1. 生成 " + npcCount + " 个 NPC 玩家：name 中文名 + persona 一句人设（含【职业】与性格，尽量多样、别都是学生）。\n" +
      "2. 给【每一个真实玩家】各写一句 skill「牌桌能力小传」：按能力与性格分开的原则，点出 TA 玩狼人杀时——伪装/悍跳、听发言抓逻辑漏洞、带节奏说服人、被架时嘴硬翻盘——的【真实强弱】（由职业背景推，别被性格带偏）。NPC 的 skill 也给。\n\n" +
      "【真实玩家】\n" + (lines || "（无）") +
      "\n\n【输出】只输出 JSON：{\"npcs\":[{\"name\":\"\",\"persona\":\"\",\"skill\":\"\"}],\"skills\":[{\"name\":\"真实玩家名\",\"skill\":\"能力小传\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "生成 " + npcCount + " 个 NPC + 每人能力小传。" }], { maxTokens: 4500 });
    return extractJSON(raw) || {};
  }

  // 夜晚：替 AI 决定狼刀 / 预言家验人（只求需要的字段）
  async function genNight(api, opts) {
    const need = [];
    if (opts.needWolf) need.push("\n【狼队各自投刀】" + opts.wolfTeam.join("、") + " 各自独立说出今晚想刀谁——按各人的想法和水平选（挑对好人威胁大的：疑似预言家、发言强的；别刀自己人）。每头狼给【一个】目标，不用统一。");
    if (opts.needSeer) need.push("\n【预言家】" + opts.seer.name + " 选一个【没查过】的人查验（已查：" + (opts.seer.known.length ? opts.seer.known.map(function (k) { return k.name + "=" + (k.isWolf ? "狼" : "好"); }).join("、") : "无") + "），挑可疑或关键的人。");
    const schema = {}; if (opts.needWolf) schema.wolfVotes = [{ name: "狼名", target: "TA 想刀的人" }]; if (opts.needSeer) schema.seerCheck = "要查的人名";
    const sys = AC + SKILL_RULE + "\n\n狼人杀·天黑，你是法官，替 AI 玩家做今晚的决定。" + need.join("") +
      "\n\n【存活】" + opts.aliveNames.join("、") + (opts.log ? "\n【目前局况】\n" + opts.log : "") +
      "\n\n【输出】只输出 JSON：" + JSON.stringify(schema);
    const raw = await callRetry(api, sys, [{ role: "user", content: "做今晚的决定。" }], { maxTokens: 1600 });
    return extractJSON(raw) || {};
  }
  // 狼刀投票计票：多数决，平票随机；对齐到存活玩家
  function tallyKill(votes, list) {
    const cnt = {};
    (votes || []).forEach(function (v) { const tp = v && v.target && list.find(function (p) { return p.alive && (p.name === v.target || String(v.target).indexOf(p.name) >= 0); }); if (tp) cnt[tp.name] = (cnt[tp.name] || 0) + 1; });
    let max = -1, tied = []; Object.keys(cnt).forEach(function (nm) { if (cnt[nm] > max) { max = cnt[nm]; tied = [nm]; } else if (cnt[nm] === max) tied.push(nm); });
    return tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
  }

  // 立场纪要 → 文本（喂模型保持前后一致）
  function stanceText(stances) {
    const keys = Object.keys(stances || {});
    if (!keys.length) return "";
    return "\n\n【目前各人的立场纪要（每个人的身份声称/站谁/怀疑谁——**发言务必和自己这条保持连贯，别无缘无故改口、前后矛盾**，除非确有新信息把 TA 说服才转向，转向也要说清为什么）】\n" + keys.map(function (k) { return "· " + k + "：" + stances[k]; }).join("\n");
  }
  // 白天发言：存活 AI 依次发一段（带各自身份/私密信息）；同时回一份立场纪要供后续保持一致
  async function genSpeeches(api, speakers, dayNum, prior, deaths, mode, userName, stances) {
    const who = speakers.map(function (s) { return "■ " + s.name + "（真实水平：" + (s.skill || "普通") + "）\n   身份与私密：" + s.priv; }).join("\n");
    const p = prior.length ? prior.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n") : "（你们最先发言）";
    const easy = mode === "easy" ? "\n【放水局】狼别演得滴水不漏，给真人留点破绽。" : "";
    const day1 = dayNum <= 1 ? "\n【第一天·信息很少】刚死一个人、还没任何验人公开，别硬咬死谁是狼；多给方向、贴印象、定策略。真预言家自己判断要不要今天就跳——要跳就直接报验人结果，别光在那催『预言家快跳』。" : "";
    const sys = AC + SKILL_RULE + "\n\n" + BOARD_LINE + "\n\n狼人杀·第 " + dayNum + " 天白天发言。每人轮流发一段【短发言】(2~4句)：分析昨晚的死、站边、表身份或隐藏、抓狼或自证。狼要伪装/悍跳预言家/带偏好人/护队友；预言家可跳身份报验人建信任；平民靠逻辑找狼。\n**别所有人都重复同一句空话**（尤其别全场都在喊『预言家快跳』）——每个人说点不一样的：报自己身份倾向、给具体某人一个印象/理由、定个策略。\n**只写这人会当众说的话，别写旁白、别泄露不该公开的上帝视角。**按真实水平决定发言质量。" + day1 + easy + stanceText(stances) +
      "\n\n【昨晚】" + (deaths || "平安夜") + "\n\n【已发言】\n" + p + "\n\n【现在依次发言】\n" + who +
      "\n\n【输出】只输出 JSON：{\"speeches\":[{\"name\":\"\",\"text\":\"发言\"}],\"stances\":[{\"name\":\"发言人\",\"stance\":\"一句话概括 TA 现在的身份声称/站谁/怀疑谁（用于之后保持一致）\"}]}，speeches 顺序照上面。";
    const raw = await callRetry(api, sys, [{ role: "user", content: "依次发言。" }], { maxTokens: 6000 });
    const r = extractJSON(raw);
    return { speeches: (r && Array.isArray(r.speeches)) ? r.speeches : [], stances: (r && Array.isArray(r.stances)) ? r.stances : [] };
  }

  // 白天投票放逐
  async function genDayVotes(api, voters, allSpeeches, aliveNames, mode, userName, stances) {
    const sp = allSpeeches.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n");
    const who = voters.map(function (v) { return "■ " + v.name + "（" + v.priv + "）真实水平：" + (v.skill || "普通"); }).join("\n");
    const easy = (mode === "easy" && userName) ? "\n【放水局】别针对真人「" + userName + "」，怀疑也手下留情。" : "";
    const sys = AC + SKILL_RULE + "\n\n" + BOARD_LINE + "\n\n狼人杀·白天投票放逐。据发言，每人投一个要放逐的人 + 一句短理由。狼一般投好人、护队友，但队友已经保不住时可按水平弃车保帅、切割甚至跟票投掉队友保自己；好人投真心怀疑的狼。**实在没读到、没把握时可以弃票**（target 填「弃票」），但别全场弃票、有怀疑就投。理由别露上帝视角、要和自己之前的立场连贯。" + stanceText(stances) + easy +
      "\n\n【可投的存活玩家】" + aliveNames.join("、") + "\n\n【今天发言】\n" + sp + "\n\n【投票的人】\n" + who +
      "\n\n【输出】只输出 JSON：{\"votes\":[{\"name\":\"\",\"target\":\"要放逐的人名，或「弃票」\",\"reason\":\"\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "投票。" }], { maxTokens: 4500 });
    const r = extractJSON(raw); return (r && Array.isArray(r.votes)) ? r.votes : [];
  }

  // 全场 MVP + 一句赛后感言（不一定是胜方）
  async function genMVP(api, players, log, winnerZh) {
    const roleZh = function (r) { return r === "wolf" ? "狼人" : r === "seer" ? "预言家" : "平民"; };
    const roster = players.map(function (p) { return "· " + p.name + (p.isUser ? "(你)" : "") + "（" + roleZh(p.role) + "，" + (p.alive ? "存活到终局" : "中途出局") + "）水平：" + (p.skill || "—"); }).join("\n");
    const logText = log.filter(function (it) { return it.type === "speech" || it.type === "death" || it.type === "out" || it.type === "vote"; }).map(function (it) { return it.type === "speech" ? (it.name + "：" + it.text) : it.text; }).slice(-40).join("\n");
    const sys = AC + "这局狼人杀刚结束，" + winnerZh + "。从全体玩家里评一个【全场 MVP】——**不一定是获胜方**，谁打得最精彩 / 最关键 / 最有观赏性都算（虽败犹荣的狼、看穿全场的预言家、搅动风向的平民都行）。给：name（务必是下面名单里的玩家名）、reason（一句话客观点评为什么是 TA）、quote（以 TA 本人口吻、贴 TA 性格说一句赛后感言）。\n\n【全体身份 + 结局 + 水平】\n" + roster + "\n\n【赛况回放】\n" + logText + "\n\n【输出】只输出 JSON：{\"name\":\"\",\"reason\":\"\",\"quote\":\"\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "评全场 MVP + 感言。" }], { maxTokens: 1500 });
    return extractJSON(raw);
  }

  function WolfGame(props) {
    const t = props.t, cfg = props.config, api = props.active;
    const [phase, setPhase] = useState("loading"); // loading|reveal|night|day|dayvote|result|error
    const [players, setPlayers] = useState([]);
    const [cycle, setCycle] = useState(1);          // 第几个昼夜
    const [log, setLog] = useState([]);
    const [nightStage, setNightStage] = useState(null); // null|run|wolf|seer
    const [nightAI, setNightAI] = useState(null);   // {wolfKill,seerCheck,seerName,list,n}
    const [seerResult, setSeerResult] = useState(null); // 用户预言家查验结果 {name,isWolf}
    const [daySpeeches, setDaySpeeches] = useState([]); // 本日发言（喂投票）
    const [userSpeech, setUserSpeech] = useState("");
    const [userVote, setUserVote] = useState(null);
    const [busy, setBusy] = useState(false);
    const [winner, setWinner] = useState(null);
    const [errMsg, setErrMsg] = useState("");
    const [lastDeath, setLastDeath] = useState("");
    const [detail, setDetail] = useState(null);     // 点头像看的玩家详情
    const [mvp, setMvp] = useState(null);           // 全场 MVP + 感言
    const logRef = useRef(null);
    const started = useRef(false);
    const seerKnowRef = useRef({});                 // { seerName: [{name,isWolf}] }
    const stanceRef = useRef({});                   // { name: 立场一句话 } 内部纪要，防前后矛盾，不显示

    const me = players.find(function (p) { return p.isUser; });
    const alive = players.filter(function (p) { return p.alive; });
    const pushLog = function (items) { setLog(function (L) { return L.concat(items); }); };
    useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, phase, nightStage, busy]);

    // ---- 存档：进到 reveal/night/day 三个稳定节点各存一次；结束清掉。退出后中枢显示「继续」 ----
    const serializePlayers = function (list) { return list.map(function (p) { return { key: p.key, name: p.name, isUser: !!p.isUser, isNpc: !!p.isNpc, skill: p.skill, role: p.role, alive: p.alive, persona: p.persona || "" }; }); };
    const hydratePlayers = function (arr) {
      const pf = props.profile || {};
      return arr.map(function (p) {
        let char = null;
        if (p.isUser) char = { name: pf.name || "你", avatarImage: pf.avatarImage, color: pf.color || t.tint };
        else if (!p.isNpc) char = (props.characters || []).find(function (c) { return c.id === p.key; }) || null;
        return Object.assign({}, p, { char: char });
      });
    };
    useEffect(function () {
      if (phase === "result") { clearWolf(); return; }
      if (phase === "reveal" || phase === "night" || phase === "day") {
        saveWolf({ v: 1, config: cfg, phase: phase, cycle: cycle, players: serializePlayers(players), log: log, seerKnow: seerKnowRef.current, lastDeath: lastDeath, ts: Date.now() });
      }
    }, [phase, cycle]);
    // 结束后评全场 MVP + 感言
    useEffect(function () {
      if (phase !== "result" || mvp || !api) return;
      (async function () { try { const m = await genMVP(api, players, log, winner === "wolf" ? "狼人获胜" : "好人获胜"); if (m && m.name) setMvp(m); } catch (e) {} })();
    }, [phase]);

    const computeWin = function (list) {
      const al = list.filter(function (p) { return p.alive; });
      const w = al.filter(function (p) { return p.role === "wolf"; }).length;
      const g = al.length - w;
      if (w === 0) return "good"; if (w >= g) return "wolf"; return null;
    };
    const privateFor = function (p, list) {
      if (p.role === "wolf") { const team = list.filter(function (x) { return x.role === "wolf" && x.name !== p.name && x.alive; }).map(function (x) { return x.name; }); return "你是狼人。" + (team.length ? "狼队友：" + team.join("、") + "。" : "只剩你一头狼。") + "目标：伪装好人、必要时悍跳预言家、带偏好人。护队友——但当某个队友已经被架住、明显保不住时，**按你的水平决定要不要弃车保帅**：可以切割、甚至顺水推舟投掉这个队友，保住自己的身份和信任，别为一个救不回的同伙陪葬（水平越高越懂止损；讲义气或水平低的才死保到底）。"; }
      if (p.role === "seer") { const k = seerKnowRef.current[p.name] || []; return "你是预言家。查验记录：" + (k.length ? k.map(function (x) { return x.name + "=" + (x.isWolf ? "狼人" : "好人"); }).join("、") : "还没查过") + "。可跳预言家报验人建信任，或视情况隐藏。"; }
      return "你是平民，没有夜晚技能，靠逻辑站边找狼。";
    };
    const shortLog = function () { return log.filter(function (it) { return it.type === "death" || it.type === "out"; }).slice(-6).map(function (it) { return it.text; }).join("\n"); };

    // ---- 开局 ----
    useEffect(function () {
      if (started.current) return; started.current = true;
      // 续上一局：从存档恢复，跳过发牌
      if (props.resume && props.savedState) {
        const s = props.savedState;
        seerKnowRef.current = s.seerKnow || {};
        const list = hydratePlayers(s.players || []);
        setPlayers(list); setCycle(s.cycle || 1); setLog(s.log || []); setLastDeath(s.lastDeath || "");
        if (s.phase === "night") enterNight(list, s.cycle || 1);
        else if (s.phase === "day") startDay(list, s.cycle || 1);
        else setPhase("reveal");
        return;
      }
      (async function () {
        try {
          if (!api) { setErrMsg("请先到设置配置 API"); setPhase("error"); return; }
          const chars = (cfg.charIds || []).map(function (id) { return (props.characters || []).find(function (c) { return c.id === id; }); }).filter(Boolean);
          const inject = cfg.injectChat && props.recentChatFor;
          const realPlayers = chars.map(function (c) { let persona = c.persona || ""; if (inject) { const rc = props.recentChatFor(c.id); if (rc) persona += "\n（近况参考：" + rc.slice(-500) + "）"; } return { id: c.id, name: c.name, persona: persona, char: c }; });
          const npcNeed = cfg.npcCount || 0;
          const data = await setupWolf(api, realPlayers, npcNeed);
          const skillOf = {}; (data.skills || []).forEach(function (s) { if (s && s.name) skillOf[s.name] = s.skill || ""; });
          const list = [];
          realPlayers.forEach(function (p) { list.push({ key: p.id, name: p.name, char: p.char, isUser: false, skill: skillOf[p.name] || "" }); });
          if (cfg.mode !== "spectate") { const pf = props.profile || {}; list.push({ key: "user", name: pf.name || "你", char: { name: pf.name || "你", avatarImage: pf.avatarImage, color: pf.color || t.tint }, isUser: true, skill: "" }); }
          const npcs = (data.npcs || []).slice(0, npcNeed);
          for (let i = 0; i < npcNeed; i++) { const n = npcs[i] || {}; list.push({ key: "npc_" + i, name: n.name || ("玩家" + (i + 1)), char: null, isNpc: true, skill: n.skill || "普通", persona: n.persona || "" }); }
          // 派身份：wolfCount 狼 + 1 预言家 + 其余平民
          const nW = Math.min(wolfCount(list.length), list.length - 2);
          const idx = shuffle(list.map(function (_, i) { return i; }));
          const roleAt = {}; let k = 0;
          for (let i = 0; i < nW; i++) roleAt[idx[k++]] = "wolf";
          roleAt[idx[k++]] = "seer";
          list.forEach(function (p, i) { p.role = roleAt[i] || "villager"; p.alive = true; });
          setPlayers(list);
          pushLog([{ type: "info", text: "本局 " + list.length + " 人：" + nW + " 狼、1 预言家、" + (list.length - nW - 1) + " 平民。不翻牌——死了不亮身份。" }]);
          setPhase("reveal");
        } catch (e) { setErrMsg((e && e.message) || "开局失败，重试"); setPhase("error"); }
      })();
    }, []);

    // ---- 夜晚 ----
    const enterNight = async function (list, n) {
      setPhase("night"); setNightStage("run"); setSeerResult(null); setBusy(true);
      const al = list.filter(function (p) { return p.alive; });
      const wolves = al.filter(function (p) { return p.role === "wolf"; });
      const aiWolves = wolves.filter(function (p) { return !p.isUser; });
      const seer = al.find(function (p) { return p.role === "seer"; });
      const meNow = list.find(function (p) { return p.isUser; });
      const userWolf = meNow && meNow.alive && meNow.role === "wolf";
      const userSeer = meNow && meNow.alive && meNow.role === "seer";
      const needWolf = aiWolves.length > 0;     // 有 AI 狼就让它们各自投刀
      const needSeer = !!(seer && !userSeer);   // 预言家是 AI 才让 AI 选
      let ai = {};
      try {
        if (needWolf || needSeer) ai = await genNight(api, { needWolf: needWolf, needSeer: needSeer, wolfTeam: aiWolves.map(function (w) { return w.name; }), seer: seer ? { name: seer.name, skill: seer.skill, known: seerKnowRef.current[seer.name] || [] } : null, aliveNames: al.map(function (p) { return p.name; }), log: shortLog(), mode: cfg.mode });
      } catch (e) { props.toast && props.toast("天黑出错：" + ((e && e.message) || "重试")); }
      setBusy(false);
      const wolfVotes = Array.isArray(ai.wolfVotes) ? ai.wolfVotes : [];
      setNightAI({ wolfVotes: wolfVotes, seerCheck: ai.seerCheck, seerName: seer ? seer.name : null, list: list, n: n });
      const seerInfo = (seer && !userSeer) ? { seer: seer.name, target: ai.seerCheck } : null;
      if (userWolf) setNightStage("wolf");       // 用户狼：等你投刀，再和队友合票
      else if (userSeer) setNightStage("seer");
      else resolveNight(list, tallyKill(wolfVotes, list), seerInfo, n, wolfVotes, false);
    };
    const resolveNight = function (list, wolfTarget, seerInfo, n, wolfVotes, showKillLog) {
      // AI 预言家的查验入知识库
      if (seerInfo && seerInfo.seer && seerInfo.target) {
        const tp0 = list.find(function (p) { return p.name === seerInfo.target || (seerInfo.target || "").indexOf(p.name) >= 0; });
        if (tp0) { const km = Object.assign({}, seerKnowRef.current); km[seerInfo.seer] = (km[seerInfo.seer] || []).concat([{ name: tp0.name, isWolf: tp0.role === "wolf" }]); seerKnowRef.current = km; }
      }
      let tp = wolfTarget && list.find(function (p) { return p.alive && (p.name === wolfTarget || (wolfTarget || "").indexOf(p.name) >= 0); });
      let next = list, deadName = null, deadUser = false;
      if (tp) { next = list.map(function (p) { return p === tp ? Object.assign({}, p, { alive: false }) : p; }); deadName = tp.name; deadUser = !!tp.isUser; }
      setPlayers(next);
      const nightItems = [{ type: "night", n: n }];
      // 用户是狼时，把狼队刀人的投票明细摆给 TA 看（villager 用户看不到、免泄底）
      if (showKillLog && wolfVotes && wolfVotes.length) nightItems.push({ type: "info", text: "🐺 狼队刀人投票：" + wolfVotes.map(function (v) { return v.name + "→" + v.target; }).join("、") + "　最终刀：" + (deadName || "（无）") });
      const deathText = deadName ? ("天亮了，昨晚 " + deadName + (deadUser ? "(你)" : "") + " 倒下了。" + (deadUser ? "你出局了，接下来看他们博弈。" : "")) : "天亮了，是个平安夜。";
      setLastDeath(deadName ? (deadName + " 昨晚倒下") : "平安夜（没人死）");
      nightItems.push({ type: "death", text: deathText });
      pushLog(nightItems);
      const w = computeWin(next);
      if (w) { setWinner(w); setPhase("result"); return; }
      setNightStage(null);
      startDay(next, n);
    };
    // 用户狼刀：你的一票 + AI 队友的投票，少数服从多数、平票随机
    const submitWolfKill = function (name) {
      const info = nightAI;
      const allVotes = (info.wolfVotes || []).concat([{ name: (info.list.find(function (p) { return p.isUser; }) || {}).name || "你", target: name }]);
      const finalKill = tallyKill(allVotes, info.list);
      resolveNight(info.list, finalKill, info.seerName ? { seer: info.seerName, target: info.seerCheck } : null, info.n, allVotes, true);
    };
    // 用户预言家查验
    const submitSeerCheck = function (name) {
      const info = nightAI; const tp = info.list.find(function (p) { return p.name === name; });
      const isWolf = tp && tp.role === "wolf";
      // 记入用户预言家自己的知识（虽然用户不靠它发言，但保持一致 + 展示）
      const seerNm = (info.list.find(function (p) { return p.isUser; }) || {}).name;
      if (seerNm && tp) { const km = Object.assign({}, seerKnowRef.current); km[seerNm] = (km[seerNm] || []).concat([{ name: tp.name, isWolf: isWolf }]); seerKnowRef.current = km; }
      setSeerResult({ name: name, isWolf: isWolf });
    };
    const seerDone = function () { const info = nightAI; resolveNight(info.list, tallyKill(info.wolfVotes, info.list), null, info.n, info.wolfVotes, false); };

    // ---- 白天 ----
    const startDay = function (list, n) {
      setPhase("day"); setDaySpeeches([]); setUserSpeech(""); setUserVote(null);
      const meA = list.find(function (p) { return p.isUser; });
      if (!(meA && meA.alive)) aiSpeak(list, [], n);
    };
    const aiSpeak = async function (list, prior, n) {
      setBusy(true);
      try {
        const aiAlive = list.filter(function (p) { return p.alive && !p.isUser; });
        const speakers = shuffle(aiAlive).map(function (p) { return { name: p.name, skill: p.skill, priv: privateFor(p, list) }; });
        const res = await genSpeeches(api, speakers, n, prior, lastDeath, cfg.mode, (list.find(function (p) { return p.isUser && p.alive; }) || {}).name || "", stanceRef.current);
        const sp = res.speeches;
        (res.stances || []).forEach(function (s) { if (s && s.name && s.stance) { const hit = speakers.find(function (x) { return s.name.indexOf(x.name) >= 0 || x.name.indexOf(s.name) >= 0; }); if (hit) stanceRef.current[hit.name] = s.stance; } });
        const norm = speakers.map(function (s) { const hit = sp.find(function (c) { return c.name && (c.name.indexOf(s.name) >= 0 || s.name.indexOf(c.name) >= 0); }); return { name: s.name, text: (hit && hit.text) || "……（沉默了一下，没多说）" }; });
        setDaySpeeches(function (D) { return D.concat(prior).concat(norm); });
        pushLog(norm.map(function (c) { return { type: "speech", name: c.name, text: c.text }; }));
        setPhase("dayvote"); setUserVote(null);
      } catch (e) { props.toast && props.toast("发言失败：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };
    const submitUserSpeech = function () {
      const v = userSpeech.trim(); if (!v || !me) return;
      pushLog([{ type: "speech", name: me.name, text: v, mine: true }]);
      stanceRef.current[me.name] = v.slice(0, 60); // 记下你的立场，AI 后续保持连贯
      setUserSpeech("");
      aiSpeak(players, [{ name: me.name, text: v }], cycle);
    };
    // ---- 投票 ----
    const runDayVote = async function (userTarget) {
      setBusy(true);
      try {
        const al = players.filter(function (p) { return p.alive; });
        const aiV = al.filter(function (p) { return !p.isUser; });
        const voters = aiV.map(function (p) { return { name: p.name, skill: p.skill, priv: privateFor(p, players) }; });
        const raw = await genDayVotes(api, voters, daySpeeches.filter(function (c) { return c.name; }), al.map(function (p) { return p.name; }), cfg.mode, (me && me.alive) ? me.name : "", stanceRef.current);
        const votes = voters.map(function (v) {
          const hit = raw.find(function (r) { return r.name && (r.name.indexOf(v.name) >= 0 || v.name.indexOf(r.name) >= 0); });
          const target = hit && hit.target ? String(hit.target) : "";
          const abstain = !target || /弃票|弃权|不投|放弃|abstain|pass|none|null/i.test(target);
          // 弃票或对不上名字都算弃票（不再随机硬投）
          const tp = abstain ? null : al.find(function (p) { return p.name === target || target.indexOf(p.name) >= 0; });
          return { voter: v.name, target: tp ? tp.name : null, reason: (hit && hit.reason) || (abstain ? "弃票" : "") };
        });
        if (me && me.alive && userTarget && userTarget !== "__abstain__") votes.push({ voter: me.name, target: userTarget, reason: "（你的一票）" });
        else if (me && me.alive && userTarget === "__abstain__") votes.push({ voter: me.name, target: null, reason: "弃票" });
        // 计票
        pushLog([{ type: "sep", text: "—— 投票放逐 ——" }].concat(votes.map(function (v) { return { type: "vote", name: v.voter, target: v.target, reason: v.reason }; })));
        const cnt = {}; votes.forEach(function (v) { if (v.target) cnt[v.target] = (cnt[v.target] || 0) + 1; });
        let max = -1, tied = []; Object.keys(cnt).forEach(function (nm) { if (cnt[nm] > max) { max = cnt[nm]; tied = [nm]; } else if (cnt[nm] === max) tied.push(nm); });
        const outName = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
        const out = outName && players.find(function (p) { return p.alive && p.name === outName; });
        if (!out) { pushLog([{ type: "info", text: "没投出有效结果，直接天黑。" }]); setBusy(false); setCycle(cycle + 1); enterNight(players, cycle + 1); return; }
        const next = players.map(function (p) { return p === out ? Object.assign({}, p, { alive: false }) : p; });
        pushLog([{ type: "out", name: out.name, isUser: out.isUser, text: "🗳 " + out.name + (out.isUser ? "(你)" : "") + " 被放逐出局（身份不公开）。" }]);
        setPlayers(next);
        const w = computeWin(next);
        setBusy(false);
        if (w) { setWinner(w); setPhase("result"); return; }
        setCycle(cycle + 1); enterNight(next, cycle + 1);
      } catch (e) { props.toast && props.toast("投票失败：" + ((e && e.message) || "重试")); setBusy(false); }
    };

    // ---- 渲染 ----
    const pAvatar = function (p, size) {
      if (p && p.char) return h(Avatar, { character: p.char, size: size, radius: Math.round(size * 0.3) });
      return h("div", { style: { width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, background: p && p.isUser ? t.tint : t.line, color: "#fff", fontFamily: F_DISPLAY, fontSize: Math.round(size * 0.46), display: "flex", alignItems: "center", justifyContent: "center" } }, ((p && p.name) || "?").slice(0, 1));
    };
    const pByName = function (nm) { return players.find(function (p) { return p.name === nm; }); };
    const roleZh = function (r) { return r === "wolf" ? "狼人" : r === "seer" ? "预言家" : "平民"; };
    const header = h(Head, { zh: "狼人杀", en: "Werewolf", onBack: props.onBack });

    if (phase === "error") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 30 } },
        h("div", { style: { fontSize: 40 } }, "🐺"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.sub, textAlign: "center", lineHeight: 1.6 } }, errMsg),
        h("button", { onClick: props.onBack, style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "10px 24px" } }, "返回")));
    if (phase === "loading") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 } },
        h("div", { style: { fontSize: 40 } }, "🌙"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, "发身份·评估每个人的真实水平…")));

    const roster = h("div", { className: "shrink-0", style: { display: "flex", gap: 10, overflowX: "auto", padding: "10px 16px", borderBottom: "1px solid " + t.line } },
      players.map(function (p) {
        return h("button", { key: p.key, onClick: function () { setDetail(p); }, className: "active:opacity-70", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: p.alive ? 1 : 0.32, flexShrink: 0, width: 46 } },
          h("div", { style: { position: "relative" } }, pAvatar(p, 38), !p.alive ? h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 } }, "✖") : null),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.sub, maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" } }, p.name + (p.isUser ? "(你)" : "")));
      }));

    const logView = h("div", { ref: logRef, className: "flex-1 overflow-y-auto", style: { padding: "12px 16px 16px" } },
      log.map(function (it, i) {
        if (it.type === "night") return h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.fog, margin: "14px 0 8px", letterSpacing: 1 } }, "🌙 第 " + it.n + " 夜");
        if (it.type === "sep") return h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.tint, margin: "12px 0 6px" } }, it.text);
        if (it.type === "info") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.6, margin: "4px 0", textAlign: "center" } }, it.text);
        if (it.type === "death") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, margin: "6px 0", textAlign: "center", lineHeight: 1.6 } }, "☀️ " + it.text);
        if (it.type === "out") return h("div", { key: i, style: { textAlign: "center", margin: "8px 0", fontFamily: F_BODY, fontSize: 13, color: "#c0553f" } }, it.text);
        if (it.type === "speech") { const p = pByName(it.name); return h("div", { key: i, style: { display: "flex", gap: 8, margin: "8px 0" } }, pAvatar(p, 30),
          h("div", { style: { flex: 1 } }, h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 2 } }, it.name + (it.mine ? "(你)" : "")),
            h("div", { style: { display: "inline-block", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.55, color: t.ink, background: it.mine ? (t.tint + "1c") : t.bg2, borderRadius: 10, padding: "7px 11px" } }, it.text))); }
        if (it.type === "vote") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "3px 0", lineHeight: 1.5 } }, "· " + it.name + (it.target ? " → 投 " + it.target : " → 弃票") + (it.reason && it.target ? "：" + it.reason : ""));
        return null;
      }));

    // 底部动作区
    let action = null;
    const roleBanner = me ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "你的身份：", h("b", { style: { color: me.role === "wolf" ? "#c0553f" : t.ink, fontSize: 14 } }, roleZh(me.role)), me.role === "wolf" ? h("span", null, "　狼队友：" + players.filter(function (p) { return p.role === "wolf" && !p.isUser; }).map(function (p) { return p.name; }).join("、")) : null) : null;
    const pickRow = function (targets, val, onPick) {
      return h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 8 } },
        targets.map(function (p) { const on = val === p.name; return h("button", { key: p.key, onClick: function () { onPick(p.name); }, style: { display: "flex", alignItems: "center", gap: 4, fontFamily: F_BODY, fontSize: 12.5, color: on ? "#fff" : t.ink, background: on ? t.tint : t.bg2, border: "1px solid " + (on ? t.tint : t.line), borderRadius: 999, padding: "4px 10px 4px 4px" } }, pAvatar(p, 18), p.name); }));
    };

    if (phase === "reveal") {
      action = h("div", null, roleBanner,
        h("button", { onClick: function () { enterNight(players, 1); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "13px" } }, "天黑请闭眼"));
    } else if (phase === "night") {
      if (nightStage === "run" || busy) action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "🌙 天黑了，夜色里有人在行动…");
      else if (nightStage === "wolf") action = h("div", null, roleBanner,
        h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "选择今晚要刀的人"),
        pickRow(alive.filter(function (p) { return !p.isUser; }), null, function (nm) { submitWolfKill(nm); }));
      else if (nightStage === "seer") {
        if (seerResult) action = h("div", null,
          h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 15, color: t.ink, marginBottom: 12 } }, "查验结果：", h("b", { style: { color: seerResult.isWolf ? "#c0553f" : "#3f6d5a" } }, seerResult.name + " 是【" + (seerResult.isWolf ? "狼人" : "好人") + "】")),
          h("button", { onClick: seerDone, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "12px" } }, "天亮"));
        else action = h("div", null, roleBanner,
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "选一个人查验身份"),
          pickRow(alive.filter(function (p) { return !p.isUser; }), null, function (nm) { submitSeerCheck(nm); }));
      }
    } else if (phase === "day") {
      if (busy) action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…大家在发言");
      else if (me && me.alive) action = h("div", null, roleBanner,
        h("div", { style: { display: "flex", gap: 8 } },
          h("input", { value: userSpeech, onChange: function (e) { setUserSpeech(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submitUserSpeech(); }, placeholder: "轮到你发言（站边、表身份、抓狼…）", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "11px 14px", borderRadius: 12, border: "1px solid " + t.line, background: t.bg2, color: t.ink, outline: "none" } }),
          h("button", { onClick: submitUserSpeech, style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 12, padding: "0 18px" } }, "发言")));
      else action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…");
    } else if (phase === "dayvote") {
      if (busy) action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…计票中");
      else if (me && me.alive) action = h("div", null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "投票放逐谁？"),
        pickRow(alive.filter(function (p) { return p.name !== me.name; }), userVote, setUserVote),
        h("div", { style: { display: "flex", justifyContent: "center", marginBottom: 10 } },
          h("button", { onClick: function () { setUserVote("__abstain__"); }, style: { fontFamily: F_BODY, fontSize: 13, color: userVote === "__abstain__" ? "#fff" : t.sub, background: userVote === "__abstain__" ? t.fog : t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 16px" } }, "弃票")),
        h("button", { onClick: function () { if (userVote) runDayVote(userVote); }, disabled: !userVote, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: userVote ? t.ink : t.line, borderRadius: 13, padding: "12px" } }, "投票"));
      else action = h("button", { onClick: function () { runDayVote(null); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "12px" } }, "看他们投票");
    } else if (phase === "result") {
      const mvpP = mvp && players.find(function (p) { return mvp.name && (p.name === mvp.name || mvp.name.indexOf(p.name) >= 0); });
      action = h("div", null,
        h("div", { style: { textAlign: "center", fontFamily: F_DISPLAY, fontSize: 20, color: winner === "wolf" ? "#c0553f" : "#3f6d5a", marginBottom: 8 } }, winner === "wolf" ? "🐺 狼人获胜" : "🎉 好人获胜"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7, marginBottom: 12 } }, "身份揭晓：" + players.map(function (p) { return p.name + (p.isUser ? "(你)" : "") + "=" + roleZh(p.role); }).join("　")),
        // 全场 MVP
        mvp ? h("div", { style: { display: "flex", gap: 10, padding: "11px 13px", borderRadius: 13, background: t.tint + "14", border: "1px solid " + t.tint, marginBottom: 12 } },
          mvpP ? pAvatar(mvpP, 40) : null,
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.tint, letterSpacing: 1, marginBottom: 2 } }, "★ 全场 MVP · " + mvp.name),
            mvp.reason ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, lineHeight: 1.55, marginBottom: 4 } }, mvp.reason) : null,
            mvp.quote ? h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 13.5, color: t.ink, lineHeight: 1.6 } }, "「" + mvp.quote + "」") : null))
          : h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, textAlign: "center", marginBottom: 12 } }, api ? "评选全场 MVP 中…" : ""),
        h("div", { style: { display: "flex", gap: 10 } },
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "12px" } }, "返回"),
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 12, padding: "12px" } }, "回中枢再来一局")));
    }

    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } }, header, roster, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)", maxHeight: "34vh", overflowY: "auto" } }, action),
      detail ? h(PlayerCard, { p: detail, t: t, avatar: pAvatar(detail, 44), roleText: phase === "result" ? ("身份：" + roleZh(detail.role)) : null, roleBad: detail.role === "wolf", onClose: function () { setDetail(null); } }) : null);
  }

  window.Games = Games;
})();
