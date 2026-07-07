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
    { key: "werewolf", emoji: "🐺", zh: "狼人杀", en: "Werewolf", min: 5, max: 12, ready: false,
      desc: "狼人夜里行凶，好人白天靠推理投票。含预言家 / 女巫 / 猎人等神职。", rule: "5~12 人 · 含神职" },
    { key: "avalon", emoji: "⚔️", zh: "阿瓦隆", en: "Avalon", min: 5, max: 10, ready: false,
      desc: "正义与邪恶的任务对抗，梅林认得坏人、刺客要在结局刺杀梅林。", rule: "5~10 人 · 任务制" }
  ];
  // 能力≠性格：所有游戏共用的反刻板铁律，焊进每次生成
  const SKILL_RULE = "【能力与性格分开·非常重要】把「性格风格」和「真实水平」当成两件事：性格只决定 TA 怎么说话、什么语气；真实水平由 TA 的职业、背景、受过的训练、人生经历决定，和性格无关。绝不能因为性格开朗 / 单纯 / 憨 / 软就把 TA 演成脑子不好、推理拉垮——一个性格像小太阳但职业是程序员的人，逻辑和推理其实很强、玩推理游戏心里门儿清，只是嘴上仍旧暖乎乎的。按真实水平决定「玩得多好」，按性格决定「怎么表达」。";

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

  // ============================================================
  // 中枢（书架式游戏卡）
  // ============================================================
  function Games(props) {
    const t = useTheme();
    const [game, setGame] = useState(null);       // 进入配置的游戏
    const [session, setSession] = useState(null);  // {game, config} 进入对局

    if (session) {
      if (session.game.key === "spy") return h(SpyGame, { config: session.config, game: session.game, active: props.active, bgActive: props.bgActive, characters: props.characters, profile: props.profile, recentChatFor: props.recentChatFor, t: t, toast: props.toast, onBack: function () { setSession(null); } });
      return h(GamePlay, { game: session.game, config: session.config, characters: props.characters, profile: props.profile, t: t, onBack: function () { setSession(null); } });
    }
    if (game) return h(GameSetup, {
      game: game, characters: props.characters, profile: props.profile, moods: props.moods, t: t,
      onBack: function () { setGame(null); },
      onStart: function (config) { setSession({ game: game, config: config }); }
    });

    // ---- 游戏架 ----
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "小游戏", en: "Games", onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
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
    const [injectChat, setInjectChat] = useState(false);

    const spectate = mode === "spectate";
    const humanPlays = !spectate;                    // 观战时用户不算玩家
    const base = picked.length + (humanPlays ? 1 : 0);
    const needNpc = npcFill && base < game.min ? game.min - base : 0;
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
    else if (tooFew) countMsg = spectate ? "观战至少要 2 个角色下场" : "还差人——至少 " + game.min + " 人" + (npcFill ? "（可开 NPC 凑数）" : "，或开 NPC 凑数");
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
          h(ToggleRow, { t: t, label: "NPC 凑数", sub: "人不够时自动生成 NPC 补到最低人数——NPC 也有自己的人设和水平，不会为了推进而崩。", on: npcFill, onToggle: function () { setNpcFill(!npcFill); } }),
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
    const raw = await callAI(api, sys, [{ role: "user", content: "发牌：给词、" + npcCount + " 个 NPC、每个人的能力小传。" }], { maxTokens: 4000 });
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
    const raw = await callAI(api, sys, [{ role: "user", content: "各说一句。" }], { maxTokens: 2600 });
    const p = extractJSON(raw);
    return (p && Array.isArray(p.clues)) ? p.clues : [];
  }

  // 投票：存活 AI 各投一人 + 理由（卧底会误导）
  async function genVotes(api, voters, allClues, aliveNames, mode, userName) {
    const clues = allClues.map(function (c) { return "· " + c.name + "：" + c.text; }).join("\n");
    const who = voters.map(function (v) { return "■ " + v.name + "（" + (v.role === "spy" ? "你其实是卧底：把票投给某个你觉得像平民的人来误导，别投出真正的少数派" : "你是平民：凭描述投你真心最怀疑的那个") + "）真实水平：" + (v.skill || "普通"); }).join("\n");
    const easy = (mode === "easy" && userName) ? "\n【放水局】别精准锁定真人「" + userName + "」，就算怀疑 TA 也可以手下留情、投别人或说再看看。" : "";
    const sys = AC + SKILL_RULE + "\n\n「谁是卧底」投票。根据目前【所有描述】，下面每人各投一个要投出局的人 + 一句短理由。按真实水平：推理强的投得准，弱的易被带偏。理由别露上帝视角（别说“我是卧底所以…”）。" + easy +
      "\n\n【可投的存活玩家】" + aliveNames.join("、") + "\n\n【目前所有描述】\n" + clues + "\n\n【要投票的人】\n" + who +
      "\n\n【输出】只输出 JSON：{\"votes\":[{\"name\":\"投票人\",\"target\":\"被投的人\",\"reason\":\"一句理由\"}]}";
    const raw = await callAI(api, sys, [{ role: "user", content: "投票。" }], { maxTokens: 2200 });
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
          if (cfg.mode !== "spectate") list.push({ key: "user", name: (props.profile && props.profile.name) || "你", char: null, isUser: true, isNpc: false, skill: "" });
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
          let target = hit && hit.target;
          // 容错：目标名对齐到存活玩家；对不上就随机投一个非自己的存活者
          let tp = target && alive.find(function (p) { return p.name === target || (target.indexOf(p.name) >= 0); });
          if (!tp) { const others = alive.filter(function (p) { return p.name !== v.name; }); tp = others[Math.floor(Math.random() * others.length)]; }
          return { voter: v.name, target: tp ? tp.name : null, reason: (hit && hit.reason) || "" };
        });
        if (me && me.alive && userTarget) votes.push({ voter: me.name, target: userTarget, reason: "（你的一票）" });
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
        return h("div", { key: p.key, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: p.alive ? 1 : 0.32, flexShrink: 0, width: 46 } },
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
        if (it.type === "vote") return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "3px 0", lineHeight: 1.5 } }, "· " + it.name + " → 投 " + it.target + (it.reason ? "：" + it.reason : ""));
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
            })),
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

    return h("div", { className: "h-full flex flex-col" }, header, roster, logView,
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "12px 16px calc(env(safe-area-inset-bottom) + 14px)" } }, action));
  }

  window.Games = Games;
})();
