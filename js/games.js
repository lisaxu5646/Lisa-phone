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
    { key: "haigui", emoji: "🐢", zh: "海龟汤", en: "Lateral Puzzle", min: 2, max: 8, ready: true,
      desc: "主持人给一个诡异「汤面」，你们只能问是 / 否问题，一步步还原真相。", rule: "2~8 人 · 题目系统出" },
    { key: "q25", emoji: "❓", zh: "25 问", en: "20 Questions", min: 2, max: 8, ready: true,
      desc: "系统心里想一个东西，你们轮流问是 / 否问题，25 问内猜出来。", rule: "2~8 人 · 题目系统出" },
    { key: "tod", emoji: "🎲", zh: "真心话大冒险", en: "Truth or Dare", min: 2, max: 10, ready: true,
      desc: "转瓶子，指到谁就选真心话或大冒险，题目由在场的人出。", rule: "2~10 人" },
    { key: "werewolf", emoji: "🐺", zh: "狼人杀", en: "Werewolf", min: 5, max: 12, ready: true,
      desc: "狼人夜里行凶，好人白天靠推理投票放逐。当前板子：狼人 + 预言家 + 平民。", rule: "5~12 人 · 预言家局 · 不翻牌" },
    { key: "avalon", emoji: "⚔️", zh: "阿瓦隆", en: "Avalon", min: 5, max: 10, ready: true,
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
  // 居中弹框：需要选择时跳出来，可关掉回看发言（防底部按钮被截断）
  function PickerModal(props) {
    const t = props.t;
    return h("div", { style: { position: "absolute", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 } },
      h("div", { onClick: props.onClose, style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" } }),
      h("div", { style: { position: "relative", background: t.bg, borderRadius: 16, padding: "16px 16px 16px", width: "100%", maxWidth: 340, maxHeight: "80%", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.32)" } },
        props.title ? h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, textAlign: "center", marginBottom: props.sub ? 3 : 12 } }, props.title) : null,
        props.sub ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, textAlign: "center", marginBottom: 12, lineHeight: 1.5, whiteSpace: "pre-line" } }, props.sub) : null,
        props.children,
        props.onClose ? h("button", { onClick: props.onClose, style: { display: "block", margin: "12px auto 0", fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 12px" } }, "先关掉 · 回看发言") : null));
  }
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
      if (session.game.key === "haigui" || session.game.key === "q25") return h(GuessGame, Object.assign({}, engineProps, { kind: session.game.key }));
      if (session.game.key === "tod") return h(TruthDareGame, engineProps);
      if (session.game.key === "avalon") return h(AvalonGame, engineProps);
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
    const [godSel, setGodSel] = useState(null);      // 狼人杀神职选择；null=跟随标准板
    const [wolfRole, setWolfRole] = useState(null);  // 狼阵营特殊角色：null 普通狼 / wolfking / whitewolf
    const [winMode, setWinMode] = useState("side");  // 屠边 side / 屠城 all
    const [avOpts, setAvOpts] = useState({ percival: true, mordred: false, oberon: false }); // 阿瓦隆特殊角色

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
    // 狼人杀神职：effGods = 选中的(或标准板)；至少留 1 民
    const isWolfGame = game.key === "werewolf";
    const isAvalonGame = game.key === "avalon";
    const effGods = isWolfGame ? (godSel || standardBoard(total)) : [];
    const godRoom = isWolfGame ? Math.max(1, total - wolfCount(total) - 1) : 0;
    const godOverflow = isWolfGame && effGods.length > godRoom;
    const canStart = !overMax && !tooFew && picked.length + needNpc > 0 && !godOverflow;

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
          h(ToggleRow, { t: t, label: "注入最近聊天", sub: "把最近的聊天喂给上场角色，让 TA 带着当前的人设、心情、你俩的近况上场。只读不写——不会记进聊天记忆。", on: injectChat, onToggle: function () { setInjectChat(!injectChat); } }),
          // 狼人杀·神职配置（自选 + 随机 + 标准板）
          isWolfGame ? h("div", { style: { paddingTop: 12, marginTop: 6, borderTop: "1px solid " + t.line } },
            h("div", { style: { display: "flex", alignItems: "center", marginBottom: 6 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, color: t.ink } }, "神职配置"),
              h("button", { onClick: function () { setGodSel(randomBoard(total)); }, style: { marginLeft: "auto", fontFamily: F_BODY, fontSize: 12, color: t.tint, border: "1px solid " + t.tint, borderRadius: 999, padding: "3px 12px" } }, "🎲 随机"),
              h("button", { onClick: function () { setGodSel(null); }, style: { marginLeft: 8, fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "3px 4px" } }, "标准板")),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: godOverflow ? "#c0553f" : t.fog, lineHeight: 1.5, marginBottom: 8 } }, godOverflow ? ("神职太多，最多 " + godRoom + " 个（至少留 1 民）") : "勾选想要的神职，其余是平民。屠边局：狼把神营或民营杀绝即胜。"),
            h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } },
              GODS.map(function (g) {
                const on = effGods.indexOf(g.key) >= 0;
                return h("button", { key: g.key, onClick: function () { const cur = effGods.slice(); const i = cur.indexOf(g.key); if (i >= 0) cur.splice(i, 1); else cur.push(g.key); setGodSel(cur); }, style: { fontFamily: F_BODY, fontSize: 13, color: on ? "#fff" : t.ink, background: on ? t.tint : t.bg2, border: "1px solid " + (on ? t.tint : t.line), borderRadius: 999, padding: "6px 14px" } }, g.zh);
              })),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 6, lineHeight: 1.5 } }, "（预言家、女巫、猎人、守卫、白痴均已就绪，任选组合）"),
            // 狼阵营特殊角色（把一头狼换成狼王/白狼王）
            h("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "狼阵营"),
              [{ key: null, zh: "普通狼" }, { key: "wolfking", zh: "狼王" }, { key: "whitewolf", zh: "白狼王" }].map(function (o) {
                const on = wolfRole === o.key;
                return h("button", { key: o.key || "plain", onClick: function () { setWolfRole(o.key); }, style: { fontFamily: F_BODY, fontSize: 12.5, color: on ? "#fff" : t.ink, background: on ? "#c0553f" : t.bg2, border: "1px solid " + (on ? "#c0553f" : t.line), borderRadius: 999, padding: "5px 13px" } }, o.zh);
              })),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, wolfRole === "wolfking" ? "狼王：出局时能开枪带走一人（被毒不能开）。" : wolfRole === "whitewolf" ? "白狼王：白天可自爆、当场带走一人后直接天黑。" : "把一头狼换成特殊狼（狼总数不变）。"),
            // 胜负模式
            h("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "胜负"),
              h("div", { style: { flex: 1 } }, h(Segmented, { t: t, value: winMode, options: [{ key: "side", zh: "屠边" }, { key: "all", zh: "屠城" }], onChange: setWinMode }))),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, winMode === "side" ? "屠边：狼把「神营」或「民营」杀绝即胜（标准竞技规则）。" : "屠城：场上剩余好人 ≤ 狼数（打平）时狼就赢。")) : null,
          // 阿瓦隆·特殊角色
          isAvalonGame ? h("div", { style: { paddingTop: 12, marginTop: 6, borderTop: "1px solid " + t.line } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, color: t.ink, marginBottom: 2 } }, "特殊角色"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.5, marginBottom: 4 } }, "梅林 + 刺客固定在场，其余按人数配忠臣 / 爪牙。加特殊角色让博弈更深。"),
            [{ k: "percival", zh: "派西维尔 + 莫甘娜", d: "派西维尔认得梅林，但莫甘娜伪装成梅林混淆 TA（成对加入）" },
             { k: "mordred", zh: "莫德雷德", d: "坏人，且【梅林看不见 TA】——好人更难" },
             { k: "oberon", zh: "奥伯伦", d: "坏人，但和其他坏人互不相识、不知彼此" }].map(function (o) {
              return h(ToggleRow, { key: o.k, t: t, label: o.zh, sub: o.d, on: !!avOpts[o.k], onToggle: function () { setAvOpts(function (s) { const n = Object.assign({}, s); n[o.k] = !s[o.k]; return n; }); } });
            }),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, "任务队伍规模按人数自动配，第 4 个任务在 7 人以上需 2 张失败票。3 个任务成功后刺客还有终局刺杀。")) : null)),

      // 底部开始
      h("div", { className: "shrink-0", style: { padding: "12px 18px calc(env(safe-area-inset-bottom) + 16px)", borderTop: "1px solid " + t.line } },
        h("button", { onClick: function () { if (canStart) props.onStart({ mode: mode, charIds: picked.slice(), npcFill: npcFill, npcCount: needNpc, injectChat: injectChat, total: total, gods: isWolfGame ? effGods.slice() : undefined, wolfRole: isWolfGame ? wolfRole : undefined, winMode: isWolfGame ? winMode : undefined, av: isAvalonGame ? avOpts : undefined }); },
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
    const sys = AC + SKILL_RULE + "\n\n「谁是卧底」第 " + roundNum + " 轮描述。每人用【一句话】描述自己拿到的词。铁律：\n" +
      "· 不能直接说出词本身，也别露骨到一句就被锁定。\n" +
      "· 【具体程度严格按真实水平走·非常重要】高手点到即止、只给能【多向解读】的模糊线索，故意留白，让人一轮看不穿；只有低手才会说得太实把词几乎摊开。**绝不能所有人都描述得清清楚楚**——那样一轮就穿帮、毫无博弈，不好玩。整体要含蓄，信息一点点挤。\n" +
      "· 各人只知道自己的词、不知道谁跟自己不同。【高水平的少数派（卧底）】要善于从别人的描述里察觉『我的词好像和大家不是一路』，然后立刻把自己这句往大家的方向靠、含糊蒙混、绝不自曝；只有低水平的少数派才会照着自己的词直说而露馅。\n" +
      "· 先发言的人没有前文、只能凭自己的词说；后发言的人要顺着前面的风向调整措辞。" + easy +
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
    const sys = AC + SKILL_RULE + "\n\n「谁是卧底」投票。根据目前【所有描述】，下面每人各投一个要投出局的人 + 一句短理由。按真实水平：推理强的投得准，弱的易被带偏。**实在没把握可以弃票**（target 填「弃票」），但别全场弃票。理由别露上帝视角（别说“我是卧底所以…”）。【公平】只按描述本身的合理性投票，别因为某人发言顺序靠前、说得少、或是生面孔就默认针对 TA——没有实据不要扎堆投同一个人。" + easy +
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
    const [userFirst, setUserFirst] = useState(true); // 你这轮排最先(true)还是最后(false)——每轮随机
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

    // ---- 描述阶段（你每轮随机排最先或最后，不再永远第一个）----
    const startRound = function (plist, rnd) {
      setRoundClues([]); setUserClue("");
      const meA = plist.find(function (p) { return p.isUser; });
      if (!(meA && meA.alive)) { setPhase("describe"); aiDescribeWith(plist, [], rnd, false); return; }
      const uf = Math.random() < 0.5;   // 掷一下：你这轮先说还是最后说
      setUserFirst(uf);
      setPhase("describe");
      if (!uf) aiDescribeWith(plist, [], rnd, true); // 你排最后：AI 先各说一句，说完停下等你补
    };
    const beginDescribe = function () { startRound(players, round); };
    // 用指定名单跑 AI 描述；waitUser=true 时说完不进投票、停在描述阶段等你最后补一句
    const aiDescribeWith = async function (plist, prior, rnd, waitUser) {
      setBusy(true);
      try {
        const aAI = plist.filter(function (p) { return p.alive && !p.isUser; });
        const speakers = shuffle(aAI).map(function (p) { return { name: p.name, word: p.word, skill: p.skill }; });
        const clues = await genClues(api, speakers, prior, rnd, cfg.mode);
        const norm = speakers.map(function (s) { const hit = clues.find(function (c) { return c.name && (c.name.indexOf(s.name) >= 0 || s.name.indexOf(c.name) >= 0); }); return { name: s.name, text: (hit && hit.text) || "……" }; });
        setRoundClues(prior.concat(norm));
        setAllClues(function (A) { return A.concat(norm.map(function (c) { return { name: c.name, text: c.text }; })); });
        pushLog((prior.length ? [] : [{ type: "round", n: rnd }]).concat(norm.map(function (c) { return { type: "clue", name: c.name, text: c.text }; })));
        if (!waitUser) { setPhase("vote"); setUserVote(null); }
      } catch (e) { props.toast && props.toast("描述失败：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };
    const submitUserClue = function () {
      const v = userClue.trim(); if (!v || busy) return;
      setUserClue("");
      const mineClue = { name: me.name, text: v };
      setAllClues(function (A) { return A.concat([mineClue]); });
      if (userFirst) {
        // 你先说 → AI 接着各说一句 → 进投票
        pushLog([{ type: "round", n: round }, { type: "clue", name: me.name, text: v, mine: true }]);
        aiDescribeWith(players, [mineClue], round, false);
      } else {
        // 你排最后 → AI 都说完了 → 补上你这句直接进投票
        pushLog([{ type: "clue", name: me.name, text: v, mine: true }]);
        setPhase("vote"); setUserVote(null);
      }
    };

    // ---- 投票阶段 ----
    const tallyAndEliminate = function (votes) {
      // votes: [{voter, target}]
      // runVote 开头置了 busy=true，这里先收掉——否则轮到用户描述时 describe 阶段一直卡在 busy 提示、输入框不出现（下一轮的 AI 描述会各自重新置 busy）
      setBusy(false);
      pushLog([{ type: "sep", text: "—— 投票 ——" }].concat(votes.map(function (v) { return { type: "vote", name: v.voter, target: v.target, reason: v.reason }; })));
      const count = {};
      votes.forEach(function (v) { if (v.target) count[v.target] = (count[v.target] || 0) + 1; });
      let max = -1, tied = [];
      Object.keys(count).forEach(function (name) { if (count[name] > max) { max = count[name]; tied = [name]; } else if (count[name] === max) tied.push(name); });
      const outName = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
      const out = players.find(function (p) { return p.alive && p.name === outName; });
      if (!out) { // 没投出有效目标，直接进入下一轮
        pushLog([{ type: "info", text: "没投出有效结果，继续下一轮。" }]);
        const nr = round + 1; setRound(nr);
        setTimeout(function () { startRound(players, nr); }, 40); return;
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
      const nr = round + 1; setRound(nr);
      // 用最新存活名单重开描述（淘汰后名单已变，显式传 next）
      setTimeout(function () { startRound(next, nr); }, 40);
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
  // 神职（逐个加引擎；只有引擎做好的才放进选择框）
  const GODS = [
    { key: "seer", zh: "预言家", desc: "每晚验一个人的好 / 坏" },
    { key: "witch", zh: "女巫", desc: "解药救人 + 毒药毒人，各一次" },
    { key: "hunter", zh: "猎人", desc: "被刀 / 被票出局时开枪带走一人（被毒不能开）" },
    { key: "guard", zh: "守卫", desc: "每晚守护一人挡刀，不能连守同一人（同守同救会失效）" },
    { key: "idiot", zh: "白痴", desc: "被投票放逐时翻牌免死，但从此失去投票权" },
    { key: "gravekeeper", zh: "守墓人", desc: "每次白天放逐后，得知被放逐者是狼还是好人" }
  ];
  const GOD_KEYS = GODS.map(function (g) { return g.key; });
  function isGodRole(r) { return GOD_KEYS.indexOf(r) >= 0; }
  // 狼阵营特殊角色（不是神；仍算狼、参与夜刀）：狼王=出局开枪，白狼王=白天自爆带人
  const WOLF_SPECIALS = [
    { key: "wolfking", zh: "狼王", desc: "被票 / 被刀出局时开枪带走一人（被毒不能开）" },
    { key: "whitewolf", zh: "白狼王", desc: "只能在白天【自爆】时带走一人（被投 / 被毒 / 被刀都不能带）" }
  ];
  function isWolfRole(r) { return r === "wolf" || r === "wolfking" || r === "whitewolf"; }
  function roleName(r) { if (r === "wolf") return "狼人"; if (r === "villager") return "平民"; const w = WOLF_SPECIALS.find(function (x) { return x.key === r; }); if (w) return w.zh; const g = GODS.find(function (x) { return x.key === r; }); return g ? g.zh : r; }
  // 标准板：按人数给默认神职（只在已实现的神里选）
  function standardBoard(n) {
    const g = ["seer"];
    if (n >= 6) g.push("witch");
    if (n >= 8) g.push("hunter");
    if (n >= 10) g.push("guard");
    const maxGods = Math.max(1, n - wolfCount(n) - 1); // 至少留 1 民
    return g.slice(0, maxGods);
  }
  function randomBoard(n) { return shuffle(GOD_KEYS.slice()).slice(0, standardBoard(n).length); }
  // 身份铁律（按本局实际身份动态生成）：别自创没有的身份。以后加神职自动纳入。
  function boardLine(godKeys, wolfRole) {
    const gods = (godKeys && godKeys.length ? godKeys : ["seer"]).map(roleName);
    const wolfSp = wolfRole ? [roleName(wolfRole)] : [];
    const all = ["狼人", "平民"].concat(wolfSp).concat(gods);
    const absent = GODS.filter(function (g) { return (godKeys || []).indexOf(g.key) < 0; }).map(function (g) { return g.zh; })
      .concat(WOLF_SPECIALS.filter(function (w) { return w.key !== wolfRole; }).map(function (w) { return w.zh; }));
    return "【身份铁律】本局身份只有：【" + all.join(" / ") + "】。谁都别自创或声称本局没有的身份——" + (absent.length ? "本局没有 " + absent.join("、") + "，也" : "") + "没有警长、警官等任何头衔。能跳的身份只有『预言家』，狼人也只能悍跳预言家。" + (wolfRole === "wolfking" ? "（本局狼队里有一头狼王，出局会开枪——但没人事先知道谁是。）" : wolfRole === "whitewolf" ? "（本局狼队里有一头白狼王，可能白天自爆带人——但没人事先知道谁是。）" : "");
  }
  // 战术参考：让 AI 打出真套路/反套路（按各人水平自然运用，别生搬术语、别人人都用）
  const WOLF_TACTICS = "【狼人杀常见套路（按各人真实水平自然运用；水平高的会用、会拆，水平低的只会朴素发言——别生搬术语、别每个人都套路满满）】\n" +
    "· 预言家跳身份后报【查杀】(验出来的狼，直接带票投)或【金水】(验出来的好人，帮 TA 洗清)；\n" +
    "· 狼可以【悍跳】假冒预言家、和真预言家【对跳】，逼好人从两个『预言家』里二选一分辨真假——好人就靠对比双方的验人逻辑、发言合理性来站边；\n" +
    "· 狼的进阶：【倒钩】(装好人、甚至跟着好人踩自己队友来骗信任)、【递刀】(发言暗示队友今晚刀谁)、【归票】(把大家的票带到某个好人身上)、队友保不住时【切队友】自保；\n" +
    "· 谁【划水】(全程不表态、不站边)容易被当狼查；被怀疑就要【扛推】自证。\n" +
    "· 核心：别空喊口号，给【具体理由】——谁发言前后矛盾、谁的票投得可疑、谁的身份声称站不住脚。";

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
    if (opts.needWolf) need.push("\n【狼队各自投刀】" + opts.wolfTeam.join("、") + " 各自独立说出今晚想刀谁——按各人的想法和水平选（挑对好人威胁大的：疑似预言家、发言强的；别刀自己人）。每头狼给【一个】目标，不用统一。想空刀（今晚不杀人、藏刀/避险）就把 target 填「空刀」。");
    if (opts.needSeer) need.push("\n【预言家】" + opts.seer.name + " 选一个【没查过】的人查验（已查：" + (opts.seer.known.length ? opts.seer.known.map(function (k) { return k.name + "=" + (k.isWolf ? "狼" : "好"); }).join("、") : "无") + "），挑可疑或关键的人。");
    if (opts.needGuard) need.push("\n【守卫】" + opts.guard.name + " 选一个人守护（挡掉今晚的狼刀）。" + (opts.guard.last ? "上一晚守的是 " + opts.guard.last + "，今晚【不能再守 TA】。" : "") + "可以守自己。挑你判断狼今晚最可能刀的关键人（疑似预言家/女巫、发言强的好人），或守自己保命。");
    const schema = {}; if (opts.needWolf) schema.wolfVotes = [{ name: "狼名", target: "TA 想刀的人" }]; if (opts.needSeer) schema.seerCheck = "要查的人名"; if (opts.needGuard) schema.guardProtect = "要守护的人名";
    const sys = AC + SKILL_RULE + "\n\n狼人杀·天黑，你是法官，替 AI 玩家做今晚的决定。" + need.join("") +
      "\n\n【存活】" + opts.aliveNames.join("、") + (opts.log ? "\n【目前局况】\n" + opts.log : "") +
      "\n\n【输出】只输出 JSON：" + JSON.stringify(schema);
    const raw = await callRetry(api, sys, [{ role: "user", content: "做今晚的决定。" }], { maxTokens: 1600 });
    return extractJSON(raw) || {};
  }
  // 夜晚：替 AI 女巫决定用不用药（一晚最多一瓶）
  async function genWitch(api, opts) {
    const bottles = []; if (opts.hasHeal) bottles.push("解药(救今晚被刀的人)"); if (opts.hasPoison) bottles.push("毒药(毒死一人)");
    const sys = AC + SKILL_RULE + "\n\n狼人杀·天黑，你替 AI 女巫做决定。女巫有解药和毒药、【一晚最多用一瓶】、别乱用。\n今晚被狼刀的是：" + (opts.victim || "（没人被刀，平安夜）") + "。\n你手上还有：" + (bottles.length ? bottles.join("、") : "（药都用完了）") + "。\n按你的水平决定：值不值得用解药救 TA（是不是关键神/好人？是不是首刀骗药？）？要不要用毒药毒一个明显的狼？没把握就都别用、留着更值钱。\n【存活】" + opts.aliveNames.join("、") + (opts.log ? "\n【局况】\n" + opts.log : "") +
      "\n\n【输出】只输出 JSON：{\"save\":true/false,\"poison\":\"要毒的人名，或 null\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "用不用药？" }], { maxTokens: 800 });
    return extractJSON(raw) || {};
  }
  // 猎人 / 狼王 出局开枪：AI 决定带走谁（按阵营给不同目标取向）
  async function genHunter(api, opts) {
    const roleZh = opts.roleZh || "猎人";
    const aim = opts.isWolf
      ? "你是狼阵营的" + roleZh + "，开这一枪是替狼队多带走一个【好人】：优先打你判断的关键神（预言家/女巫等）或发言强、威胁大的好人；别打自己的狼队友。"
      : "你是好人阵营的" + roleZh + "，优先带走你最确信是狼的人；没把握也可以打一个狼味最重的可疑对象，或者干脆不开枪（乱打好人反而帮了狼）。";
    const sys = AC + SKILL_RULE + "\n\n狼人杀·你替 AI " + roleZh + " 做决定。" + roleZh + " " + opts.hunterName + " 刚出局，可以开枪带走【一个】还在场的人（也可以不开枪）。" + aim + (opts.teammates && opts.teammates.length ? "\n【你的狼队友（别打）】" + opts.teammates.join("、") : "") + "\n【还在场】" + opts.aliveNames.join("、") + (opts.log ? "\n【局况】\n" + opts.log : "") +
      "\n\n【输出】只输出 JSON：{\"target\":\"要带走的人名，或 null（不开枪）\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "开枪带走谁？" }], { maxTokens: 700 });
    return extractJSON(raw) || {};
  }
  // 白狼王：AI 决定今天要不要自爆带人（自爆=亮身份+带走一人+直接天黑）
  async function genWhiteWolf(api, opts) {
    const sys = AC + SKILL_RULE + "\n\n狼人杀·天亮了，你替 AI【白狼王】" + opts.name + " 决定现在要不要【自爆】。自爆＝当场亮明狼身份、立刻带走一名玩家、并直接结束今天进入黑夜（跳过发言与投票放逐）。\n【何时值得自爆】狼队要被翻盘、队友快被票出去时搅局止损；或看准机会炸掉关键神（预言家/女巫）打乱好人节奏。没有明确收益就【别炸】——多数时候留着更有用，倾向于不自爆。\n【还在场】" + opts.aliveNames.join("、") + (opts.teammates && opts.teammates.length ? "\n【狼队友（别炸自己人）】" + opts.teammates.join("、") : "") + (opts.log ? "\n【局况】\n" + opts.log : "") +
      "\n\n【输出】只输出 JSON：{\"selfDestruct\":true/false,\"target\":\"自爆要带走的人名，或 null（只炸不带人）\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "要自爆吗？" }], { maxTokens: 600 });
    return extractJSON(raw) || {};
  }
  // 狼刀投票计票：多数决，平票随机；支持空刀（不杀人）；对齐到存活玩家
  const KILL_SKIP = "__skip__";
  function tallyKill(votes, list) {
    const cnt = {};
    (votes || []).forEach(function (v) {
      if (!v || !v.target) return;
      if (/空刀|不刀|不杀|弃刀|skip|pass|none|null/i.test(String(v.target))) { cnt[KILL_SKIP] = (cnt[KILL_SKIP] || 0) + 1; return; }
      const tp = list.find(function (p) { return p.alive && (p.name === v.target || String(v.target).indexOf(p.name) >= 0); });
      if (tp) cnt[tp.name] = (cnt[tp.name] || 0) + 1;
    });
    let max = -1, tied = []; Object.keys(cnt).forEach(function (nm) { if (cnt[nm] > max) { max = cnt[nm]; tied = [nm]; } else if (cnt[nm] === max) tied.push(nm); });
    const pick = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
    return (!pick || pick === KILL_SKIP) ? null : pick; // 空刀/无有效票 → 不杀
  }

  // 立场纪要 → 文本（喂模型保持前后一致）
  function stanceText(stances) {
    const keys = Object.keys(stances || {});
    if (!keys.length) return "";
    const line = function (s) {
      if (!s) return "（暂无）";
      if (typeof s === "string") return s; // 兼容旧存档/用户的一句话
      return [s.claim ? "声称:" + s.claim : "", s.reads ? "读牌:" + s.reads : "", s.plan ? "打算:" + s.plan : ""].filter(Boolean).join(" ｜ ") || "（暂无）";
    };
    return "\n\n【目前各人的立场纪要（各人的身份声称 / 怎么读别人 / 打算怎么打——**发言与投票务必和自己这条保持连贯，别无缘无故改口、前后矛盾**，除非确有新信息把 TA 说服才转向，转向也要说清为什么）】\n" + keys.map(function (k) { return "· " + k + "：" + line(stances[k]); }).join("\n");
  }
  // 全场公开声明台账（跨天累积）——谁跳过预言家、谁被报过查杀/金水，让多天发言/投票保持一致，不"集体失忆"
  function claimsText(claims) {
    if (!claims || !claims.length) return "";
    return "\n\n【全场公开声明台账（跨天累积·全场都听见了，务必和这些保持一致：别装作没人跳过预言家、别忘了谁被报过查杀/金水、别再声称已被别人占掉的身份、别把已对跳的两方混为一谈）】\n" + claims.slice(-24).map(function (c) { return "· 第" + c.day + "天 " + c.name + "：" + c.text; }).join("\n");
  }
  // 牌局状态：当前天数 + 存活/出局名单（防 AI 对着出局的人喊话、搞错天数）
  function boardState(list, dayNum) {
    const alive = list.filter(function (p) { return p.alive; }).map(function (p) { return p.name; });
    const out = list.filter(function (p) { return !p.alive; }).map(function (p) { const o = p.out || {}; return p.name + "（" + (o.day ? ("第" + o.day + (o.how === "vote" ? "天被投票出局" : "夜里倒下")) : "已出局") + "）"; });
    const idiots = list.filter(function (p) { return p.alive && p.idiotRevealed; }).map(function (p) { return p.name; });
    const idiotLine = idiots.length ? "\n· 【已翻牌的白痴】" + idiots.join("、") + "：已亮明是白痴（确认好人、免死留场但已【没有投票权】）——别再把 TA 当狼查、别投 TA（投了也没用），发言时把 TA 当已验的好人。" : "";
    return "\n\n【★牌局状态·务必严格按这个来】\n· 现在是【第 " + dayNum + " 天】白天。\n· 【还在场（只有这些人能被讨论、被怀疑、被投票）】：" + (alive.join("、") || "无") + "\n· 【已出局——这些人已经退出游戏！绝对别再叫他们发言、别要求他们解释、别说要把他们投出去/放逐、别把他们当活人分析或站队】：" + (out.length ? out.join("、") : "无") + idiotLine + "\n· 投票和点名只能针对【还在场】的人。别搞错第几天、别提已出局的人还在场、别把早已结算过的旧事当成新消息重新推。";
  }
  // 白天发言：存活 AI 依次发一段（带各自身份/私密信息）；同时回一份立场纪要供后续保持一致
  async function genSpeeches(api, speakers, dayNum, prior, deaths, mode, userName, stances, gods, board, wolfRole, claims) {
    const who = speakers.map(function (s) { return "■ " + s.name + "（真实水平：" + (s.skill || "普通") + "）\n   身份与私密：" + s.priv; }).join("\n");
    const p = prior.length ? prior.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n") : "（你们最先发言）";
    const easy = mode === "easy" ? "\n【放水局】狼别演得滴水不漏，给真人留点破绽。" : "";
    const peaceful = /平安夜|没人死|没人被/.test(deaths || "");
    const day1 = dayNum <= 1 ? "\n【第一天·信息极少·别当中间夜打】现在才第 1 天，几乎没有可靠信息。**别过度脑补**——" + (peaceful ? "尤其今天是【平安夜】，别去推演『是不是女巫救了预言家验的人、还是预言家自刀被救』这类没影的可能，本局神职有限，别硬套这些高级推理。" : "") + "别硬咬死谁是狼、别全场催『预言家快跳』。就简短说第一印象、初步站位或表个态就行。预言家要不要跳、什么时候跳，由真预言家自己决定，别逼 TA。" : "";
    const sys = AC + SKILL_RULE + "\n\n" + boardLine(gods, wolfRole) + (board || "") + "\n\n" + WOLF_TACTICS + "\n\n狼人杀·第 " + dayNum + " 天白天发言。每人按顺序发一段【短发言】(2~4句)：分析昨晚的死、站边、表身份或隐藏、抓狼或自证，能用套路就用（对跳/查杀/金水/倒钩/归票…按水平来）。\n**别所有人都重复同一句空话**（尤其别全场都在喊『预言家快跳』）——每个人说点不一样的：报自己身份倾向、给具体某人一个印象/理由、定个策略。\n**只写这人会当众说的话，别写旁白、别泄露不该公开的上帝视角。**按真实水平决定发言质量。" + day1 + easy + stanceText(stances) + claimsText(claims) +
      "\n\n【昨晚】" + (deaths || "平安夜") + "\n\n【已发言】\n" + p + "\n\n【现在依次发言】\n" + who +
      "\n\n【输出】只输出 JSON：{\"speeches\":[{\"name\":\"\",\"text\":\"发言\"}],\"stances\":[{\"name\":\"发言人\",\"claim\":\"你此刻声称的身份（平民/预言家/我查杀了X/我金水了X 等，隐藏身份就写 装平民 之类）\",\"reads\":\"你怎么读别人：疑谁信谁+简短理由\",\"plan\":\"你接下来打算怎么打：归票谁/自证/隐藏/带节奏\"}],\"claims\":[{\"name\":\"发言人\",\"text\":\"TA这轮做出的【硬公开声明】——跳预言家/报X查杀/给X金水/自曝身份/起跳对跳，才需要列；只是表态怀疑、没有硬声明就【别列进 claims】\"}]}，speeches 顺序照上面，stances 每个发言人一条。";
    const raw = await callRetry(api, sys, [{ role: "user", content: "依次发言。" }], { maxTokens: 6000 });
    const r = extractJSON(raw);
    return { speeches: (r && Array.isArray(r.speeches)) ? r.speeches : [], stances: (r && Array.isArray(r.stances)) ? r.stances : [], claims: (r && Array.isArray(r.claims)) ? r.claims : [] };
  }

  // 白天投票放逐
  async function genDayVotes(api, voters, allSpeeches, aliveNames, mode, userName, stances, gods, board, wolfRole, claims) {
    const sp = allSpeeches.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n");
    const who = voters.map(function (v) { return "■ " + v.name + "（" + v.priv + "）真实水平：" + (v.skill || "普通"); }).join("\n");
    const easy = (mode === "easy" && userName) ? "\n【放水局】别针对真人「" + userName + "」，怀疑也手下留情。" : "";
    const fair = "\n【别无端集火·很重要】" + (userName ? "「" + userName + "」是真人玩家。**别只因为 TA 是真人、发言短、或你自己没头绪，就默认投 TA 或带节奏投 TA**——只在真有逻辑依据时才投 TA（被查杀、发言明显矛盾、狼味很重）。真人发言少≠划水。" : "") + "也别全场一窝蜂集火同一个人，除非证据确凿；没实锤就各投各的怀疑对象。";
    const sys = AC + SKILL_RULE + "\n\n" + boardLine(gods, wolfRole) + (board || "") + "\n\n狼人杀·白天投票放逐。据发言，每人投一个要放逐的人 + 一句短理由。狼一般投好人、护队友，但队友已经保不住时可按水平弃车保帅、切割甚至跟票投掉队友保自己；好人投真心怀疑的狼。**实在没读到、没把握时可以弃票**（target 填「弃票」），但别全场弃票、有怀疑就投。理由别露上帝视角、要和自己之前的立场连贯。" + fair + stanceText(stances) + claimsText(claims) + easy +
      "\n\n【可投的存活玩家】" + aliveNames.join("、") + "\n\n【今天发言】\n" + sp + "\n\n【投票的人】\n" + who +
      "\n\n【输出】只输出 JSON：{\"votes\":[{\"name\":\"\",\"target\":\"要放逐的人名，或「弃票」\",\"reason\":\"\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "投票。" }], { maxTokens: 4500 });
    const r = extractJSON(raw); return (r && Array.isArray(r.votes)) ? r.votes : [];
  }

  // 全场 MVP + 一句赛后感言（不一定是胜方）
  async function genMVP(api, players, log, winnerZh) {
    const roleZh = roleName;
    const roster = players.map(function (p) { return "· " + p.name + (p.isUser ? "(你)" : "") + "（" + roleZh(p.role) + "，" + (p.alive ? "存活到终局" : "中途出局") + "）水平：" + (p.skill || "—"); }).join("\n");
    const logText = log.filter(function (it) { return it.type === "speech" || it.type === "death" || it.type === "out" || it.type === "vote"; }).map(function (it) { return it.type === "speech" ? (it.name + "：" + it.text) : it.text; }).slice(-40).join("\n");
    const sys = AC + "这局狼人杀刚结束，" + winnerZh + "。从全体玩家里评一个【全场 MVP】——**不一定是获胜方**，谁打得最精彩 / 最关键 / 最有观赏性都算（虽败犹荣的狼、看穿全场的预言家、搅动风向的平民都行）。给：name（务必是下面名单里的玩家名）、reason（一两句客观点评为什么是 TA）、quote（以 TA 本人口吻、**贴 TA 性格好好说一段赛后感言**，可以几句、有起伏有味道，别太短敷衍——回顾自己这局怎么打的、心态、对手、遗憾或得意都行）。\n\n【全体身份 + 结局 + 水平】\n" + roster + "\n\n【赛况回放】\n" + logText + "\n\n【输出】只输出 JSON：{\"name\":\"\",\"reason\":\"\",\"quote\":\"\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "评全场 MVP + 感言。" }], { maxTokens: 4000 });
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
    const [witchCtx, setWitchCtx] = useState(null); // 用户女巫夜晚决策上下文
    const [poisonPick, setPoisonPick] = useState(false); // 女巫选毒目标中
    const [hunterCtx, setHunterCtx] = useState(null); // 用户猎人/狼王开枪上下文
    const [boomPick, setBoomPick] = useState(false); // 用户白狼王自爆选目标中
    const [pickerOpen, setPickerOpen] = useState(true); // 选择弹框是否展开（可关掉回看发言）
    const logRef = useRef(null);
    const started = useRef(false);
    const seerKnowRef = useRef({});                 // { seerName: [{name,isWolf}] }
    const stanceRef = useRef({});                   // { name: {claim,reads,plan} } 立场纪要(模型自写)，防前后矛盾，不显示
    const claimsRef = useRef([]);                    // [{day,name,text}] 全场公开声明台账，跨天累积防集体失忆
    const witchPotRef = useRef({ heal: true, poison: true }); // 女巫药剂状态（全程一份）
    const guardLastRef = useRef(null);              // 守卫上一晚守的人（不能连守）
    const graveKnowRef = useRef({});                // 守墓人验尸记录 { 守墓人名: [{name,isWolf}] }

    const me = players.find(function (p) { return p.isUser; });
    const alive = players.filter(function (p) { return p.alive; });
    const pushLog = function (items) { setLog(function (L) { return L.concat(items); }); };
    useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, phase, nightStage, busy]);

    // ---- 存档：进到 reveal/night/day 三个稳定节点各存一次；结束清掉。退出后中枢显示「继续」 ----
    const serializePlayers = function (list) { return list.map(function (p) { return { key: p.key, name: p.name, isUser: !!p.isUser, isNpc: !!p.isNpc, skill: p.skill, role: p.role, alive: p.alive, persona: p.persona || "", seat: p.seat, out: p.out, noVote: !!p.noVote, idiotRevealed: !!p.idiotRevealed }; }); };
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
        saveWolf({ v: 1, config: cfg, phase: phase, cycle: cycle, players: serializePlayers(players), log: log, seerKnow: seerKnowRef.current, witchPot: witchPotRef.current, guardLast: guardLastRef.current, graveKnow: graveKnowRef.current, stance: stanceRef.current, claims: claimsRef.current, lastDeath: lastDeath, ts: Date.now() });
      }
    }, [phase, cycle]);
    // 结束后评全场 MVP + 感言
    useEffect(function () {
      if (phase !== "result" || mvp || !api) return;
      (async function () { try { const m = await genMVP(api, players, log, winner === "wolf" ? "狼人获胜" : "好人获胜"); if (m && m.name) setMvp(m); } catch (e) {} })();
    }, [phase]);
    // 每当轮到你做选择（新的阶段/结果）就自动弹出选择框
    useEffect(function () { setPickerOpen(true); }, [phase, nightStage, poisonPick, seerResult, hunterCtx, witchCtx, boomPick]);

    // 胜负：好人=狼全灭胜。狼胜——屠城=剩余好人≤狼数(平局及以下)；屠边=神营 或 民营 被杀绝（该营原本存在才算）
    const computeWin = function (list) {
      const al = list.filter(function (p) { return p.alive; });
      const wolfAlive = al.filter(function (p) { return isWolfRole(p.role); }).length;
      if (wolfAlive === 0) return "good";
      const goodAlive = al.length - wolfAlive;
      if (cfg.winMode === "all") { return goodAlive <= wolfAlive ? "wolf" : null; }
      const godsTotal = list.filter(function (p) { return isGodRole(p.role); }).length;
      const villTotal = list.filter(function (p) { return p.role === "villager"; }).length;
      const godsAlive = al.filter(function (p) { return isGodRole(p.role); }).length;
      const villAlive = al.filter(function (p) { return p.role === "villager"; }).length;
      if ((godsTotal > 0 && godsAlive === 0) || (villTotal > 0 && villAlive === 0)) return "wolf";
      return null;
    };
    const privateFor = function (p, list) {
      if (isWolfRole(p.role)) { const team = list.filter(function (x) { return isWolfRole(x.role) && x.name !== p.name && x.alive; }).map(function (x) { return x.name; }); const sp = p.role === "wolfking" ? "你是【狼王】：被投票或被狼刀……其实狼刀不到你，主要是被投出局时，可以开枪带走【一个】人（被女巫毒死则开不了枪）——优先带走关键神或强好人。" : p.role === "whitewolf" ? "你是【白狼王】：只能在【白天自爆】时带走一个人（被投票/被毒/被刀出局都不能带人）。自爆＝亮身份、带一人、直接天黑，用来搅局止损或炸关键神。" : ""; return "你是狼人。" + (team.length ? "狼队友：" + team.join("、") + "。" : "只剩你一头狼。") + sp + "目标：伪装好人、必要时悍跳预言家、带偏好人。护队友——但当某个队友已经被架住、明显保不住时，**按你的水平决定要不要弃车保帅**：可以切割、甚至顺水推舟投掉这个队友，保住自己的身份和信任，别为一个救不回的同伙陪葬（水平越高越懂止损；讲义气或水平低的才死保到底）。"; }
      if (p.role === "seer") { const k = seerKnowRef.current[p.name] || []; return "你是预言家。查验记录：" + (k.length ? k.map(function (x) { return x.name + "=" + (x.isWolf ? "狼人" : "好人"); }).join("、") : "还没查过") + "。可跳预言家报验人建信任，或视情况隐藏。"; }
      if (p.role === "witch") { const pot = witchPotRef.current; return "你是女巫（神职）。解药" + (pot.heal ? "还在" : "已用掉") + "、毒药" + (pot.poison ? "还在" : "已用掉") + "。白天你知道自己是神，可以隐藏，也可在合适时机跳出来、用救人/毒人的信息建立信任或指认狼。"; }
      if (p.role === "hunter") { return "你是猎人（神职）。被狼刀或被投票出局时能开枪带走一个人（被女巫毒死则开不了枪）。白天可以隐藏身份，也可在被怀疑/关键时刻亮猎人身份威慑狼、稳住场面。"; }
      if (p.role === "guard") { return "你是守卫（神职）。每晚可守护一人挡掉当晚的狼刀，但【不能连续两晚守同一个人】，可以守自己。注意『同守同救』：你守的人若当晚又被女巫用解药救，会互相抵消致其死亡。白天可隐藏，也可在关键时亮守卫身份、用守人信息帮好人建信任。"; }
      if (p.role === "idiot") { return "你是白痴（神职）。白天若被投票放逐，会当场翻牌亮明白痴身份、免于出局并留在场上，但从此【永久失去投票权】。夜里被狼刀或被女巫毒照常死。" + (p.idiotRevealed ? "（你已翻牌，全场都知道你是白痴，你不能再投票了。）" : "可以隐藏，也可赌一手故意被投来自证清白——但翻牌后就没票了，谨慎。"); }
      if (p.role === "gravekeeper") { const k = graveKnowRef.current[p.name] || []; return "你是守墓人（神职）。每次白天放逐后，你会私下得知【被放逐的那个人是狼还是好人】。已验尸：" + (k.length ? k.map(function (x) { return x.name + "=" + (x.isWolf ? "狼" : "好人"); }).join("、") : "还没有人被放逐过") + "。可用这些确定信息在白天带票、指认或洗清，也可视情况隐藏（一亮身份就容易被狼刀）。"; }
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
        witchPotRef.current = s.witchPot || { heal: true, poison: true };
        guardLastRef.current = s.guardLast || null;
        graveKnowRef.current = s.graveKnow || {};
        stanceRef.current = s.stance || {};
        claimsRef.current = s.claims || [];
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
          // 派身份：wolfCount 狼 + 选定的神职各一 + 其余平民
          const nW = wolfCount(list.length);
          const maxG = Math.max(1, list.length - nW - 1); // 至少留 1 民
          const godList = (cfg.gods && cfg.gods.length ? cfg.gods : ["seer"]).slice(0, maxG);
          const idx = shuffle(list.map(function (_, i) { return i; }));
          const roleAt = {}; let k = 0;
          // 狼阵营：若选了狼王/白狼王，第一头狼换成它，其余仍是普通狼
          for (let i = 0; i < nW; i++) roleAt[idx[k++]] = (i === 0 && cfg.wolfRole) ? cfg.wolfRole : "wolf";
          godList.forEach(function (g) { if (k < list.length) roleAt[idx[k++]] = g; });
          list.forEach(function (p, i) { p.role = roleAt[i] || "villager"; p.alive = true; });
          // 定座位：所有人(含你)随机排一次、全程固定；第 r 轮从第 r 号座位起发言、绕圈跳过死人（你也在队列里按座位轮，不再固定第一个）
          const seatArr = shuffle(list.slice());
          seatArr.forEach(function (p, i) { p.seat = i; });
          setPlayers(list);
          pushLog([{ type: "info", text: "本局 " + list.length + " 人：" + nW + " 狼" + (cfg.wolfRole ? "（其中 1 头是" + roleName(cfg.wolfRole) + "）" : "") + "、神职【" + godList.map(roleName).join("、") + "】、" + (list.length - nW - godList.length) + " 平民。" + (cfg.winMode === "all" ? "屠城局——狼把好人全杀绝才胜。" : "屠边局——狼把神营或民营杀绝即胜。") + "不翻牌，已随机排座、发言每轮向后轮一位。" }]);
          setPhase("reveal");
        } catch (e) { setErrMsg((e && e.message) || "开局失败，重试"); setPhase("error"); }
      })();
    }, []);

    // ---- 夜晚 ----
    const enterNight = async function (list, n) {
      setPhase("night"); setNightStage("run"); setSeerResult(null); setBusy(true);
      const al = list.filter(function (p) { return p.alive; });
      const wolves = al.filter(function (p) { return isWolfRole(p.role); });
      const aiWolves = wolves.filter(function (p) { return !p.isUser; });
      const seer = al.find(function (p) { return p.role === "seer"; });
      const guard = al.find(function (p) { return p.role === "guard"; });
      const meNow = list.find(function (p) { return p.isUser; });
      const userWolf = meNow && meNow.alive && isWolfRole(meNow.role);
      const userSeer = meNow && meNow.alive && meNow.role === "seer";
      const userGuard = meNow && meNow.alive && meNow.role === "guard";
      const needWolf = aiWolves.length > 0;     // 有 AI 狼就让它们各自投刀
      const needSeer = !!(seer && !userSeer);   // 预言家是 AI 才让 AI 选
      const needGuard = !!(guard && !userGuard); // 守卫是 AI 才让 AI 选
      let ai = {};
      try {
        if (needWolf || needSeer || needGuard) ai = await genNight(api, { needWolf: needWolf, needSeer: needSeer, needGuard: needGuard, wolfTeam: aiWolves.map(function (w) { return w.name; }), seer: seer ? { name: seer.name, skill: seer.skill, known: seerKnowRef.current[seer.name] || [] } : null, guard: guard ? { name: guard.name, last: guardLastRef.current } : null, aliveNames: al.map(function (p) { return p.name; }), log: shortLog(), mode: cfg.mode });
      } catch (e) { props.toast && props.toast("天黑出错：" + ((e && e.message) || "重试")); }
      setBusy(false);
      const wolfVotes = Array.isArray(ai.wolfVotes) ? ai.wolfVotes : [];
      const aiGuardName = needGuard ? ai.guardProtect : null;
      setNightAI({ wolfVotes: wolfVotes, seerCheck: ai.seerCheck, seerName: seer ? seer.name : null, guardName: aiGuardName, list: list, n: n });
      const seerInfo = (seer && !userSeer) ? { seer: seer.name, target: ai.seerCheck } : null;
      if (userWolf) setNightStage("wolf");       // 用户狼：等你投刀，再和队友合票
      else if (userSeer) setNightStage("seer");
      else if (userGuard) setNightStage("guard");
      else finishNight(list, tallyKill(wolfVotes, list), seerInfo, n, wolfVotes, false, aiGuardName);
    };
    // 狼刀 + 预言家定好后走这里：处理女巫（用户或 AI），再结算
    const finishNight = async function (list, wolfTarget, seerInfo, n, wolfVotes, showKillLog, guardName) {
      const witch = list.find(function (p) { return p.alive && p.role === "witch"; });
      if (witch && witch.isUser) { // 用户女巫：展示被刀者，给救/毒
        setWitchCtx({ list: list, wolfTarget: wolfTarget, seerInfo: seerInfo, n: n, wolfVotes: wolfVotes, showKillLog: showKillLog, guardName: guardName });
        setPoisonPick(false); setNightStage("witch");
        return;
      }
      let witchAction = null;
      if (witch) { // AI 女巫决定
        setBusy(true);
        try {
          const pot = witchPotRef.current;
          const al = list.filter(function (p) { return p.alive; });
          const victim = wolfTarget && (al.find(function (p) { return p.name === wolfTarget || (wolfTarget || "").indexOf(p.name) >= 0; }) || {}).name;
          const res = await genWitch(api, { witchName: witch.name, skill: witch.skill, victim: victim, hasHeal: pot.heal, hasPoison: pot.poison, aliveNames: al.map(function (p) { return p.name; }), log: shortLog() });
          const save = !!res.save && pot.heal && !!victim;
          const poison = (!save && res.poison && pot.poison) ? res.poison : null; // 一晚一瓶：救了就不毒
          witchAction = { save: save, poison: poison };
        } catch (e) {}
        setBusy(false);
      }
      resolveNight(list, wolfTarget, seerInfo, n, wolfVotes, showKillLog, witchAction, guardName);
    };
    const resolveNight = function (list, wolfTarget, seerInfo, n, wolfVotes, showKillLog, witchAction, guardName) {
      // AI 预言家的查验入知识库
      if (seerInfo && seerInfo.seer && seerInfo.target) {
        const tp0 = list.find(function (p) { return p.name === seerInfo.target || (seerInfo.target || "").indexOf(p.name) >= 0; });
        if (tp0) { const km = Object.assign({}, seerKnowRef.current); km[seerInfo.seer] = (km[seerInfo.seer] || []).concat([{ name: tp0.name, isWolf: isWolfRole(tp0.role) }]); seerKnowRef.current = km; }
      }
      const saved = !!(witchAction && witchAction.save);
      const poisonName = witchAction && witchAction.poison;
      if (witchAction) { const np = Object.assign({}, witchPotRef.current); if (witchAction.save) np.heal = false; if (poisonName) np.poison = false; witchPotRef.current = np; }
      // 守卫结算：记住这一晚守的人（供下一晚判「不能连守」）
      const victimP = wolfTarget && list.find(function (p) { return p.alive && (p.name === wolfTarget || (wolfTarget || "").indexOf(p.name) >= 0); });
      const guarded = !!(guardName && victimP && (victimP.name === guardName || String(guardName).indexOf(victimP.name) >= 0));
      if (list.some(function (p) { return p.alive && p.role === "guard"; })) { const gp = guardName && list.find(function (p) { return p.name === guardName || String(guardName).indexOf(p.name) >= 0; }); guardLastRef.current = gp ? gp.name : guardLastRef.current; }
      const deadSet = {}; // name -> 死因("wolf"/"poison")，猎人被毒不能开枪
      // 狼刀致死判定：被守护 或 被解药救 → 挡下；但『同守同救』(既守又救) 会互相抵消 → 仍死
      if (victimP) { const blocked = (guarded || saved) && !(guarded && saved); if (!blocked) deadSet[victimP.name] = "wolf"; }
      if (poisonName) { const pv = list.find(function (p) { return p.alive && (p.name === poisonName || (poisonName || "").indexOf(p.name) >= 0); }); if (pv) deadSet[pv.name] = "poison"; }
      const deadNames = Object.keys(deadSet);
      const deadUser = deadNames.some(function (nm) { const pp = list.find(function (p) { return p.name === nm; }); return pp && pp.isUser; });
      deadNames.forEach(function (nm) { delete stanceRef.current[nm]; }); // 出局的人不再进立场纪要
      const next = list.map(function (p) { return deadSet[p.name] ? Object.assign({}, p, { alive: false, out: { day: n, how: "night" } }) : p; });
      setPlayers(next);
      const nightItems = [{ type: "night", n: n }];
      if (showKillLog && wolfVotes && wolfVotes.length) nightItems.push({ type: "info", text: "🐺 狼队刀人投票：" + wolfVotes.map(function (v) { return v.name + "→" + v.target; }).join("、") + "　最终刀：" + (wolfTarget || "（无）") + (saved ? "（被女巫解药救回）" : "") });
      const deathText = deadNames.length ? ("天亮了，昨晚 " + deadNames.map(function (nm) { const pp = list.find(function (p) { return p.name === nm; }); return nm + (pp && pp.isUser ? "(你)" : ""); }).join("、") + " 倒下了。" + (deadUser ? "你出局了，接下来看他们博弈。" : "")) : "天亮了，是个平安夜。";
      setLastDeath(deadNames.length ? (deadNames.join("、") + " 昨晚倒下") : "平安夜（没人死）");
      nightItems.push({ type: "death", text: deathText });
      pushLog(nightItems);
      setNightStage(null);
      concludeDeaths(next, deadSet, deadNames, n, function (l) { startDay(l, n); });
    };
    // 结算一批死亡：先处理猎人/狼王开枪(被毒不能开)，再判胜负、再继续
    const concludeDeaths = function (list, causeByName, deadNames, dayNum, cont) {
      // 猎人和狼王都是「出局时开枪」，被毒死则开不了枪
      const deadShooter = (deadNames || []).map(function (nm) { return list.find(function (p) { return p.name === nm; }); }).find(function (p) { return p && (p.role === "hunter" || p.role === "wolfking") && (causeByName || {})[p.name] !== "poison"; });
      if (deadShooter) {
        const isWolfShooter = isWolfRole(deadShooter.role);
        if (deadShooter.isUser) { setHunterCtx({ list: list, dayNum: dayNum, cont: cont, hunter: deadShooter }); setPhase("hunter"); return; }
        (async function () {
          setBusy(true);
          let target = null;
          try { const r = await genHunter(api, { hunterName: deadShooter.name, roleZh: roleName(deadShooter.role), isWolf: isWolfShooter, teammates: isWolfShooter ? list.filter(function (p) { return isWolfRole(p.role) && p.alive && p.name !== deadShooter.name; }).map(function (p) { return p.name; }) : [], skill: deadShooter.skill, aliveNames: list.filter(function (p) { return p.alive; }).map(function (p) { return p.name; }), log: shortLog() }); target = r.target; } catch (e) {}
          setBusy(false);
          applyShot(list, deadShooter, target, dayNum, cont);
        })();
        return;
      }
      const w = computeWin(list); if (w) { setWinner(w); setPhase("result"); return; }
      cont(list);
    };
    const applyShot = function (list, hunter, target, dayNum, cont) {
      const tp = target && list.find(function (p) { return p.alive && (p.name === target || String(target).indexOf(p.name) >= 0); });
      let next = list, shotName = null;
      if (tp && tp.alive) { next = list.map(function (p) { return p === tp ? Object.assign({}, p, { alive: false, out: { day: dayNum, how: "shot" } }) : p; }); shotName = tp.name; delete stanceRef.current[tp.name]; setPlayers(next); }
      pushLog([{ type: "out", name: hunter.name, text: "🔫 " + roleName(hunter.role) + " " + hunter.name + (hunter.isUser ? "(你)" : "") + " 倒下时开枪，" + (shotName ? "带走了 " + shotName + (tp && tp.isUser ? "(你)" : "") : "没有开枪") + "。" }]);
      const w = computeWin(next); if (w) { setWinner(w); setPhase("result"); return; }
      cont(next);
    };
    const submitHunterShot = function (name) {
      const c = hunterCtx; if (!c) return;
      setHunterCtx(null);
      applyShot(c.list, c.hunter, name, c.dayNum, c.cont);
    };
    // 用户狼刀：你的一票 + AI 队友的投票，少数服从多数、平票随机
    const submitWolfKill = function (name) {
      const info = nightAI;
      const allVotes = (info.wolfVotes || []).concat([{ name: (info.list.find(function (p) { return p.isUser; }) || {}).name || "你", target: name }]);
      const finalKill = tallyKill(allVotes, info.list);
      finishNight(info.list, finalKill, info.seerName ? { seer: info.seerName, target: info.seerCheck } : null, info.n, allVotes, true, info.guardName);
    };
    // 用户守卫守护
    const submitGuardProtect = function (name) {
      const info = nightAI;
      finishNight(info.list, tallyKill(info.wolfVotes, info.list), info.seerName ? { seer: info.seerName, target: info.seerCheck } : null, info.n, info.wolfVotes, false, name);
    };
    // 用户预言家查验
    const submitSeerCheck = function (name) {
      const info = nightAI; const tp = info.list.find(function (p) { return p.name === name; });
      const isWolf = tp && isWolfRole(tp.role);
      const seerNm = (info.list.find(function (p) { return p.isUser; }) || {}).name;
      if (seerNm && tp) { const km = Object.assign({}, seerKnowRef.current); km[seerNm] = (km[seerNm] || []).concat([{ name: tp.name, isWolf: isWolf }]); seerKnowRef.current = km; }
      setSeerResult({ name: name, isWolf: isWolf });
    };
    const seerDone = function () { const info = nightAI; finishNight(info.list, tallyKill(info.wolfVotes, info.list), null, info.n, info.wolfVotes, false, info.guardName); };
    // 用户女巫：救 / 毒 / 都不用
    const submitWitch = function (action) {
      const c = witchCtx; if (!c) return;
      setNightStage("run"); setWitchCtx(null); setPoisonPick(false);
      resolveNight(c.list, c.wolfTarget, c.seerInfo, c.n, c.wolfVotes, c.showKillLog, action, c.guardName);
    };

    // ---- 白天 ----
    // 固定座位 → 每轮起始向后轮一位：存活玩家按座位号、从本轮起始座位起绕圈排
    const speakOrder = function (list, n) {
      const N = list.length;
      const alive = list.map(function (p, i) { return { p: p, seat: (typeof p.seat === "number" ? p.seat : i) }; }).filter(function (x) { return x.p.alive; });
      const start = ((n - 1) % N + N) % N;
      alive.sort(function (a, b) { return ((a.seat - start + N) % N) - ((b.seat - start + N) % N); });
      return alive.map(function (x) { return x.p; });
    };
    const startDay = function (list, n) {
      setPhase("day"); setDaySpeeches([]); setUserSpeech(""); setUserVote(null); setBoomPick(false);
      // AI 白狼王：从第 2 天起，天亮先决定要不要自爆搅局（自爆则跳过整个白天直接进夜）
      const aiWW = list.find(function (p) { return p.alive && p.role === "whitewolf" && !p.isUser; });
      if (aiWW && n >= 2) {
        (async function () {
          setBusy(true);
          let dec = {};
          try { dec = await genWhiteWolf(api, { name: aiWW.name, skill: aiWW.skill, aliveNames: list.filter(function (p) { return p.alive; }).map(function (p) { return p.name; }), teammates: list.filter(function (p) { return isWolfRole(p.role) && p.alive && p.name !== aiWW.name; }).map(function (p) { return p.name; }), log: shortLog(), dayNum: n }); } catch (e) {}
          setBusy(false);
          if (dec && dec.selfDestruct) { resolveSelfDestruct(list, aiWW, dec.target, n); return; }
          beginDay(list, n);
        })();
        return;
      }
      beginDay(list, n);
    };
    // 白天正常流程（发言→投票）
    const beginDay = function (list, n) {
      const order = speakOrder(list, n);
      const meIdx = order.findIndex(function (p) { return p.isUser && p.alive; });
      if (meIdx < 0) aiSpeakSeq(list, order, [], n, true);                 // 用户不在场/已死 → 全 AI 按序说完进投票
      else if (meIdx > 0) aiSpeakSeq(list, order.slice(0, meIdx), [], n, false); // 轮到用户前的先说，停下等用户
      // meIdx===0：轮到用户先发言，直接等输入
    };
    // 白狼王自爆：亮身份、带走一人、直接结束今天进入黑夜
    const doSelfDestruct = function (name) { setBoomPick(false); resolveSelfDestruct(players, me, name, cycle); };
    const resolveSelfDestruct = function (list, ww, targetName, dayNum) {
      const tp = targetName && list.find(function (p) { return p.alive && (p.name === targetName || String(targetName).indexOf(p.name) >= 0); });
      const dead = {}; dead[ww.name] = "boom"; if (tp) dead[tp.name] = "boom";
      Object.keys(dead).forEach(function (nm) { delete stanceRef.current[nm]; });
      const next = list.map(function (p) { return dead[p.name] ? Object.assign({}, p, { alive: false, out: { day: dayNum, how: "boom" } }) : p; });
      setPlayers(next);
      pushLog([{ type: "out", name: ww.name, text: "💥 " + ww.name + (ww.isUser ? "(你)" : "") + " 自爆了——白狼王！" + (tp ? "拉着 " + tp.name + (tp.isUser ? "(你)" : "") + " 一起出局。" : "没有带走任何人。") + "今天到此为止，直接天黑。" }]);
      // 自爆带走的人若是猎人，仍可开枪；随后判胜负、进入下一夜
      if (tp) { const cause = {}; cause[tp.name] = "boom"; concludeDeaths(next, cause, [tp.name], dayNum, function (l) { setCycle(dayNum + 1); enterNight(l, dayNum + 1); }); }
      else { const w = computeWin(next); if (w) { setWinner(w); setPhase("result"); return; } setCycle(dayNum + 1); enterNight(next, dayNum + 1); }
    };
    // 让一批 AI【按给定顺序】依次发言；final=true 说完进投票，否则停下等用户
    const aiSpeakSeq = async function (list, group, prior, n, final) {
      const ai = group.filter(function (p) { return !p.isUser; });
      if (!ai.length) { if (final) { setPhase("dayvote"); setUserVote(null); } return; }
      setBusy(true);
      try {
        const speakers = ai.map(function (p) { return { name: p.name, skill: p.skill, priv: privateFor(p, list) }; });
        const res = await genSpeeches(api, speakers, n, prior, lastDeath, cfg.mode, (list.find(function (p) { return p.isUser && p.alive; }) || {}).name || "", stanceRef.current, cfg.gods, boardState(list, n), cfg.wolfRole, claimsRef.current);
        const sp = res.speeches;
        (res.stances || []).forEach(function (s) { if (s && s.name) { const hit = speakers.find(function (x) { return s.name.indexOf(x.name) >= 0 || x.name.indexOf(s.name) >= 0; }); if (hit && (s.claim || s.reads || s.plan || s.stance)) stanceRef.current[hit.name] = s.stance ? s.stance : { claim: s.claim || "", reads: s.reads || "", plan: s.plan || "" }; } });
        // 新增的硬公开声明入台账（跨天累积）
        (res.claims || []).forEach(function (c) { if (c && c.name && c.text && String(c.text).trim()) { const hit = speakers.find(function (x) { return c.name.indexOf(x.name) >= 0 || x.name.indexOf(c.name) >= 0; }); if (hit) claimsRef.current = claimsRef.current.concat([{ day: n, name: hit.name, text: String(c.text).trim() }]); } });
        const norm = speakers.map(function (s) { const hit = sp.find(function (c) { return c.name && (c.name.indexOf(s.name) >= 0 || s.name.indexOf(c.name) >= 0); }); return { name: s.name, text: (hit && hit.text) || "……（沉默了一下，没多说）" }; });
        setDaySpeeches(function (D) { return D.concat(norm); });
        pushLog(norm.map(function (c) { return { type: "speech", name: c.name, text: c.text }; }));
        if (final) { setPhase("dayvote"); setUserVote(null); }
      } catch (e) { props.toast && props.toast("发言失败：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };
    const submitUserSpeech = function () {
      const v = userSpeech.trim(); if (!v || !me) return;
      pushLog([{ type: "speech", name: me.name, text: v, mine: true }]);
      stanceRef.current[me.name] = v.slice(0, 60); // 记下你的立场，AI 后续保持连贯
      const mine = { name: me.name, text: v };
      setDaySpeeches(function (D) { return D.concat([mine]); });
      setUserSpeech("");
      const order = speakOrder(players, cycle);
      const meIdx = order.findIndex(function (p) { return p.isUser; });
      const after = order.slice(meIdx + 1);
      const prior = daySpeeches.concat([mine]); // 轮到用户前那批 + 用户这句
      if (after.filter(function (p) { return !p.isUser; }).length) aiSpeakSeq(players, after, prior, cycle, true);
      else { setPhase("dayvote"); setUserVote(null); }
    };
    // ---- 投票 ----
    const runDayVote = async function (userTarget) {
      setBusy(true);
      try {
        const al = players.filter(function (p) { return p.alive; });
        const aiV = al.filter(function (p) { return !p.isUser && !p.noVote; }); // 翻牌白痴等失去投票权者不参与投票
        const voters = aiV.map(function (p) { return { name: p.name, skill: p.skill, priv: privateFor(p, players) }; });
        const raw = await genDayVotes(api, voters, daySpeeches.filter(function (c) { return c.name; }), al.map(function (p) { return p.name; }), cfg.mode, (me && me.alive) ? me.name : "", stanceRef.current, cfg.gods, boardState(players, cycle), cfg.wolfRole, claimsRef.current);
        const votes = voters.map(function (v) {
          const hit = raw.find(function (r) { return r.name && (r.name.indexOf(v.name) >= 0 || v.name.indexOf(r.name) >= 0); });
          const target = hit && hit.target ? String(hit.target) : "";
          const abstain = !target || /弃票|弃权|不投|放弃|abstain|pass|none|null/i.test(target);
          // 弃票或对不上名字都算弃票（不再随机硬投）
          const tp = abstain ? null : al.find(function (p) { return p.name === target || target.indexOf(p.name) >= 0; });
          return { voter: v.name, target: tp ? tp.name : null, reason: (hit && hit.reason) || (abstain ? "弃票" : "") };
        });
        if (me && me.alive && !me.noVote && userTarget && userTarget !== "__abstain__") votes.push({ voter: me.name, target: userTarget, reason: "（你的一票）" });
        else if (me && me.alive && !me.noVote && userTarget === "__abstain__") votes.push({ voter: me.name, target: null, reason: "弃票" });
        // 计票
        pushLog([{ type: "sep", text: "—— 投票放逐 ——" }].concat(votes.map(function (v) { return { type: "vote", name: v.voter, target: v.target, reason: v.reason }; })));
        const cnt = {}; votes.forEach(function (v) { if (v.target) cnt[v.target] = (cnt[v.target] || 0) + 1; });
        let max = -1, tied = []; Object.keys(cnt).forEach(function (nm) { if (cnt[nm] > max) { max = cnt[nm]; tied = [nm]; } else if (cnt[nm] === max) tied.push(nm); });
        const outName = tied.length ? tied[Math.floor(Math.random() * tied.length)] : null;
        const out = outName && players.find(function (p) { return p.alive && p.name === outName; });
        if (!out) { pushLog([{ type: "info", text: "没投出有效结果，直接天黑。" }]); setBusy(false); setCycle(cycle + 1); enterNight(players, cycle + 1); return; }
        // 白痴翻牌：第一次被放逐时亮身份免死、留在场上，但从此失去投票权
        if (out.role === "idiot" && !out.idiotRevealed) {
          const next2 = players.map(function (p) { return p === out ? Object.assign({}, p, { idiotRevealed: true, noVote: true }) : p; });
          pushLog([{ type: "out", name: out.name, isUser: out.isUser, text: "🃏 " + out.name + (out.isUser ? "(你)" : "") + " 翻开【白痴】牌——免于放逐、留在场上，但从此失去投票权。" }]);
          setPlayers(next2); setBusy(false); setCycle(cycle + 1); enterNight(next2, cycle + 1);
          return;
        }
        delete stanceRef.current[out.name]; // 出局的人不再进立场纪要
        // 守墓人验尸：得知这个被放逐的人是狼还是好人
        const gk = players.find(function (p) { return p.alive && p.role === "gravekeeper" && p !== out; });
        if (gk) { const gm = Object.assign({}, graveKnowRef.current); gm[gk.name] = (gm[gk.name] || []).concat([{ name: out.name, isWolf: isWolfRole(out.role) }]); graveKnowRef.current = gm; }
        const next = players.map(function (p) { return p === out ? Object.assign({}, p, { alive: false, out: { day: cycle, how: "vote" } }) : p; });
        pushLog([{ type: "out", name: out.name, isUser: out.isUser, text: "🗳 " + out.name + (out.isUser ? "(你)" : "") + " 被放逐出局（身份不公开）。" }]);
        setPlayers(next);
        setBusy(false);
        const cause = {}; cause[out.name] = "vote";
        concludeDeaths(next, cause, [out.name], cycle, function (l) { setCycle(cycle + 1); enterNight(l, cycle + 1); });
      } catch (e) { props.toast && props.toast("投票失败：" + ((e && e.message) || "重试")); setBusy(false); }
    };

    // ---- 渲染 ----
    const pAvatar = function (p, size) {
      if (p && p.char) return h(Avatar, { character: p.char, size: size, radius: Math.round(size * 0.3) });
      return h("div", { style: { width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, background: p && p.isUser ? t.tint : t.line, color: "#fff", fontFamily: F_DISPLAY, fontSize: Math.round(size * 0.46), display: "flex", alignItems: "center", justifyContent: "center" } }, ((p && p.name) || "?").slice(0, 1));
    };
    const pByName = function (nm) { return players.find(function (p) { return p.name === nm; }); };
    const roleZh = roleName;
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

    const seated = players.slice().sort(function (a, b) { return (typeof a.seat === "number" ? a.seat : 0) - (typeof b.seat === "number" ? b.seat : 0); });
    const roster = h("div", { className: "shrink-0", style: { display: "flex", gap: 10, overflowX: "auto", padding: "10px 16px", borderBottom: "1px solid " + t.line } },
      seated.map(function (p, i) {
        return h("button", { key: p.key, onClick: function () { setDetail(p); }, className: "active:opacity-70", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: p.alive ? 1 : 0.32, flexShrink: 0, width: 46 } },
          h("div", { style: { position: "relative" } }, pAvatar(p, 38),
            h("div", { style: { position: "absolute", top: -3, left: -3, minWidth: 15, height: 15, borderRadius: 999, background: t.ink, color: "#f3efe6", fontFamily: F_BODY, fontSize: 9, lineHeight: "15px", textAlign: "center", padding: "0 2px" } }, (typeof p.seat === "number" ? p.seat : i) + 1),
            !p.alive ? h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 } }, "✖") : null),
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
    const roleBanner = me ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, "你的身份：", h("b", { style: { color: isWolfRole(me.role) ? "#c0553f" : t.ink, fontSize: 14 } }, roleZh(me.role)), isWolfRole(me.role) ? h("span", null, "　狼队友：" + (players.filter(function (p) { return isWolfRole(p.role) && !p.isUser; }).map(function (p) { return p.name; }).join("、") || "无（只剩你）")) : null) : null;
    const pickRow = function (targets, val, onPick) {
      return h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 8 } },
        targets.map(function (p) { const on = val === p.name; return h("button", { key: p.key, onClick: function () { onPick(p.name); }, style: { display: "flex", alignItems: "center", gap: 4, fontFamily: F_BODY, fontSize: 12.5, color: on ? "#fff" : t.ink, background: on ? t.tint : t.bg2, border: "1px solid " + (on ? t.tint : t.line), borderRadius: 999, padding: "4px 10px 4px 4px" } }, pAvatar(p, 18), p.name); }));
    };

    let inline = null;   // 底部短条
    let pick = null;     // 需要选择时的居中弹框 {title, sub, body}
    const hintBox = function (txt) { return h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, txt); };
    if (phase === "reveal") {
      inline = h("div", null, roleBanner,
        h("button", { onClick: function () { enterNight(players, 1); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "13px" } }, "天黑请闭眼"));
    } else if (phase === "night") {
      if (nightStage === "run" || busy) inline = hintBox("🌙 天黑了，夜色里有人在行动…");
      else if (nightStage === "wolf") pick = { title: "选今晚要刀的人", sub: "你的一票 + 队友合票，少数服从多数", body: h("div", null,
        pickRow(alive.filter(function (p) { return !p.isUser; }), null, function (nm) { submitWolfKill(nm); }),
        h("div", { style: { display: "flex", justifyContent: "center" } }, h("button", { onClick: function () { submitWolfKill("空刀"); }, className: "active:opacity-80", style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 16px" } }, "🔪 空刀（今晚不杀）"))) };
      else if (nightStage === "seer") {
        if (seerResult) pick = { title: "查验结果", body: h("div", null,
          h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 16, color: t.ink, marginBottom: 14 } }, h("b", { style: { color: seerResult.isWolf ? "#c0553f" : "#3f6d5a" } }, seerResult.name + " 是【" + (seerResult.isWolf ? "狼人" : "好人") + "】")),
          h("button", { onClick: seerDone, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "12px" } }, "知道了 · 天亮")) };
        else pick = { title: "选一个人查验身份", body: pickRow(alive.filter(function (p) { return !p.isUser; }), null, function (nm) { submitSeerCheck(nm); }) };
      }
      else if (nightStage === "guard") {
        const last = guardLastRef.current;
        pick = { title: "选一个人守护", sub: "挡掉今晚的狼刀 · 可守自己 · 不能连守同一人" + (last ? "（昨晚守了 " + last + "）" : ""), body: pickRow(alive.filter(function (p) { return !(last && p.name === last); }), null, function (nm) { submitGuardProtect(nm); }) };
      }
      else if (nightStage === "witch") {
        const pot = witchPotRef.current;
        const victim = witchCtx && witchCtx.wolfTarget;
        if (poisonPick) pick = { title: "选一个人下毒", sub: "毒药只有一瓶", body: h("div", null,
          pickRow(alive.filter(function (p) { return !p.isUser; }), null, function (nm) { submitWitch({ save: false, poison: nm }); }),
          h("button", { onClick: function () { setPoisonPick(false); }, style: { display: "block", margin: "0 auto", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "6px" } }, "← 返回")) };
        else pick = { title: "女巫用药", sub: victim ? ("今晚 " + victim + " 被狼刀了。") : "今晚是平安夜，没人被狼刀。", body: h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          (pot.heal && victim) ? h("button", { onClick: function () { submitWitch({ save: true, poison: null }); }, className: "active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: "#3f6d5a", borderRadius: 12, padding: "12px" } }, "💊 用解药救 " + victim) : null,
          pot.poison ? h("button", { onClick: function () { setPoisonPick(true); }, className: "active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: "#c0553f", borderRadius: 12, padding: "12px" } }, "☠️ 用毒药毒一个人") : null,
          h("button", { onClick: function () { submitWitch({ save: false, poison: null }); }, className: "active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "11px" } }, "都不用（留着）")) };
      }
    } else if (phase === "hunter") {
      const shooterRole = (hunterCtx && hunterCtx.hunter) ? roleZh(hunterCtx.hunter.role) : "猎人";
      if (busy) inline = hintBox("…");
      else pick = { title: "🔫 " + shooterRole + "开枪", sub: "你出局了，开枪带走一人（翻牌亮身份）", body: h("div", null,
        pickRow((hunterCtx ? hunterCtx.list : players).filter(function (p) { return p.alive && !p.isUser; }), null, function (nm) { submitHunterShot(nm); }),
        h("div", { style: { display: "flex", justifyContent: "center" } }, h("button", { onClick: function () { submitHunterShot(null); }, className: "active:opacity-80", style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 16px" } }, "不开枪"))) };
    } else if (phase === "day") {
      if (busy) inline = hintBox("…大家在发言");
      else if (boomPick && me && me.alive && me.role === "whitewolf") pick = { title: "💥 白狼王自爆", sub: "当场亮明狼身份、带走一人，然后直接天黑", body: h("div", null,
        pickRow(alive.filter(function (p) { return !p.isUser; }), null, function (nm) { doSelfDestruct(nm); }),
        h("div", { style: { display: "flex", justifyContent: "center", gap: 8 } },
          h("button", { onClick: function () { doSelfDestruct(null); }, className: "active:opacity-80", style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 14px" } }, "只自爆不带人"),
          h("button", { onClick: function () { setBoomPick(false); }, style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "6px 10px" } }, "取消"))) };
      else if (me && me.alive) inline = h("div", null, roleBanner,
        h("div", { style: { display: "flex", gap: 8 } },
          h("input", { value: userSpeech, onChange: function (e) { setUserSpeech(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submitUserSpeech(); }, placeholder: "轮到你发言（站边、表身份、抓狼…）", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "11px 14px", borderRadius: 12, border: "1px solid " + t.line, background: t.bg2, color: t.ink, outline: "none" } }),
          h("button", { onClick: submitUserSpeech, style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 12, padding: "0 18px" } }, "发言")),
        (me.role === "whitewolf") ? h("button", { onClick: function () { setBoomPick(true); }, className: "active:opacity-80", style: { display: "block", margin: "8px auto 0", fontFamily: F_BODY, fontSize: 12.5, color: "#c0553f", background: "#c0553f18", border: "1px solid #c0553f66", borderRadius: 999, padding: "6px 16px" } }, "💥 自爆带走一人") : null);
      else inline = hintBox("…");
    } else if (phase === "dayvote") {
      if (busy) inline = hintBox("…计票中");
      else if (me && me.alive && me.noVote) inline = h("div", null,
        h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12.5, color: t.fog, marginBottom: 8 } }, "你已翻牌白痴，没有投票权，看他们投。"),
        h("button", { onClick: function () { runDayVote(null); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "12px" } }, "看他们投票"));
      else if (me && me.alive) pick = { title: "投票放逐谁？", sub: "点谁就投谁", body: h("div", null,
        pickRow(alive.filter(function (p) { return p.name !== me.name; }), null, function (nm) { runDayVote(nm); }),
        h("div", { style: { display: "flex", justifyContent: "center" } }, h("button", { onClick: function () { runDayVote("__abstain__"); }, style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 16px" } }, "弃票"))) };
      else inline = h("button", { onClick: function () { runDayVote(null); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "12px" } }, "看他们投票");
    } else if (phase === "result") {
      const mvpP = mvp && players.find(function (p) { return mvp.name && (p.name === mvp.name || mvp.name.indexOf(p.name) >= 0); });
      inline = h("div", null,
        h("div", { style: { textAlign: "center", fontFamily: F_DISPLAY, fontSize: 20, color: winner === "wolf" ? "#c0553f" : "#3f6d5a", marginBottom: 8 } }, winner === "wolf" ? "🐺 狼人获胜" : "🎉 好人获胜"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7, marginBottom: 12 } }, "身份揭晓：" + players.map(function (p) { return p.name + (p.isUser ? "(你)" : "") + "=" + roleZh(p.role); }).join("　")),
        // 全场 MVP
        mvp ? h("div", { style: { display: "flex", gap: 10, padding: "11px 13px", borderRadius: 13, background: t.tint + "14", border: "1px solid " + t.tint, marginBottom: 12 } },
          mvpP ? pAvatar(mvpP, 40) : null,
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.tint, letterSpacing: 1, marginBottom: 2 } }, "★ 全场 MVP · " + mvp.name),
            mvp.reason ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, lineHeight: 1.55, marginBottom: 4 } }, mvp.reason) : null,
            mvp.quote ? h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 13.5, color: t.ink, lineHeight: 1.7, whiteSpace: "pre-line" } }, "「" + mvp.quote + "」") : null))
          : h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, textAlign: "center", marginBottom: 12 } }, api ? "评选全场 MVP 中…" : ""),
        h("div", { style: { display: "flex", gap: 10 } },
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "12px" } }, "返回"),
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 12, padding: "12px" } }, "回中枢再来一局")));
    }

    // 底部：需要选择时只放一个小按钮（弹框里选），否则放 inline
    const bottom = pick
      ? (pickerOpen
        ? h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "8px 0" } }, "在弹框里选择 · 也可先关掉回看发言")
        : h("button", { onClick: function () { setPickerOpen(true); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.tint, borderRadius: 13, padding: "12px" } }, "▸ 轮到你了 · 点这里做选择"))
      : inline;
    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } }, header, roster, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)", maxHeight: "50vh", overflowY: "auto" } }, bottom),
      (pick && pickerOpen) ? h(PickerModal, { t: t, title: pick.title, sub: pick.sub, onClose: function () { setPickerOpen(false); } }, roleBanner, pick.body) : null,
      detail ? h(PlayerCard, { p: detail, t: t, avatar: pAvatar(detail, 44), roleText: phase === "result" ? ("身份：" + roleZh(detail.role)) : null, roleBad: isWolfRole(detail.role), onClose: function () { setDetail(null); } }) : null);
  }

  // ============================================================
  // 共享：组装玩家名单（角色 + 你 + NPC，带能力小传）
  // ============================================================
  function buildRoster(cfg, props, t, npcData, skillData) {
    const chars = (cfg.charIds || []).map(function (id) { return (props.characters || []).find(function (c) { return c.id === id; }); }).filter(Boolean);
    const skillOf = {}; (skillData || []).forEach(function (s) { if (s && s.name) skillOf[s.name] = s.skill || ""; });
    const list = [];
    chars.forEach(function (c) { list.push({ key: c.id, name: c.name, char: c, isUser: false, isNpc: false, skill: skillOf[c.name] || "", alive: true }); });
    if (cfg.mode !== "spectate") { const pf = props.profile || {}; list.push({ key: "user", name: pf.name || "你", char: { name: pf.name || "你", avatarImage: pf.avatarImage, color: pf.color || t.tint }, isUser: true, isNpc: false, skill: "", alive: true }); }
    const npcNeed = cfg.npcCount || 0;
    const npcs = (npcData || []).slice(0, npcNeed);
    for (let i = 0; i < npcNeed; i++) { const n = npcs[i] || {}; list.push({ key: "npc_" + i, name: n.name || ("玩家" + (i + 1)), char: null, isUser: false, isNpc: true, skill: n.skill || "普通", persona: n.persona || "", alive: true }); }
    return list;
  }
  // 组装喂给开局的「真实玩家人设」串（含可选近况注入）
  function realPlayerLines(cfg, props) {
    const chars = (cfg.charIds || []).map(function (id) { return (props.characters || []).find(function (c) { return c.id === id; }); }).filter(Boolean);
    const inject = cfg.injectChat && props.recentChatFor;
    return chars.map(function (c) {
      let persona = c.persona || "";
      if (inject) { const rc = props.recentChatFor(c.id); if (rc) persona += "\n（近况：" + rc.slice(-400) + "）"; }
      return { name: c.name, persona: persona };
    });
  }
  // 共享头像渲染器
  function avatarFor(t) {
    return function (p, size) {
      if (p && p.char) return h(Avatar, { character: p.char, size: size, radius: Math.round(size * 0.3) });
      return h("div", { style: { width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, background: p && p.isUser ? t.tint : t.line, color: "#fff", fontFamily: F_DISPLAY, fontSize: Math.round(size * 0.46), display: "flex", alignItems: "center", justifyContent: "center" } }, ((p && p.name) || "?").slice(0, 1));
    };
  }

  // ============================================================
  // 猜谜引擎（共享：海龟汤 / 25 问）—— 主持人握真相，玩家问是非题
  // ============================================================
  const GUESS_KINDS = {
    haigui: { zh: "海龟汤", en: "Lateral Puzzle", emoji: "🐢", hasSurface: true, limit: 0,
      verdicts: "是 / 不是 / 不重要 / 接近了" },
    q25: { zh: "25 问", en: "20 Questions", emoji: "❓", hasSurface: false, limit: 25,
      verdicts: "是 / 不是 / 不好说" }
  };
  const VERDICT_COLOR = { "是": "#3f6d5a", "不是": "#c0553f", "不重要": "#8a8172", "接近了": "#b8863f", "不好说": "#8a8172" };

  async function setupGuess(api, kind, realPlayers, npcCount) {
    const lines = realPlayers.map(function (p, i) { return (i + 1) + ". " + p.name + "：" + (p.persona || "（没写人设）"); }).join("\n");
    const skillHint = "3. 给【每个真实玩家】和【每个 NPC】各写一句 skill「牌桌能力小传」：按能力与性格分开原则，点出 TA 玩这种横向推理 / 发散提问游戏的【真实强弱】（由职业背景推，别被性格带偏）。";
    const npcHint = "2. 生成 " + npcCount + " 个 NPC：name 中文名 + persona 一句人设（含【职业】与性格，尽量多样、别一个味）。";
    let sys;
    if (kind === "haigui") {
      sys = AC + SKILL_RULE + "\n\n你是「海龟汤」（情境推理）的主持人。\n" +
        "1. 出一道好海龟汤：surface 汤面（公开给大家的诡异／反常情境，2~4 句，留足悬念但信息完整）、truth 汤底（完整真相，逻辑自洽、最好有反转、【绝不靠超自然或做梦】那种糊弄）。难度适中：能靠追问一步步逼出来，别一眼看穿也别无解。\n" +
        npcHint + "\n" + skillHint +
        "\n\n【真实玩家】\n" + (lines || "（只有 NPC）") +
        "\n\n【输出】只输出 JSON：{\"surface\":\"\",\"truth\":\"\",\"npcs\":[{\"name\":\"\",\"persona\":\"\",\"skill\":\"\"}],\"skills\":[{\"name\":\"真实玩家名\",\"skill\":\"\"}]}";
    } else {
      sys = AC + SKILL_RULE + "\n\n你是「25 个问题」的主持人。\n" +
        "1. 心里想一个具体的东西 secret（一个名词：具体物品 / 动物 / 人物 / 地点 / 概念，要大众化、能靠是否问题逐步逼近，别太冷门刁钻），category 给个大类提示（如「物品」「动物」「人物」「食物」）。\n" +
        npcHint + "\n" + skillHint +
        "\n\n【真实玩家】\n" + (lines || "（只有 NPC）") +
        "\n\n【输出】只输出 JSON：{\"secret\":\"\",\"category\":\"\",\"npcs\":[{\"name\":\"\",\"persona\":\"\",\"skill\":\"\"}],\"skills\":[{\"name\":\"真实玩家名\",\"skill\":\"\"}]}";
    }
    const raw = await callRetry(api, sys, [{ role: "user", content: "出题：给谜题、" + npcCount + " 个 NPC、每个人的能力小传。" }], { maxTokens: 4000 });
    return extractJSON(raw) || {};
  }

  // 一轮：先答用户的问题（若有），再让 AI 各问一个新问题并作答，判断是否有人破题
  async function runGuessRound(api, kind, ctx, userQ, aiSpeakers, history, mode) {
    const K = GUESS_KINDS[kind];
    const secretBlock = kind === "haigui"
      ? "【汤面·已公开】" + ctx.surface + "\n【汤底·只有你知道】" + ctx.truth
      : "【你想的东西·只有你知道】" + ctx.secret + "（类别：" + ctx.category + "）";
    const verdictRule = kind === "haigui"
      ? "verdict 只能是：是 / 不是 / 不重要 / 接近了。含义：是=符合汤底；不是=不符；不重要=与真相无关；接近了=方向正确且触到关键点。"
      : "verdict 只能是：是 / 不是 / 不好说。照实回答；实在无法用是否作答才用「不好说」。";
    const easy = mode === "easy" ? "\n【放水局】AI 玩家别问得太神，留点空间给真人；主持人答题该给的提示大方点给。" : "";
    const hist = history.length ? history.slice(-14).map(function (q) { return "· " + q; }).join("\n") : "（还没人问过）";
    const who = aiSpeakers.map(function (s) { return "■ " + s.name + "（真实水平：" + (s.skill || "普通") + "）"; }).join("\n");
    const solveRule = kind === "haigui"
      ? "若某人的提问 / 陈述已经【实质还原了汤底核心真相】，把 solvedBy 填成 TA 的名字，并在 reveal 里一句话点出真相。否则 solvedBy 留空。"
      : "若某个 AI 的问题其实就是【直接猜中了那个东西】（问「它是不是XX」且 XX 正是答案），把 solvedBy 填成 TA 的名字、reveal 填那个东西。否则留空。AI 觉得有把握时可以直接猜（问「是不是XX」）。";
    const sys = AC + SKILL_RULE + "\n\n你是「" + K.zh + "」的主持人，掌握真相、只按规则回答是非类问题。\n" + secretBlock +
      "\n\n" + verdictRule + " note 是≤14 字的补充或引导，可空。" + easy +
      "\n\n【此前问过的（别让 AI 重复）】\n" + hist +
      (userQ ? "\n\n【真人玩家刚问】" + userQ + " —— 在 userAnswer 里作答。" : "\n\n（这一轮真人没问，userAnswer 给 null）") +
      "\n\n【接着这些 AI 玩家各问一个「新的、不重复、有推理价值」的问题，并由你逐一作答】按真实水平：强的追问高效精准、直逼要害；弱的更发散或问偏。\n" + who +
      "\n\n" + solveRule +
      "\n\n【输出】只输出 JSON：{\"userAnswer\":{\"verdict\":\"\",\"note\":\"\"}或null,\"ai\":[{\"name\":\"\",\"question\":\"\",\"verdict\":\"\",\"note\":\"\"}],\"solvedBy\":\"\",\"reveal\":\"\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "处理这一轮。" }], { maxTokens: 3200 });
    return extractJSON(raw) || {};
  }

  // 判定真人的正式猜测
  async function judgeGuess(api, kind, ctx, guess) {
    const K = GUESS_KINDS[kind];
    const block = kind === "haigui" ? "汤面：" + ctx.surface + "\n汤底（真相）：" + ctx.truth : "答案是：" + ctx.secret;
    const crit = kind === "haigui" ? "玩家的复原是否抓住了汤底的【核心因果 / 关键反转】？细节不必全中，逻辑对上即可判对。" : "玩家猜的是否就是这个东西？（近义 / 同物不同名也算对。）";
    const sys = AC + "你是「" + K.zh + "」主持人。\n" + block + "\n\n玩家正式猜测：「" + guess + "」\n" + crit + "\n只输出 JSON：{\"correct\":true/false,\"note\":\"一句点评（对就点破真相，不对就说差在哪、给个方向）\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "判一下。" }], { maxTokens: 800 });
    return extractJSON(raw) || { correct: false, note: "" };
  }

  function GuessGame(props) {
    const t = props.t, cfg = props.config, api = props.active, kind = props.kind;
    const K = GUESS_KINDS[kind];
    const [phase, setPhase] = useState("loading"); // loading|play|result|error
    const [players, setPlayers] = useState([]);
    const [ctx, setCtx] = useState(null);          // {surface,truth} | {secret,category}
    const [log, setLog] = useState([]);
    const [history, setHistory] = useState([]);    // 问过的问题（防重复）
    const [qCount, setQCount] = useState(0);        // 已问总数（25问用）
    const [userQ, setUserQ] = useState("");
    const [guessing, setGuessing] = useState(false); // 猜答案输入框开着
    const [guessText, setGuessText] = useState("");
    const [busy, setBusy] = useState(false);
    const [won, setWon] = useState(false);
    const [reveal, setReveal] = useState("");
    const [errMsg, setErrMsg] = useState("");
    const [detail, setDetail] = useState(null);
    const [showSurface, setShowSurface] = useState(false);
    const logRef = useRef(null);
    const started = useRef(false);
    const pAvatar = avatarFor(t);
    const me = players.find(function (p) { return p.isUser; });
    const aiPlayers = players.filter(function (p) { return !p.isUser; });
    const pByName = function (nm) { return players.find(function (p) { return p.name === nm || (nm && nm.indexOf(p.name) >= 0); }); };
    const pushLog = function (items) { setLog(function (L) { return L.concat(items); }); };
    useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, phase, busy, guessing]);

    useEffect(function () {
      if (started.current) return; started.current = true;
      (async function () {
        try {
          if (!api) { setErrMsg("请先到设置配置 API"); setPhase("error"); return; }
          const rp = realPlayerLines(cfg, props);
          const data = await setupGuess(api, kind, rp, cfg.npcCount || 0);
          const list = buildRoster(cfg, props, t, data.npcs, data.skills);
          if (kind === "haigui") {
            if (!data.surface || !data.truth) throw new Error("出题失败，重试");
            setCtx({ surface: data.surface, truth: data.truth });
          } else {
            if (!data.secret) throw new Error("出题失败，重试");
            setCtx({ secret: data.secret, category: data.category || "东西" });
          }
          setPlayers(list);
          setPhase("play");
        } catch (e) { setErrMsg((e && e.message) || "开局失败，重试"); setPhase("error"); }
      })();
    }, []);

    const limitLeft = K.limit ? (K.limit - qCount) : null;

    // 跑一轮（可带用户的问题）
    const runRound = async function (uq) {
      if (busy) return;
      setBusy(true);
      const speakers = shuffle(aiPlayers).map(function (p) { return { name: p.name, skill: p.skill }; });
      if (uq) pushLog([{ type: "q", name: me.name, text: uq, mine: true }]);
      try {
        const r = await runGuessRound(api, kind, ctx, uq || "", speakers, history, cfg.mode);
        const items = [];
        const newHist = [];
        if (uq) { newHist.push(uq); if (r.userAnswer) items.push({ type: "a", verdict: r.userAnswer.verdict, note: r.userAnswer.note }); }
        (r.ai || []).forEach(function (a) {
          if (!a || !a.question) return;
          items.push({ type: "q", name: a.name, text: a.question });   // 先显 TA 问了什么
          items.push({ type: "a", verdict: a.verdict, note: a.note }); // 再显主持人的判定
          newHist.push(a.question);
        });
        pushLog(items);
        setHistory(function (H) { return H.concat(newHist); });
        setQCount(function (n) { return n + newHist.length; });
        // 破题判定
        if (r.solvedBy) {
          const solver = pByName(r.solvedBy);
          setWon(!!(solver && solver.isUser));
          setReveal(r.reveal || (kind === "haigui" ? ctx.truth : ctx.secret));
          pushLog([{ type: "solve", name: r.solvedBy, isUser: !!(solver && solver.isUser) }]);
          setPhase("result"); setBusy(false); return;
        }
        // 25 问用尽
        if (K.limit && (qCount + newHist.length) >= K.limit) {
          setWon(false); setReveal(ctx.secret);
          pushLog([{ type: "info", text: "25 个问题用完了，没人猜中——答案揭晓。" }]);
          setPhase("result");
        }
      } catch (e) { props.toast && props.toast("这一轮出错：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };

    const submitUserQ = function () { const v = userQ.trim(); if (!v || busy) return; setUserQ(""); runRound(v); };
    const submitGuess = async function () {
      const v = guessText.trim(); if (!v || busy) return;
      setBusy(true); setGuessing(false); setGuessText("");
      pushLog([{ type: "q", name: me.name, text: "🎯 我猜：" + v, mine: true }]);
      try {
        const j = await judgeGuess(api, kind, ctx, v);
        if (j.correct) { setWon(true); setReveal(kind === "haigui" ? ctx.truth : ctx.secret); pushLog([{ type: "solve", name: me.name, isUser: true, note: j.note }]); setPhase("result"); }
        else { pushLog([{ type: "a", name: "__miss", verdict: "还没中", note: j.note || "" }]); }
      } catch (e) { props.toast && props.toast("判题出错：" + ((e && e.message) || "重试")); }
      finally { setBusy(false); }
    };
    const giveUp = function () { setWon(false); setReveal(kind === "haigui" ? (ctx && ctx.truth) : (ctx && ctx.secret)); setPhase("result"); };

    const header = h(Head, { zh: K.zh, en: K.en, onBack: props.onBack });

    if (phase === "error") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 30 } },
        h("div", { style: { fontSize: 40 } }, K.emoji),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.sub, textAlign: "center", lineHeight: 1.6 } }, errMsg),
        h("button", { onClick: props.onBack, style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "10px 24px" } }, "返回")));

    if (phase === "loading") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 } },
        h("div", { style: { fontSize: 40 } }, K.emoji),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, kind === "haigui" ? "熬汤中·想一道好谜题…" : "想一个东西中…")));

    const roster = h("div", { className: "shrink-0", style: { display: "flex", gap: 10, overflowX: "auto", padding: "10px 16px", borderBottom: "1px solid " + t.line } },
      players.map(function (p) {
        return h("button", { key: p.key, onClick: function () { setDetail(p); }, className: "active:opacity-70", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, width: 46 } },
          pAvatar(p, 38),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.sub, maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" } }, p.name + (p.isUser ? "(你)" : "")));
      }));

    // 谜面卡（海龟汤常驻；25问显类别 + 计数）
    const puzzleCard = kind === "haigui"
      ? h("div", { style: { background: t.tint + "12", border: "1px solid " + t.tint, borderRadius: 13, padding: "12px 14px", margin: "10px 16px 2px" } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint, letterSpacing: 1, marginBottom: 5 } }, "🐢 汤面"),
          h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 14.5, color: t.ink, lineHeight: 1.75, whiteSpace: "pre-line" } }, ctx ? ctx.surface : ""))
      : h("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "10px 16px 2px" } },
          h("div", { style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, "类别提示：", h("b", { style: { color: t.ink } }, ctx ? ctx.category : "")),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 13, color: (limitLeft != null && limitLeft <= 5) ? "#c0553f" : t.tint } }, "剩 " + (limitLeft == null ? "∞" : limitLeft) + " 问"));

    const logView = h("div", { ref: logRef, className: "flex-1 overflow-y-auto", style: { padding: "10px 16px 16px" } },
      log.map(function (it, i) {
        if (it.type === "info") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.6, margin: "8px 0", textAlign: "center" } }, it.text);
        if (it.type === "solve") return h("div", { key: i, style: { textAlign: "center", margin: "10px 0", fontFamily: F_BODY, fontSize: 14, color: "#3f6d5a" } }, "🎉 " + it.name + (it.isUser ? "(你)" : "") + " 破了题！" + (it.note ? "\n" + it.note : ""));
        if (it.type === "q") {
          const p = pByName(it.name);
          return h("div", { key: i, style: { display: "flex", gap: 8, margin: "8px 0 2px" } }, pAvatar(p, 28),
            h("div", { style: { flex: 1 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 2 } }, it.name + (it.mine ? "(你)" : "")),
              it.text ? h("div", { style: { display: "inline-block", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.5, color: t.ink, background: it.mine ? (t.tint + "1c") : t.bg2, borderRadius: 10, padding: "7px 11px" } }, it.text) : null,
              it.question ? h("div", { style: { display: "inline-block", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.5, color: t.ink, background: t.bg2, borderRadius: 10, padding: "7px 11px" } }, it.question) : null));
        }
        if (it.type === "a") {
          const c = VERDICT_COLOR[it.verdict] || t.tint;
          return h("div", { key: i, style: { display: "flex", alignItems: "center", gap: 6, margin: "0 0 6px 36px", fontFamily: F_BODY, fontSize: 12.5 } },
            h("span", { style: { color: t.fog } }, "主持人"),
            h("span", { style: { color: "#fff", background: c, borderRadius: 999, padding: "1px 9px", fontWeight: 700, fontSize: 12 } }, it.verdict || "…"),
            it.note ? h("span", { style: { color: t.sub } }, it.note) : null);
        }
        return null;
      }));

    // 底部动作
    let action;
    if (phase === "result") {
      action = h("div", null,
        h("div", { style: { textAlign: "center", fontFamily: F_DISPLAY, fontSize: 19, color: won ? "#3f6d5a" : t.sub, marginBottom: 6 } }, won ? "🎉 你破题了" : (log.some(function (x) { return x.type === "solve"; }) ? "这局被别人抢先破了" : "揭晓答案")),
        h("div", { style: { background: t.bg2, borderRadius: 12, padding: "12px 14px", marginBottom: 12 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint, letterSpacing: 1, marginBottom: 4 } }, kind === "haigui" ? "汤底" : "答案"),
          h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 14.5, color: t.ink, lineHeight: 1.75, whiteSpace: "pre-line" } }, reveal || "")),
        h("div", { style: { display: "flex", gap: 10 } },
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "12px" } }, "返回"),
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 12, padding: "12px" } }, "回中枢再来一局")));
    } else if (busy) {
      action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…大家在琢磨");
    } else if (guessing) {
      action = h("div", null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, textAlign: "center", marginBottom: 8 } }, kind === "haigui" ? "说出你还原的汤底真相" : "你觉得那个东西是？"),
        h("div", { style: { display: "flex", gap: 8 } },
          h("input", { value: guessText, autoFocus: true, onChange: function (e) { setGuessText(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submitGuess(); }, placeholder: kind === "haigui" ? "把你推理出的真相讲一遍…" : "直接写那个东西", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "11px 14px", borderRadius: 12, border: "1px solid " + t.tint, background: t.bg2, color: t.ink, outline: "none" } }),
          h("button", { onClick: submitGuess, style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.tint, borderRadius: 12, padding: "0 16px" } }, "定"),
          h("button", { onClick: function () { setGuessing(false); setGuessText(""); }, style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "0 6px" } }, "×")));
    } else if (me && cfg.mode !== "spectate") {
      action = h("div", null,
        h("div", { style: { display: "flex", gap: 8, marginBottom: 8 } },
          h("input", { value: userQ, onChange: function (e) { setUserQ(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submitUserQ(); }, placeholder: "问一个是 / 否问题…", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "11px 14px", borderRadius: 12, border: "1px solid " + t.line, background: t.bg2, color: t.ink, outline: "none" } }),
          h("button", { onClick: submitUserQ, style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 12, padding: "0 16px" } }, "问")),
        h("div", { style: { display: "flex", gap: 8, justifyContent: "center" } },
          h("button", { onClick: function () { runRound(""); }, style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 14px" } }, "让他们问一轮"),
          h("button", { onClick: function () { setGuessing(true); }, style: { fontFamily: F_BODY, fontSize: 12.5, fontWeight: 700, color: "#fff", background: t.tint, borderRadius: 999, padding: "6px 16px" } }, "🎯 我要猜答案"),
          h("button", { onClick: giveUp, style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: "6px 8px" } }, "看答案")));
    } else {
      // 观战
      action = h("div", { style: { display: "flex", gap: 8, justifyContent: "center" } },
        h("button", { onClick: function () { runRound(""); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 12, padding: "12px" } }, "看他们问下一轮"),
        h("button", { onClick: giveUp, style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: "6px 10px" } }, "看答案"));
    }

    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } }, header, roster,
      phase === "play" || phase === "result" ? puzzleCard : null, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)", maxHeight: "40vh", overflowY: "auto" } }, action),
      detail ? h(PlayerCard, { p: detail, t: t, avatar: pAvatar(detail, 44), onClose: function () { setDetail(null); } }) : null);
  }

  // ============================================================
  // 真心话大冒险 · 引擎（转瓶子 → 真心话 / 大冒险 → 全场反应）
  // ============================================================
  async function setupTD(api, realPlayers, npcCount) {
    const lines = realPlayers.map(function (p, i) { return (i + 1) + ". " + p.name + "：" + (p.persona || "（没写人设）"); }).join("\n");
    const sys = AC + "你是「真心话大冒险」的主持。生成 " + npcCount + " 个 NPC 玩家（name 中文名 + persona 一句含职业与性格的人设，多样别雷同）。\n" +
      "【已有真实玩家】\n" + (lines || "（只有 NPC）") + "\n\n只输出 JSON：{\"npcs\":[{\"name\":\"\",\"persona\":\"\"}]}";
    if (!npcCount) return { npcs: [] };
    const raw = await callRetry(api, sys, [{ role: "user", content: "生成 NPC。" }], { maxTokens: 1500 });
    return extractJSON(raw) || { npcs: [] };
  }
  // AI 被指到：一次拿全整段（选真话/大冒险 + 谁出题 + 题 + TA 的回应 + 全场反应）
  async function genTDForAI(api, target, others, mode, hot) {
    const who = others.map(function (p) { return p.name + "（" + (p.persona || (p.char && p.char.tagline) || "") + "）"; }).join("；");
    const spice = hot ? "尺度可以暧昧 / 大胆一点（但不露骨、不涉违法），朋友间那种起哄的度。" : "保持轻松好玩、朋友聚会的尺度。";
    const easy = mode === "easy" ? "整体轻松、别太为难人。" : "";
    const sys = AC + "你在主持一局「真心话大冒险」。当前瓶子指到了【" + target.name + "】：" + (target.persona || (target.char && target.char.tagline) || "（照 TA 人设来）") +
      "\n在场其他人：" + who +
      "\n\n请把这一次完整演出来：\n1. choice：" + target.name + "会选「真心话」还是「大冒险」（按 TA 性格，别每次都一样）。\n2. asker：从在场其他人里选一个来出题的人。\n3. prompt：asker 出的题（真心话=一个够劲的问题；大冒险=一个具体可执行的动作），一句话，符合 asker 口吻。" + spice + easy +
      "\n4. response：" + target.name + "怎么回应／完成（带 TA 的语气和小动作，2~4 句，真实有戏）。\n5. reactions：在场 1~3 个人的即时起哄 / 吐槽，每条 {name,text} 一句。\n\n只输出 JSON：{\"choice\":\"真心话\"或\"大冒险\",\"asker\":\"\",\"prompt\":\"\",\"response\":\"\",\"reactions\":[{\"name\":\"\",\"text\":\"\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "开演。" }], { maxTokens: 1600 });
    return extractJSON(raw) || {};
  }
  // 用户被指到并选了 真话/大冒险：生成出题人 + 题
  async function genTDPrompt(api, choice, others, hot, mode) {
    const who = others.map(function (p) { return p.name + "（" + (p.persona || (p.char && p.char.tagline) || "") + "）"; }).join("；");
    const spice = hot ? "尺度可暧昧 / 大胆些（不露骨、不违法）。" : "轻松好玩的尺度。";
    const sys = AC + "「真心话大冒险」里轮到真人玩家了，TA 选了【" + choice + "】。从在场这些人里选一个来给 TA 出题：" + who +
      "\n出一道" + (choice === "真心话" ? "够味的真心话问题" : "具体可执行的大冒险动作") + "，一句话，符合出题人口吻。" + spice + (mode === "easy" ? "别太为难。" : "") +
      "\n只输出 JSON：{\"asker\":\"\",\"prompt\":\"\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "出题。" }], { maxTokens: 700 });
    return extractJSON(raw) || {};
  }
  // 用户回应后的全场反应
  async function genTDReactions(api, choice, prompt, userResp, others) {
    const who = others.map(function (p) { return p.name + "（" + (p.persona || (p.char && p.char.tagline) || "") + "）"; }).join("；");
    const sys = AC + "「真心话大冒险」里真人玩家刚完成了 TA 的【" + choice + "】。\n题目：" + prompt + "\nTA 的回应：" + userResp +
      "\n在场其他人：" + who + "\n让其中 2~4 个人即时起哄 / 调侃 / 追问，每条一句，符合各自人设。\n只输出 JSON：{\"reactions\":[{\"name\":\"\",\"text\":\"\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "起哄。" }], { maxTokens: 1000 });
    return extractJSON(raw) || { reactions: [] };
  }

  function TruthDareGame(props) {
    const t = props.t, cfg = props.config, api = props.active;
    const [phase, setPhase] = useState("loading"); // loading|idle|spinning|userChoose|userAnswer|error
    const [players, setPlayers] = useState([]);
    const [log, setLog] = useState([]);
    const [busy, setBusy] = useState(false);
    const [errMsg, setErrMsg] = useState("");
    const [detail, setDetail] = useState(null);
    const [hot, setHot] = useState(false);          // 尺度开关
    const [target, setTarget] = useState(null);     // 当前被指到的人
    const [userPrompt, setUserPrompt] = useState(null); // {choice,asker,prompt}
    const [userResp, setUserResp] = useState("");
    const [spinName, setSpinName] = useState("");   // 转动动画显示的名字
    const logRef = useRef(null);
    const started = useRef(false);
    const pAvatar = avatarFor(t);
    const pByName = function (nm) { return players.find(function (p) { return p.name === nm || (nm && nm.indexOf(p.name) >= 0); }); };
    const pushLog = function (items) { setLog(function (L) { return L.concat(items); }); };
    useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, phase, busy]);

    useEffect(function () {
      if (started.current) return; started.current = true;
      (async function () {
        try {
          if (!api) { setErrMsg("请先到设置配置 API"); setPhase("error"); return; }
          const rp = realPlayerLines(cfg, props);
          const data = await setupTD(api, rp, cfg.npcCount || 0);
          const list = buildRoster(cfg, props, t, data.npcs, []);
          setPlayers(list);
          pushLog([{ type: "info", text: "🍾 " + list.length + " 个人围一圈坐下。点「转瓶子」开始——指到谁，谁就选真心话或大冒险。" }]);
          setPhase("idle");
        } catch (e) { setErrMsg((e && e.message) || "开局失败，重试"); setPhase("error"); }
      })();
    }, []);

    const doAITurn = async function (tgt) {
      setBusy(true);
      try {
        const others = players.filter(function (p) { return p.name !== tgt.name; });
        const r = await genTDForAI(api, tgt, others, cfg.mode, hot);
        pushLog([{ type: "td", name: tgt.name, choice: r.choice || "真心话", asker: r.asker, prompt: r.prompt || "", response: r.response || "" }]
          .concat((r.reactions || []).map(function (x) { return { type: "react", name: x.name, text: x.text }; })));
        setPhase("idle");
      } catch (e) { props.toast && props.toast("出错：" + ((e && e.message) || "重试")); setPhase("idle"); }
      finally { setBusy(false); }
    };

    // 转瓶子：随机指一人（观战时只在 AI 里指）
    const spin = function () {
      if (busy) return;
      const pool = cfg.mode === "spectate" ? players.filter(function (p) { return !p.isUser; }) : players;
      if (!pool.length) return;
      const tgt = pool[Math.floor(Math.random() * pool.length)];
      setPhase("spinning");
      // 简单转动动画：快速轮换名字
      let ticks = 0;
      const names = pool.map(function (p) { return p.name; });
      const iv = setInterval(function () {
        setSpinName(names[Math.floor(Math.random() * names.length)]);
        ticks++;
        if (ticks > 12) {
          clearInterval(iv);
          setSpinName("");
          setTarget(tgt);
          pushLog([{ type: "spin", name: tgt.name, isUser: tgt.isUser }]);
          if (tgt.isUser) setPhase("userChoose");
          else doAITurn(tgt);
        }
      }, 90);
    };

    const userChoose = async function (choice) {
      setBusy(true); setPhase("userAnswer");
      try {
        const others = players.filter(function (p) { return !p.isUser; });
        const r = await genTDPrompt(api, choice, others, hot, cfg.mode);
        setUserPrompt({ choice: choice, asker: r.asker || (others[0] && others[0].name) || "大家", prompt: r.prompt || (choice === "真心话" ? "说说你最近最上头的一件事。" : "学一个你最不擅长的动物叫。") });
      } catch (e) { props.toast && props.toast("出题出错：" + ((e && e.message) || "重试")); setUserPrompt({ choice: choice, asker: "大家", prompt: choice === "真心话" ? "说一件你没跟人讲过的小事。" : "原地转三圈再坐下。" }); }
      finally { setBusy(false); }
    };
    const submitUserResp = async function () {
      const v = userResp.trim(); if (!v || busy) return;
      setBusy(true);
      const up = userPrompt;
      pushLog([{ type: "td", name: (props.profile && props.profile.name) || "你", mine: true, choice: up.choice, asker: up.asker, prompt: up.prompt, response: v }]);
      setUserResp(""); setUserPrompt(null); setPhase("idle");
      try {
        const others = players.filter(function (p) { return !p.isUser; });
        const r = await genTDReactions(api, up.choice, up.prompt, v, others);
        if (r.reactions && r.reactions.length) pushLog(r.reactions.map(function (x) { return { type: "react", name: x.name, text: x.text }; }));
      } catch (e) { /* 反应可有可无 */ }
      finally { setBusy(false); }
    };

    const header = h(Head, { zh: "真心话大冒险", en: "Truth or Dare", onBack: props.onBack });

    if (phase === "error") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 30 } },
        h("div", { style: { fontSize: 40 } }, "🎲"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.sub, textAlign: "center", lineHeight: 1.6 } }, errMsg),
        h("button", { onClick: props.onBack, style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "10px 24px" } }, "返回")));

    if (phase === "loading") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 } },
        h("div", { style: { fontSize: 40 } }, "🍾"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, "大家围一圈坐好…")));

    const roster = h("div", { className: "shrink-0", style: { display: "flex", gap: 10, overflowX: "auto", padding: "10px 16px", borderBottom: "1px solid " + t.line } },
      players.map(function (p) {
        const isTgt = target && phase !== "idle" && p.name === target.name;
        return h("button", { key: p.key, onClick: function () { setDetail(p); }, className: "active:opacity-70", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, width: 46 } },
          h("div", { style: { borderRadius: 13, padding: 2, border: "2px solid " + (isTgt ? t.tint : "transparent") } }, pAvatar(p, 34)),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.sub, maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" } }, p.name + (p.isUser ? "(你)" : "")));
      }));

    const choiceColor = function (c) { return c === "大冒险" ? "#c0553f" : "#3f6d5a"; };
    const logView = h("div", { ref: logRef, className: "flex-1 overflow-y-auto", style: { padding: "12px 16px 16px" } },
      log.map(function (it, i) {
        if (it.type === "info") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7, margin: "6px 0", textAlign: "center" } }, it.text);
        if (it.type === "spin") return h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.tint, margin: "12px 0 4px" } }, "🍾 瓶子指向了 " + it.name + (it.isUser ? "(你)" : ""));
        if (it.type === "react") { const p = pByName(it.name); return h("div", { key: i, style: { display: "flex", gap: 7, margin: "4px 0 4px 14px", alignItems: "flex-start" } }, pAvatar(p, 22), h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, lineHeight: 1.5 } }, h("b", { style: { color: t.fog, fontWeight: 400 } }, it.name + "："), it.text)); }
        if (it.type === "td") {
          const p = pByName(it.name);
          return h("div", { key: i, style: { background: it.mine ? (t.tint + "10") : t.bg2, border: "1px solid " + (it.mine ? t.tint + "44" : t.line), borderRadius: 13, padding: "11px 13px", margin: "8px 0" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 7 } }, pAvatar(p, 26),
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, it.name + (it.mine ? "(你)" : "")),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, fontWeight: 700, color: "#fff", background: choiceColor(it.choice), borderRadius: 999, padding: "2px 10px" } }, it.choice)),
            h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, lineHeight: 1.55, marginBottom: 6 } }, (it.asker ? it.asker + "：" : "题目："), it.prompt),
            h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 14, color: t.ink, lineHeight: 1.75, whiteSpace: "pre-line" } }, it.response));
        }
        return null;
      }));

    let action;
    if (phase === "spinning") action = h("div", { style: { textAlign: "center", padding: "12px 0" } },
      h("div", { style: { fontSize: 30 } }, "🍾"),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.tint, marginTop: 6, minHeight: 26 } }, spinName || "…"));
    else if (busy && phase !== "userAnswer") action = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "12px 0" } }, "…在起哄");
    else if (phase === "userChoose") action = h("div", null,
      h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, textAlign: "center", marginBottom: 10 } }, "轮到你了！选一个："),
      h("div", { style: { display: "flex", gap: 12 } },
        h("button", { onClick: function () { userChoose("真心话"); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: "#3f6d5a", borderRadius: 13, padding: "13px" } }, "真心话"),
        h("button", { onClick: function () { userChoose("大冒险"); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: "#c0553f", borderRadius: 13, padding: "13px" } }, "大冒险")));
    else if (phase === "userAnswer") action = busy && !userPrompt
      ? h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "12px 0" } }, "…在给你出题")
      : h("div", null,
          h("div", { style: { background: t.bg2, borderRadius: 12, padding: "10px 13px", marginBottom: 8 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.tint, marginBottom: 3 } }, (userPrompt && userPrompt.asker ? userPrompt.asker + " 出的 " : "") + (userPrompt && userPrompt.choice)),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, lineHeight: 1.6 } }, userPrompt && userPrompt.prompt)),
          h("div", { style: { display: "flex", gap: 8 } },
            h("input", { value: userResp, autoFocus: true, onChange: function (e) { setUserResp(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") submitUserResp(); }, placeholder: userPrompt && userPrompt.choice === "真心话" ? "老实交代…" : "描述你怎么完成…", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "11px 14px", borderRadius: 12, border: "1px solid " + t.line, background: t.bg2, color: t.ink, outline: "none" } }),
            h("button", { onClick: submitUserResp, style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 12, padding: "0 18px" } }, "交")));
    else action = h("div", null,
      h(ToggleRow, { t: t, label: "尺度放开点", sub: "真心话 / 大冒险 会更暧昧大胆（仍不露骨、不涉违法）。", on: hot, onToggle: function () { setHot(!hot); } }),
      h("button", { onClick: spin, className: "w-full active:opacity-80", style: { marginTop: 6, fontFamily: F_BODY, fontSize: 16, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "14px" } }, "🍾 转瓶子"));

    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } }, header, roster, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)", maxHeight: "44vh", overflowY: "auto" } }, action),
      detail ? h(PlayerCard, { p: detail, t: t, avatar: pAvatar(detail, 44), onClose: function () { setDetail(null); } }) : null);
  }

  // ============================================================
  // 阿瓦隆 · 引擎（任务制：组队→投票→出任务，3成功好人赢/3失败坏人赢/刺客终局刺梅林）
  // ============================================================
  const AV_QUEST = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
  const AV_EVIL = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
  const AV_ROLE_ZH = { merlin: "梅林", percival: "派西维尔", loyal: "亚瑟的忠臣", assassin: "刺客", morgana: "莫甘娜", mordred: "莫德雷德", oberon: "奥伯伦", minion: "爪牙" };
  const AV_EVIL_ROLES = ["assassin", "morgana", "mordred", "oberon", "minion"];
  function avSide(r) { return AV_EVIL_ROLES.indexOf(r) >= 0 ? "evil" : "good"; }
  function avFailsReq(total, qi) { return (total >= 7 && qi === 3) ? 2 : 1; }
  function avalonBoard(total, opts) {
    opts = opts || {};
    const evilN = AV_EVIL[total] || 2;
    const evil = ["assassin"];
    if (opts.mordred && evil.length < evilN) evil.push("mordred");
    if (opts.percival && evil.length < evilN) evil.push("morgana");
    if (opts.oberon && evil.length < evilN) evil.push("oberon");
    while (evil.length < evilN) evil.push("minion");
    const goodN = total - evilN;
    const good = ["merlin"];
    if (opts.percival && good.length < goodN) good.push("percival");
    while (good.length < goodN) good.push("loyal");
    return shuffle(good.concat(evil));
  }
  // 给「主持人视角」的一句身份+已知信息（用于喂 AI 让每人按自己掌握的信息行动）
  function avSecretFor(p, players) {
    const others = players.filter(function (x) { return x !== p; });
    if (p.role === "merlin") return "梅林——看得见坏人：" + (others.filter(function (x) { return x.side === "evil" && x.role !== "mordred"; }).map(function (x) { return x.name; }).join("、") || "（无）") + "（但不知谁是刺客，必须藏好自己别暴露）";
    if (p.role === "percival") { const s = others.filter(function (x) { return x.role === "merlin" || x.role === "morgana"; }).map(function (x) { return x.name; }); return "派西维尔——看到 " + (s.join("、") || "—") + (s.length >= 2 ? " 里一个是梅林、一个是莫甘娜（伪装梅林）但分不清，要护住真梅林" : " 是梅林"); }
    if (p.side === "evil" && p.role !== "oberon") { const m = others.filter(function (x) { return x.side === "evil" && x.role !== "oberon"; }).map(function (x) { return x.name; }); return AV_ROLE_ZH[p.role] + "（坏人）——同伙：" + (m.join("、") || "只有自己") + "；任务里可出『失败』"; }
    if (p.role === "oberon") return "奥伯伦（坏人，但和其他坏人互不相识、也不认识彼此）；任务里可出『失败』";
    return "亚瑟的忠臣（好人）——不知任何人身份，靠推理找坏人";
  }
  // 给「玩家自己」看的第二人称身份提示
  function avRevealFor(me, players) {
    const others = players.filter(function (x) { return x !== me; });
    if (me.role === "merlin") return "你是【梅林】。你能看见的坏人：" + (others.filter(function (x) { return x.side === "evil" && x.role !== "mordred"; }).map(function (x) { return x.name; }).join("、") || "（本局没有你能看见的坏人）") + "。但你不知道谁是刺客——别暴露自己，否则终局会被一击刺杀。";
    if (me.role === "percival") { const s = shuffle(others.filter(function (x) { return x.role === "merlin" || x.role === "morgana"; }).map(function (x) { return x.name; })); return "你是【派西维尔】。" + (s.length >= 2 ? s.join(" 和 ") + " 之中一个是梅林、一个是莫甘娜（伪装成梅林），但你分不清谁是谁——保护真梅林。" : "你看到梅林是 " + (s.join("、") || "—") + "。"); }
    if (me.side === "evil" && me.role !== "oberon") { const m = others.filter(function (x) { return x.side === "evil" && x.role !== "oberon"; }).map(function (x) { return x.name; }); return "你是【" + AV_ROLE_ZH[me.role] + "】（坏人）。你的同伙（奥伯伦除外，互不相识）：" + (m.join("、") || "只有你一个") + "。任务里你可以出『失败』，别暴露。" + (me.role === "assassin" ? "终局你有一次刺杀：3 个任务失守后，指认梅林，猜中坏人翻盘赢。" : ""); }
    if (me.role === "oberon") return "你是【奥伯伦】——虽属坏人阵营，但你不认识其他坏人，其他坏人也不认识你。任务里可出『失败』。";
    return "你是【亚瑟的忠臣】（好人）。你不知道任何人的身份，只能靠组队与投票的蛛丝马迹推理，把 3 个任务做成功。";
  }

  async function setupAvalon(api, realPlayers, npcCount) {
    const lines = realPlayers.map(function (p, i) { return (i + 1) + ". " + p.name + "：" + (p.persona || "（没写人设）"); }).join("\n");
    const sys = AC + SKILL_RULE + "\n\n你是「阿瓦隆」的 NPC 生成器 + 能力评估器。\n" +
      "1. 生成 " + npcCount + " 个 NPC：name 中文名 + persona 一句人设（含【职业】与性格，多样别雷同）。\n" +
      "2. 给【每个真实玩家】和每个 NPC 各写一句 skill「牌桌能力小传」：点出 TA 玩阿瓦隆时——从组队与投票里读心找坏人、伪装隐身份、带节奏说服人——的【真实强弱】（由职业背景推，别被性格带偏）。\n\n" +
      "【真实玩家】\n" + (lines || "（只有 NPC）") +
      "\n\n只输出 JSON：{\"npcs\":[{\"name\":\"\",\"persona\":\"\",\"skill\":\"\"}],\"skills\":[{\"name\":\"真实玩家名\",\"skill\":\"\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "生成 " + npcCount + " 个 NPC + 每人能力小传。" }], { maxTokens: 4000 });
    return extractJSON(raw) || {};
  }
  async function genProposal(api, leader, players, needSize, qn, failsReq, hist, names) {
    const sys = AC + SKILL_RULE + "\n\n你在主持「阿瓦隆」，替队长做组队决定。队长【" + leader.name + "】：" + avSecretFor(leader, players) + "，真实水平：" + (leader.skill || "普通") +
      "\n第 " + (qn + 1) + " 个任务要选【" + needSize + "】人上场" + (failsReq === 2 ? "（此任务需 2 张失败票才失败）" : "") + "。按队长身份立场选人：好人凑一支可信、没坏人的队（通常带上自己）；坏人想把自己或同伙塞进去又不能太明显。给 team（正好 " + needSize + " 个在场的名字）+ 一句公开理由（别暴露隐藏身份）。" +
      "\n【在场】" + names.join("、") + "\n【局面】\n" + (hist || "（刚开局）") +
      "\n\n只输出 JSON：{\"team\":[\"\"],\"reason\":\"\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "组队。" }], { maxTokens: 1500 });
    return extractJSON(raw) || {};
  }
  async function genVotes(api, voters, team, leaderName, players, qn, hist) {
    const blocks = voters.map(function (v) { return "■ " + v.name + "：" + avSecretFor(v, players) + "；水平" + (v.skill || "普通"); }).join("\n");
    const sys = AC + SKILL_RULE + "\n\n阿瓦隆·对第 " + (qn + 1) + " 个任务的队伍投票。队长 " + leaderName + " 提议队伍：[" + team.join("、") + "]。\n下面每人按各自身份和掌握的信息投【赞成】或【反对】+ 一句公开理由（理由别暴露隐藏身份）：\n· 好人：队里可能混了坏人就反对，可信就赞成；注意连续 5 次否决坏人直接赢，别无脑否。\n· 坏人：想让有己方的队通过就赞成、想搅局就反对，但别投得太露馅。\n· 梅林该反对带坏人的队，但要装成普通推理别暴露。\n\n" + blocks + "\n【局面】\n" + (hist || "（刚开局）") +
      "\n\n只输出 JSON：{\"votes\":[{\"name\":\"\",\"vote\":\"赞成\"或\"反对\",\"reason\":\"\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "投票。" }], { maxTokens: 6500 });
    const p = extractJSON(raw); return (p && Array.isArray(p.votes)) ? p.votes : [];
  }
  async function genQuest(api, evilOnTeam, players, qn, failsReq, score) {
    const who = evilOnTeam.map(function (p) { return "■ " + p.name + "（" + AV_ROLE_ZH[p.role] + "）水平" + (p.skill || "普通"); }).join("\n");
    const sys = AC + SKILL_RULE + "\n\n阿瓦隆·第 " + (qn + 1) + " 个任务执行。目前 好人成功 " + score.good + " 次 / 任务失败 " + score.evil + " 次。" + (failsReq === 2 ? "这个任务需【2 张】失败票才会失败。" : "这个任务【1 张】失败票就失败。") +
      "\n以下坏人在队里，各自决定这次出【成功】还是【失败】（好人只能出成功）。出失败能推进坏人取胜、但会暴露队里有坏人；有时藏一手出成功更稳。按各人水平与局面权衡：\n" + who +
      "\n\n只输出 JSON：{\"plays\":[{\"name\":\"\",\"play\":\"成功\"或\"失败\"}]}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "出任务。" }], { maxTokens: 600 });
    const p = extractJSON(raw); return (p && Array.isArray(p.plays)) ? p.plays : [];
  }
  async function genAssassin(api, assassin, players, hist) {
    const goods = players.filter(function (p) { return p.side === "good"; }).map(function (p) { return p.name; });
    const sys = AC + SKILL_RULE + "\n\n阿瓦隆·好人已完成 3 个任务，进入终局刺杀。你替【刺客 " + assassin.name + "】判断：好人里谁最像梅林？猜中则坏人翻盘获胜。\n回顾全程——谁的组队 / 投票像是『早就知道坏人是谁』（梅林会不自觉地精准避开坏人）。候选：" + goods.join("、") + "\n【局面】\n" + (hist || "") +
      "\n\n只输出 JSON：{\"target\":\"你认定是梅林的人\",\"reason\":\"\"}";
    const raw = await callRetry(api, sys, [{ role: "user", content: "刺谁？" }], { maxTokens: 700 });
    return extractJSON(raw) || {};
  }

  function AvalonGame(props) {
    const t = props.t, cfg = props.config, api = props.active;
    const total = cfg.total;
    const [phase, setPhase] = useState("loading"); // loading|reveal|propose|vote|quest|assassin|result|error
    const [players, setPlayers] = useState([]);
    const [questNum, setQuestNum] = useState(0);     // 0-based
    const [leaderIdx, setLeaderIdx] = useState(0);
    const [voteTrack, setVoteTrack] = useState(0);   // 连续否决次数
    const [results, setResults] = useState([]);      // [{success,fails}]
    const [team, setTeam] = useState([]);            // 当前提议队伍（名字）
    const [teamSel, setTeamSel] = useState([]);      // 你组队时的多选
    const [userVote, setUserVote] = useState(null);  // 你的赞成/反对
    const [userPlay, setUserPlay] = useState(null);  // 你在任务里出的成功/失败
    const [pickerOpen, setPickerOpen] = useState(true);
    const [log, setLog] = useState([]);
    const [busy, setBusy] = useState(false);
    const [winner, setWinner] = useState(null);
    const [assassinPick, setAssassinPick] = useState(null); // 刺客锁定的人（终局揭示）
    const [errMsg, setErrMsg] = useState("");
    const [detail, setDetail] = useState(null);
    const logRef = useRef(null);
    const histRef = useRef([]);     // 喂 AI 的公开局面（同步）
    const started = useRef(false);
    const pAvatar = avatarFor(t);
    const me = players.find(function (p) { return p.isUser; });
    const leader = players[leaderIdx];
    const needSize = players.length ? (AV_QUEST[players.length] || AV_QUEST[5])[questNum] : 0;
    const failsReq = players.length ? avFailsReq(players.length, questNum) : 1;
    const score = { good: results.filter(function (r) { return r.success; }).length, evil: results.filter(function (r) { return !r.success; }).length };
    const pByName = function (nm) { return players.find(function (p) { return p.name === nm || (nm && String(nm).indexOf(p.name) >= 0); }); };
    const pushLog = function (items) { setLog(function (L) { return L.concat(items); }); };
    const pushHist = function (line) { histRef.current = histRef.current.concat([line]); };
    const histText = function () { return histRef.current.slice(-22).map(function (s) { return "· " + s; }).join("\n"); };
    useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, phase, busy]);
    useEffect(function () { setPickerOpen(true); }, [phase, questNum, leaderIdx]);

    // ---- 开局 ----
    useEffect(function () {
      if (started.current) return; started.current = true;
      (async function () {
        try {
          if (!api) { setErrMsg("请先到设置配置 API"); setPhase("error"); return; }
          const rp = realPlayerLines(cfg, props);
          const data = await setupAvalon(api, rp, cfg.npcCount || 0);
          const list = buildRoster(cfg, props, t, data.npcs, data.skills);
          const n = list.length;
          const roles = avalonBoard(n, cfg.av || {});
          const order = shuffle(list.map(function (_, i) { return i; }));
          order.forEach(function (pi, k) { list[pi].role = roles[k]; list[pi].side = avSide(roles[k]); });
          setPlayers(list);
          const li = Math.floor(Math.random() * n);
          setLeaderIdx(li);
          const board = roles.map(function (r) { return AV_ROLE_ZH[r]; });
          pushLog([{ type: "info", text: "本局 " + n + " 人。阵营配置：好人 " + roles.filter(function (r) { return avSide(r) === "good"; }).length + " · 坏人 " + roles.filter(function (r) { return avSide(r) === "evil"; }).length + "。身份：" + board.join("、") + "（谁是谁保密）。" }]);
          setPhase("reveal");
        } catch (e) { setErrMsg((e && e.message) || "开局失败，重试"); setPhase("error"); }
      })();
    }, []);

    // ---- 组队提议 ----
    const startQuest = function (qn, li, vt) {
      setPhase("propose"); setTeam([]); setTeamSel([]); setUserVote(null); setUserPlay(null);
      const ld = players[li];
      pushLog([{ type: "phase", text: "第 " + (qn + 1) + " 个任务 · 队长 " + ld.name + (ld.isUser ? "(你)" : "") + " 组队（需 " + (AV_QUEST[players.length] || AV_QUEST[5])[qn] + " 人" + (avFailsReq(players.length, qn) === 2 ? "，双失败任务" : "") + "）" }]);
      if (ld.isUser && cfg.mode !== "spectate") { /* 等你在弹框里选 */ }
      else aiPropose(qn, li);
    };
    const aiPropose = async function (qn, li) {
      setBusy(true);
      try {
        const ld = players[li];
        const need = (AV_QUEST[players.length] || AV_QUEST[5])[qn];
        const r = await genProposal(api, ld, players, need, qn, avFailsReq(players.length, qn), histText(), players.map(function (p) { return p.name; }));
        let tm = (r.team || []).map(function (nm) { const p = pByName(nm); return p ? p.name : null; }).filter(Boolean);
        tm = tm.filter(function (v, i) { return tm.indexOf(v) === i; }).slice(0, need);
        // 补足/去重后不够就随机补（含队长优先）
        if (tm.length < need) { const pool = shuffle(players.map(function (p) { return p.name; }).filter(function (nm) { return tm.indexOf(nm) < 0; })); while (tm.length < need && pool.length) tm.push(pool.shift()); }
        commitProposal(tm, ld, qn, li, r.reason || "");
      } catch (e) { props.toast && props.toast("组队出错：" + ((e && e.message) || "重试")); setBusy(false); }
    };
    const commitProposal = function (tm, ld, qn, li, reason) {
      setTeam(tm); setBusy(false);
      pushHist("任务" + (qn + 1) + " 队长" + ld.name + "组队[" + tm.join("、") + "]" + (reason ? "，称:" + reason : ""));
      pushLog([{ type: "propose", leader: ld.name, isUser: ld.isUser, team: tm, reason: reason }]);
      setPhase("vote"); setUserVote(null);
      // 观战 / 队长非你时也要收 AI 票；你在场则等你先投
      if (!(me && cfg.mode !== "spectate")) runVotes(tm, qn, li, null);
    };
    const submitUserTeam = function () {
      if (teamSel.length !== needSize) return;
      commitProposal(teamSel.slice(), leader, questNum, leaderIdx, "");
    };

    // ---- 投票 ----
    const runVotes = async function (tm, qn, li, uVote) {
      setBusy(true);
      try {
        const voters = players.filter(function (p) { return !(p.isUser && cfg.mode !== "spectate"); });
        const raw = await genVotes(api, voters, tm, players[li].name, players, qn, histText());
        const votes = voters.map(function (v) {
          const hit = raw.find(function (r) { return r.name && (r.name.indexOf(v.name) >= 0 || v.name.indexOf(r.name) >= 0); });
          const approve = hit ? !/反对|拒绝|否|reject|no/i.test(String(hit.vote)) && /赞成|同意|通过|approve|yes/i.test(String(hit.vote)) : (Math.random() < 0.5);
          return { name: v.name, approve: approve, reason: (hit && hit.reason) || "" };
        });
        if (me && cfg.mode !== "spectate" && uVote != null) votes.push({ name: me.name, approve: uVote === "approve", reason: "（你的一票）", mine: true });
        const yes = votes.filter(function (v) { return v.approve; }).length;
        const no = votes.length - yes;
        const approved = yes > no;
        pushHist("投票 赞成" + yes + ":反对" + no + " → " + (approved ? "通过" : "否决"));
        pushLog([{ type: "votes", votes: votes, yes: yes, no: no, approved: approved }]);
        if (approved) { setBusy(false); goQuest(tm, qn, li); }
        else {
          const vt2 = (voteTrackFor(qn, li)) + 1;
          if (vt2 >= 5) { setBusy(false); pushLog([{ type: "info", text: "连续 5 次组队被否决——坏人不战而胜。" }]); finish("evil"); return; }
          setVoteTrack(vt2);
          pushLog([{ type: "info", text: "队伍被否决（第 " + vt2 + "/5 次），换下一位队长重组。" }]);
          const nli = (li + 1) % players.length;
          setLeaderIdx(nli); setBusy(false);
          setTimeout(function () { startQuest(qn, nli, vt2); }, 30);
        }
      } catch (e) { props.toast && props.toast("投票出错：" + ((e && e.message) || "重试")); setBusy(false); }
    };
    // voteTrack 用 state，但连否时闭包可能过期——从 log 里推不方便，这里用一个 ref 兜底
    const vtRef = useRef(0);
    const voteTrackFor = function () { return vtRef.current; };
    useEffect(function () { vtRef.current = voteTrack; }, [voteTrack]);

    // ---- 任务执行 ----
    const goQuest = function (tm, qn, li) {
      setPhase("quest"); setUserPlay(null);
      const teamP = tm.map(pByName).filter(Boolean);
      const evilOnTeam = teamP.filter(function (p) { return p.side === "evil" && !(p.isUser && cfg.mode !== "spectate"); });
      const meOnTeam = me && cfg.mode !== "spectate" && tm.indexOf(me.name) >= 0;
      // 你在队里且是坏人 → 等你选；否则（你是好人或不在队）直接处理 AI
      if (meOnTeam && me.side === "evil") { /* 等你在弹框选成功/失败 */ }
      else resolveWithAI(tm, qn, li, evilOnTeam, meOnTeam && me.side === "good" ? 0 : 0);
    };
    const submitUserPlay = function (play) {
      setUserPlay(play);
      const tm = team;
      const teamP = tm.map(pByName).filter(Boolean);
      const evilOnTeam = teamP.filter(function (p) { return p.side === "evil" && !(p.isUser); });
      resolveWithAI(tm, questNum, leaderIdx, evilOnTeam, play === "失败" ? 1 : 0);
    };
    const resolveWithAI = async function (tm, qn, li, evilOnTeam, userFails) {
      setBusy(true);
      try {
        let fails = userFails || 0;
        if (evilOnTeam.length) {
          const plays = await genQuest(api, evilOnTeam, players, qn, avFailsReq(players.length, qn), { good: results.filter(function (r) { return r.success; }).length, evil: results.filter(function (r) { return !r.success; }).length });
          evilOnTeam.forEach(function (p) { const hit = plays.find(function (x) { return x.name && (x.name.indexOf(p.name) >= 0 || p.name.indexOf(x.name) >= 0); }); if (hit && /失败|fail/i.test(String(hit.play))) fails++; });
        }
        resolveQuest(tm, qn, li, fails);
      } catch (e) { props.toast && props.toast("任务出错：" + ((e && e.message) || "重试")); setBusy(false); }
    };
    const resolveQuest = function (tm, qn, li, fails) {
      const req = avFailsReq(players.length, qn);
      const success = fails < req;
      const newResults = results.concat([{ success: success, fails: fails }]);
      setResults(newResults); setBusy(false);
      pushHist("任务" + (qn + 1) + "结果：" + (success ? "成功" : "失败") + "（" + fails + "张失败票）");
      pushLog([{ type: "questresult", n: qn + 1, success: success, fails: fails }]);
      const good = newResults.filter(function (r) { return r.success; }).length;
      const evil = newResults.length - good;
      if (good >= 3) { setTimeout(function () { enterAssassin(); }, 40); return; }
      if (evil >= 3) { finish("evil"); return; }
      const nli = (li + 1) % players.length;
      setQuestNum(qn + 1); setLeaderIdx(nli); setVoteTrack(0); vtRef.current = 0;
      setTimeout(function () { startQuest(qn + 1, nli, 0); }, 40);
    };

    // ---- 终局刺杀 ----
    const enterAssassin = function () {
      setPhase("assassin");
      pushLog([{ type: "info", text: "好人完成了 3 个任务！但坏人还有最后一击——刺客要指认梅林。" }]);
      const assassin = players.find(function (p) { return p.role === "assassin"; });
      if (assassin && assassin.isUser && cfg.mode !== "spectate") { /* 等你选 */ }
      else aiAssassin(assassin);
    };
    const aiAssassin = async function (assassin) {
      if (!assassin) { finish("good"); return; }
      setBusy(true);
      try {
        const r = await genAssassin(api, assassin, players, histText());
        const tp = pByName(r.target);
        settleAssassin(assassin, tp, r.reason || "");
      } catch (e) { props.toast && props.toast("刺杀出错：" + ((e && e.message) || "重试")); setBusy(false); }
    };
    const settleAssassin = function (assassin, targetP, reason) {
      setBusy(false);
      setAssassinPick(targetP ? targetP.name : null);
      const hit = targetP && targetP.role === "merlin";
      pushLog([{ type: "assassin", by: assassin.name, target: targetP ? targetP.name : "（没锁定）", reason: reason, hit: hit }]);
      finish(hit ? "evil" : "good");
    };
    const finish = function (w) { setWinner(w); setPhase("result"); };

    // ---- 渲染 ----
    const header = h(Head, { zh: "阿瓦隆", en: "Avalon", onBack: props.onBack });
    if (phase === "error") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 30 } },
        h("div", { style: { fontSize: 40 } }, "⚔️"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.sub, textAlign: "center", lineHeight: 1.6 } }, errMsg),
        h("button", { onClick: props.onBack, style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "10px 24px" } }, "返回")));
    if (phase === "loading") return h("div", { className: "h-full flex flex-col" }, header,
      h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 } },
        h("div", { style: { fontSize: 40 } }, "⚔️"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, "发牌·分配阵营与身份…")));

    // 头像条：标出当前队长 + 被提议进队的人
    const roster = h("div", { className: "shrink-0", style: { display: "flex", gap: 10, overflowX: "auto", padding: "10px 16px", borderBottom: "1px solid " + t.line } },
      players.map(function (p) {
        const isLd = leader && p.name === leader.name && phase !== "result";
        const onTeam = (phase === "vote" || phase === "quest") && team.indexOf(p.name) >= 0;
        return h("button", { key: p.key, onClick: function () { setDetail(p); }, className: "active:opacity-70", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, width: 48 } },
          h("div", { style: { borderRadius: 13, padding: 2, border: "2px solid " + (onTeam ? t.tint : "transparent"), position: "relative" } }, pAvatar(p, 34),
            isLd ? h("div", { style: { position: "absolute", top: -6, right: -4, fontSize: 13 } }, "👑") : null),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.sub, maxWidth: 48, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" } }, p.name + (p.isUser ? "(你)" : "")));
      }));

    // 任务进度条：5 个圆
    const track = h("div", { className: "shrink-0", style: { display: "flex", gap: 8, justifyContent: "center", padding: "10px 16px 4px" } },
      [0, 1, 2, 3, 4].map(function (i) {
        const r = results[i];
        const cur = i === questNum && (phase === "propose" || phase === "vote" || phase === "quest");
        const dbl = players.length >= 7 && i === 3;
        const bg = r ? (r.success ? "#3f6d5a" : "#c0553f") : (cur ? t.tint : t.bg2);
        return h("div", { key: i, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 } },
          h("div", { style: { width: 30, height: 30, borderRadius: 999, background: bg, border: "1px solid " + (r || cur ? "transparent" : t.line), color: r || cur ? "#fff" : t.fog, fontFamily: F_DISPLAY, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" } }, r ? (r.success ? "✓" : "✗") : (players.length ? (AV_QUEST[players.length] || AV_QUEST[5])[i] : "")),
          dbl ? h("div", { style: { fontSize: 8, color: t.fog } }, "2失败") : h("div", { style: { fontSize: 8, color: "transparent" } }, "·"));
      }));

    const logView = h("div", { ref: logRef, className: "flex-1 overflow-y-auto", style: { padding: "8px 16px 16px" } },
      log.map(function (it, i) {
        if (it.type === "info") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.65, margin: "8px 0", textAlign: "center" } }, it.text);
        if (it.type === "phase") return h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12, color: t.tint, margin: "12px 0 4px", letterSpacing: .5 } }, "· " + it.text + " ·");
        if (it.type === "propose") return h("div", { key: i, style: { margin: "6px 0" } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "👑 " + it.leader + (it.isUser ? "(你)" : "") + " 提议：" + it.team.join("、")),
          it.reason ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginTop: 2, lineHeight: 1.5 } }, "“" + it.reason + "”") : null);
        if (it.type === "votes") return h("div", { key: i, style: { margin: "6px 0", background: t.bg2, borderRadius: 10, padding: "8px 11px" } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, fontWeight: 700, color: it.approved ? "#3f6d5a" : "#c0553f", marginBottom: 4 } }, (it.approved ? "✓ 通过" : "✗ 否决") + "（赞成 " + it.yes + " · 反对 " + it.no + "）"),
          it.votes.map(function (v, k) { return h("div", { key: k, style: { fontFamily: F_BODY, fontSize: 11.5, color: t.sub, lineHeight: 1.5 } }, (v.approve ? "✔ " : "✘ ") + v.name + (v.mine ? "(你)" : "") + (v.reason ? "：" + v.reason : "")); }));
        if (it.type === "questresult") return h("div", { key: i, style: { textAlign: "center", margin: "10px 0", fontFamily: F_DISPLAY, fontSize: 15, color: it.success ? "#3f6d5a" : "#c0553f" } }, "任务 " + it.n + (it.success ? " 成功 ✓" : " 失败 ✗") + "　（" + it.fails + " 张失败票）");
        if (it.type === "assassin") return h("div", { key: i, style: { textAlign: "center", margin: "10px 0", fontFamily: F_BODY, fontSize: 13.5, color: t.ink, lineHeight: 1.6 } }, "🗡 刺客 " + it.by + " 指认梅林 → " + it.target + (it.reason ? "\n“" + it.reason + "”" : ""));
        return null;
      }));

    // ---- 底部动作 ----
    let inline = null, pick = null;
    const roleBanner = me ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, textAlign: "center", marginBottom: 8, lineHeight: 1.6 } }, avRevealFor(me, players)) : null;
    const teamChip = function (p, on, onTap) { return h("button", { key: p.key, onClick: onTap, style: { display: "flex", alignItems: "center", gap: 5, fontFamily: F_BODY, fontSize: 12.5, color: on ? "#fff" : t.ink, background: on ? t.tint : t.bg2, border: "1px solid " + (on ? t.tint : t.line), borderRadius: 999, padding: "4px 11px 4px 4px" } }, pAvatar(p, 20), p.name + (p.isUser ? "(你)" : "")); };

    if (phase === "reveal") {
      inline = h("div", null,
        h("div", { style: { background: t.bg2, borderRadius: 12, padding: "11px 13px", marginBottom: 10, fontFamily: F_BODY, fontSize: 12, color: t.sub, lineHeight: 1.75 } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 13.5, color: t.ink, marginBottom: 5 } }, "怎么玩"),
          "共 5 个「任务」。好人要做成功 3 个，坏人要弄失败 3 个。每个任务两步：",
          h("br"), "① 当值『队长』提名几人组队（人数看下方圆圈）；",
          h("br"), "② 全场投票赞成/反对这支队——赞成过半才出发，否则换下一位队长重提（连否 5 次坏人直接赢）。",
          h("br"), "出发后队里每人暗投成功/失败：好人只能成功，坏人可偷偷投失败搞砸（1 张失败票任务就砸，标『2失败』的要 2 张）。没人知道谁投的，只公布几张失败票。",
          h("br"), "好人赢满 3 任务后，坏人里的刺客还有最后一击——指认谁是梅林，猜中就坏人翻盘。",
          h("br"), h("b", { style: { color: t.ink } }, "队长"), "开局随机第一个，之后按顺序轮流当。"),
        roleBanner,
        h("button", { onClick: function () { startQuest(0, leaderIdx, 0); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 13, padding: "13px" } }, cfg.mode === "spectate" ? "开始（观战）" : "记住身份 · 开始"));
    } else if (busy) {
      inline = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "…桌上正在博弈");
    } else if (phase === "propose") {
      if (leader && leader.isUser && cfg.mode !== "spectate") {
        pick = { title: "你是队长 · 选 " + needSize + " 人上场", sub: "第 " + (questNum + 1) + " 个任务" + (failsReq === 2 ? "（需 2 张失败票才失败）" : "") + "。点头像加入 / 移除。",
          body: h("div", null,
            h("div", { style: { display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", marginBottom: 12 } },
              players.map(function (p) { const on = teamSel.indexOf(p.name) >= 0; return teamChip(p, on, function () { setTeamSel(function (s) { return on ? s.filter(function (x) { return x !== p.name; }) : (s.length < needSize ? s.concat([p.name]) : s); }); }); })),
            h("button", { onClick: submitUserTeam, disabled: teamSel.length !== needSize, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: teamSel.length === needSize ? t.ink : t.line, borderRadius: 12, padding: "12px" } }, "提议这支队伍（" + teamSel.length + "/" + needSize + "）")) };
      } else inline = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "队长 " + (leader ? leader.name : "") + " 在组队…");
    } else if (phase === "vote") {
      if (me && cfg.mode !== "spectate") {
        pick = { title: "对这支队伍投票", sub: "队长 " + (leader ? leader.name : "") + " 提议：" + team.join("、"),
          body: h("div", { style: { display: "flex", gap: 12 } },
            h("button", { onClick: function () { setPickerOpen(false); runVotes(team, questNum, leaderIdx, "approve"); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: "#3f6d5a", borderRadius: 12, padding: "13px" } }, "✔ 赞成"),
            h("button", { onClick: function () { setPickerOpen(false); runVotes(team, questNum, leaderIdx, "reject"); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: "#c0553f", borderRadius: 12, padding: "13px" } }, "✘ 反对")) };
      } else inline = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "大家在投票…");
    } else if (phase === "quest") {
      const meOnTeam = me && cfg.mode !== "spectate" && team.indexOf(me.name) >= 0;
      if (meOnTeam && me.side === "evil") {
        pick = { title: "你在任务队里 · 你是坏人", sub: "第 " + (questNum + 1) + " 个任务。出『失败』推进坏人取胜，但会暴露队里有内鬼。",
          body: h("div", { style: { display: "flex", gap: 12 } },
            h("button", { onClick: function () { setPickerOpen(false); submitUserPlay("成功"); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: "#3f6d5a", borderRadius: 12, padding: "13px" } }, "让任务成功"),
            h("button", { onClick: function () { setPickerOpen(false); submitUserPlay("失败"); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: "#c0553f", borderRadius: 12, padding: "13px" } }, "破坏任务")) };
      } else inline = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, meOnTeam ? "你是好人，只能让任务成功——出任务中…" : "队伍在执行任务…");
    } else if (phase === "assassin") {
      const assassin = players.find(function (p) { return p.role === "assassin"; });
      if (assassin && assassin.isUser && cfg.mode !== "spectate") {
        const cands = players.filter(function (p) { return p.side === "good"; });
        pick = { title: "你是刺客 · 指认梅林", sub: "好人赢了 3 个任务，但你猜中梅林就能翻盘。回想谁的组队 / 投票像早就知道坏人。",
          body: h("div", { style: { display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" } },
            cands.map(function (p) { return teamChip(p, false, function () { setPickerOpen(false); settleAssassin(assassin, p, "（你的直觉）"); }); })) };
      } else inline = h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "10px 0" } }, "刺客在锁定梅林…");
    } else if (phase === "result") {
      const goodWin = winner === "good";
      inline = h("div", null,
        h("div", { style: { textAlign: "center", fontFamily: F_DISPLAY, fontSize: 20, color: goodWin ? "#3f6d5a" : "#c0553f", marginBottom: 8 } }, goodWin ? "⚔️ 亚瑟的忠臣获胜" : "🗡 莫德雷德的爪牙获胜"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7, marginBottom: 12 } }, "身份揭晓：" + players.map(function (p) { return p.name + (p.isUser ? "(你)" : "") + "=" + AV_ROLE_ZH[p.role] + (p.side === "evil" ? "🗡" : ""); }).join("　") + (assassinPick ? "　｜ 刺客指认了 " + assassinPick : "")),
        h("div", { style: { display: "flex", gap: 10 } },
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "12px" } }, "返回"),
          h("button", { onClick: props.onBack, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#f3efe6", background: t.ink, borderRadius: 12, padding: "12px" } }, "回中枢再来一局")));
    }

    const bottom = pick
      ? (pickerOpen
        ? h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "8px 0" } }, "在弹框里操作 · 也可先关掉回看局面")
        : h("button", { onClick: function () { setPickerOpen(true); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#f3efe6", background: t.tint, borderRadius: 13, padding: "12px" } }, "▸ 轮到你了 · 点这里操作"))
      : inline;

    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } }, header, roster,
      phase !== "reveal" && phase !== "result" ? track : null, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)", maxHeight: "50vh", overflowY: "auto" } }, bottom),
      (pick && pickerOpen) ? h(PickerModal, { t: t, title: pick.title, sub: pick.sub, onClose: function () { setPickerOpen(false); } }, roleBanner, pick.body) : null,
      detail ? h(PlayerCard, { p: detail, t: t, avatar: pAvatar(detail, 44), roleText: phase === "result" ? ("身份：" + AV_ROLE_ZH[detail.role]) : null, roleBad: detail.side === "evil", onClose: function () { setDetail(null); } }) : null);
  }

  window.Games = Games;
})();
