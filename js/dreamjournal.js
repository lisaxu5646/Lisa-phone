// ============================================================
// 解梦馆（dream journal）v1 —— 收录【她的真梦】，角色按人设解梦
// 方向 2026-07-17 她拍板（对话里定的四条铁则）：
//   ①残渣也是梦：只记得颜色/情绪/一个画面都能记、都能解；「没梦」也是记录
//   ②十秒采集：语音优先（复用 Ears 听写），睁眼含糊嘟囔即可，不用打字不用清醒
//   ③解梦=角色人设的舞台：谁解都行，各按各的腔调；禁止心理诊断腔
//   ④无梦日反向营业的口子留给 D 模块自发梦（他讲他的梦），本文件不做
// 存储：x_dreamlog（数组，最新在前；纯文本量小，随 saves 云同步）
// 成本：零常驻、零自动调用——只有她点「找TA解」才走一次 apiFor(charId) 专线
// ============================================================
(function () {
  "use strict";
  const useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;

  const K_LOG = "x_dreamlog";
  const loadLog = () => loadJSON(K_LOG, []);
  const saveLog = list => saveJSON(K_LOG, list);
  const uid = () => "dm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const KIND = { dream: ["🌙 完整的梦", "#8a7a9c"], fragment: ["🫧 残渣", "#7d8a9a"], none: ["😴 没梦", "#9a9082"] };

  // ---- 词频仪表：反复出现的母题（复用 engine 的 memTokens，只取二元组，去日期类噪声）----
  function motifTop(entries, topN) {
    const cnt = new Map();
    entries.filter(e => e.kind !== "none" && e.text).forEach(e => {
      const seen = new Set(); // 同一条梦里重复词只记一次（防一条梦刷爆词频）
      memTokens(e.text).forEach(tk => {
        if (tk.length < 2 || /^[0-9]+$/.test(tk)) return;
        if (!seen.has(tk)) { seen.add(tk); cnt.set(tk, (cnt.get(tk) || 0) + 1); }
      });
    });
    return [...cnt.entries()].filter(x => x[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, topN || 10);
  }

  // ---- 解梦 prompt：人设腔调 + 四条馆规 ----
  function interpretSys(char, entry, priorMotifs) {
    const motifTxt = priorMotifs && priorMotifs.length ? "她的梦里近来反复出现：" + priorMotifs.map(x => x[0] + "×" + x[1]).join("、") + "。若和本梦有关可以点一句，无关就别硬扯。" : "";
    return "你是「" + char.name + "」。人设（保持你的说话腔调）：" + String(char.persona || "").slice(0, 400) + "\n\n" +
      "她刚把自己昨晚的梦（或梦的残渣）讲给你听，请你按你的性格给她解梦。\n" +
      "【馆规】\n" +
      "· 残渣也能解：哪怕只有一种颜色、一种情绪，也从那一点出发编织意义；素材少就少说，别脑补她没讲的情节。\n" +
      "· 用你自己的方式解：可以玄学、可以科学、可以胡说八道地可爱，但必须像你会说的话。\n" +
      "· 禁止心理诊断腔：不许出现『焦虑症』『创伤』『建议就医』这类词，你是她的人不是她的医生。\n" +
      "· 篇幅 120~250 字，最后可以送她一句简短的『今日梦签』。\n" +
      (motifTxt ? "· " + motifTxt + "\n" : "") +
      "直接输出解梦内容本身，不要 JSON、不要引号包裹、不要开场白式的复述。";
  }

  // ---- 语音听写（复用 Ears；没有 Ears/不支持=纯手打，不报错）----
  function DictateButton({ onText, toast }) {
    const t = useTheme();
    const [rec, setRec] = useState(false);
    const sessRef = useRef(null);
    useEffect(() => () => { if (sessRef.current) sessRef.current.cancel().catch(() => {}); }, []);
    if (!(window.Ears && window.isSecureContext)) return null;
    const toggle = async () => {
      if (rec) {
        const s = sessRef.current; sessRef.current = null; setRec(false);
        try { const r = await s.stop(); if (r && r.transcript) onText(r.transcript); } catch (e) { toast && toast(e.message || "没听清，再试一次"); }
        return;
      }
      try {
        sessRef.current = await window.Ears.start({ lang: "zh-CN", ownerKey: "dreamlog", onTranscript: onText, onSpeechError: () => {} });
        setRec(true);
      } catch (e) { toast && toast(e.message || "麦克风没开起来"); }
    };
    return h("button", { onClick: toggle, className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12, padding: "6px 12px", borderRadius: 999, border: "1px solid " + (rec ? "#9f5149" : t.line), color: rec ? "#9f5149" : t.sub, background: t.bg2 } }, rec ? "■ 说完了" : "🎙 懒得打字");
  }

  // ---- D 步骤 2：TA们的梦 · 懒生成 prompt（拍板：后台池模型；梦≠记忆；剧情主权）----
  function dreamGenSys(char, row, excerpts) {
    return "你是「" + char.name + "」。人设：" + String(char.persona || "").slice(0, 300) + "\n\n" +
      "你昨晚睡着后做了一场梦。下面是入梦材料——你昨天真实经历的对话片段和情绪状态。请把它们揉成一场【你的梦】。\n" +
      "【当日对话片段】\n" + (excerpts.length ? excerpts.map(x => "· " + x).join("\n") : "（昨天没什么对话，梦从情绪里长出来）") + "\n" +
      "【情绪残渣】" + (row.peaks || []).map(p => p.axis + "=" + p.value).join("、") + (row.relationActiveAxes && row.relationActiveAxes.length ? "｜关系张力：" + row.relationActiveAxes.join("、") : "") + "\n\n" +
      "【梦的规则】\n" +
      "· 梦逻辑：允许扭曲、拼贴、时空错乱，白天的细节可以变形出现（雨伞变成船、对话发生在不存在的房间）；不要写成白天的复述。\n" +
      "· 第一人称，你在梦里。120~220 字。\n" +
      "· 只允许出现材料与你人设记忆里已有的人和事，绝不虚构新人名。\n" +
      "· 你和她的关系在梦里不得比现实更进一步：可以渴望、暧昧、欲言又止，但不得出现现实中未发生的关系事实（表白/婚礼/恋人称谓——除非现实已如此）。\n" +
      "· 语言像梦：具体的画面感，不解释不升华，禁止『这个梦说明』式的自我分析。\n\n" +
      "只输出 JSON（不要代码块包裹）：{\"narrative\":\"梦叙事\",\"motifs\":[\"母题≤4个,每个≤6字\"],\"tone\":\"一两个字的情绪底色\",\"wakeLine\":\"醒来后如果向她提起,你会说的一句话(口语,≤40字,以『我梦到』开头)\"}";
  }
  function parseDreamJSON(raw) {
    let s = String(raw || "").replace(/```json|```/g, "").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { const o = JSON.parse(s.slice(a, b + 1)); return o && o.narrative ? o : null; } catch (e) { return null; }
  }

  // ---- 主组件 ----
  function DreamJournalApp(props) {
    const t = useTheme();
    const [log, setLog] = useState(loadLog);
    const [text, setText] = useState("");
    const [busyId, setBusyId] = useState(null);   // 正在解梦的 entry id
    const [pickFor, setPickFor] = useState(null); // 给哪条梦挑解梦人
    const [openMotif, setOpenMotif] = useState(false);
    const [view, setView] = useState("hers");     // hers=她的梦 | theirs=TA们的梦
    const [theirs, setTheirs] = useState([]);
    const [genBusy, setGenBusy] = useState(null); // 正在生成的 dream key
    const chars = props.characters || [];
    const commit = next => { setLog(next); saveLog(next); };
    const nameOf = id => { const c = chars.find(x => x.id === id); return c ? (c.remark || c.name) : "？"; };
    const loadTheirs = async () => { if (window.DreamLoop) setTheirs(await window.DreamLoop.listDreams(60)); };
    useEffect(() => { loadTheirs(); }, []);

    // 懒生成：点开「未醒的梦」才真正花一次调用（材料引用就地还原成片段，正文不入库）
    const generate = async (row) => {
      if (genBusy) return;
      const char = chars.find(c => c.id === row.charId);
      if (!char) { props.toast && props.toast("角色不在了，这场梦无主"); return; }
      setGenBusy(row.key);
      try {
        const p = props.bgApi || (props.apiFor ? props.apiFor(char.id) : null);
        if (!p) throw new Error("没有可用的 API 线路");
        const msgs = loadJSON("x_chat:" + row.charId, []) || [];
        const ids = new Set((row.materialRefs || []).filter(r => r.kind === "chat").map(r => r.refId));
        const excerpts = [];
        msgs.forEach((m, i) => {
          const mid = m.id || m.turnId || (String(m.ts || 0) + ":" + i);
          if (ids.has(String(mid)) && m.content && excerpts.length < 12) excerpts.push(String(m.content).slice(0, 80));
        });
        const raw = await callAI(p, dreamGenSys(char, row, excerpts), [{ role: "user", content: "开始做梦。" }], { maxTokens: 6400 });
        const gen = parseDreamJSON(raw);
        if (!gen) throw new Error("梦没成形，再试一次");
        await window.DreamLoop.saveGenerated(row.key, gen);
        await loadTheirs();
      } catch (e) { props.toast && props.toast("生成失败：" + (e.message || e)); }
      finally { setGenBusy(null); }
    };

    const addEntry = kind => {
      const v = text.trim();
      if (kind !== "none" && !v) { props.toast && props.toast("先说点什么——一个画面、一种颜色都行"); return; }
      const entry = { id: uid(), ts: Date.now(), day: dayKey(Date.now()), kind: kind, text: kind === "none" ? "" : v, interpretations: [] };
      commit([entry, ...loadLog()]); // 审查修：以盘上为准合并，防云同步 pull 后被旧 state 覆盖
      setText("");
      props.toast && props.toast(kind === "none" ? "记下了：今晚无梦，睡得像块干净的硬盘" : "梦收进馆了");
    };

    const interpret = async (entry, char) => {
      if (busyId) return;
      setPickFor(null);
      setBusyId(entry.id);
      try {
        const p = props.apiFor ? props.apiFor(char.id) : null;
        if (!p) throw new Error("没有可用的 API 线路");
        const motifs = motifTop(log.filter(e => e.id !== entry.id), 5);
        const body = entry.kind === "none" ? "（她说昨晚没做梦，或者什么都不记得了。）" : entry.text;
        const raw = await callAI(p, interpretSys(char, entry, motifs), [{ role: "user", content: "【她的梦】\n" + body }], { maxTokens: 6400 });
        const clean = String(raw || "").trim();
        if (!clean) throw new Error("解梦人走神了，再试一次");
        commit(loadLog().map(e => e.id === entry.id ? { ...e, interpretations: [...(e.interpretations || []), { charId: char.id, name: char.remark || char.name, text: clean, ts: Date.now() }] } : e));
      } catch (e) { props.toast && props.toast("解梦失败：" + (e.message || e)); }
      finally { setBusyId(null); }
    };

    const motifs = motifTop(log, 10);
    const dreamDays = new Set(log.filter(e => e.kind !== "none").map(e => e.day)).size;
    const totalDays = new Set(log.map(e => e.day)).size;
    const byDay = [];
    log.forEach(e => { const g = byDay.find(x => x.day === e.day); if (g) g.items.push(e); else byDay.push({ day: e.day, items: [e] }); });

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "解梦馆", en: "Dreams · " + log.length + " 条", onBack: props.onBack,
        right: motifs.length ? h("button", { onClick: () => setOpenMotif(!openMotif), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, "母题") : null }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-10" },
        // 分栏：她的梦 | TA们的梦（D 线步骤2）
        h("div", { className: "flex", style: { gap: 8, marginBottom: 12 } },
          [["hers", "她的梦"], ["theirs", "TA们的梦" + (theirs.filter(d => d.status === "queued").length ? " ·" + theirs.filter(d => d.status === "queued").length : "")]].map(([k, label]) =>
            h("button", { key: k, onClick: () => { setView(k); if (k === "theirs") loadTheirs(); }, className: "flex-1 py-1.5 active:opacity-70", style: { borderRadius: 999, border: "1px solid " + (view === k ? t.tint : t.line), color: view === k ? t.tint : t.fog, fontFamily: F_BODY, fontSize: 12 } }, label))),

        view === "theirs" ? h(React.Fragment, null,
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, lineHeight: 1.7, marginBottom: 10 } }, "TA们睡着时把白天揉成的梦。💤=还没成形，点一下才写出来（此刻才花钱）；平静的夜没有梦，那也是真的。梦永远只是梦，不会进记忆。"),
          !theirs.length ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "30px 0", lineHeight: 1.8 } }, "还没有排队的梦。", h("br"), "今晚他们睡着 90 分钟后，第一批就来。") : null,
          (() => { const byNight = []; theirs.forEach(d => { const g = byNight.find(x => x.night === d.nightKey); if (g) g.items.push(d); else byNight.push({ night: d.nightKey, items: [d] }); }); return byNight.map(g => h("div", { key: g.night, style: { marginBottom: 14 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 6 } }, g.night + " 夜"),
            g.items.map(d => h("div", { key: d.key, style: { border: "1px solid " + t.line, borderRadius: 12, padding: "10px 12px", marginBottom: 8 } },
              h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
                h("span", { style: { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: t.ink } }, nameOf(d.charId)),
                h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, d.status === "queued" ? "💤 未醒的梦" : d.status === "no_dream" ? "🌫 无梦之夜" : "🌙 " + (d.tone || "有梦"))),
              d.status === "queued" ? h("button", { onClick: () => generate(d), disabled: !!genBusy, className: "w-full py-2 active:opacity-70 disabled:opacity-40", style: { borderRadius: 8, border: "1px dashed " + t.tint, color: t.tint, fontFamily: F_BODY, fontSize: 12 } }, genBusy === d.key ? "梦正在成形…" : "轻轻推醒这场梦") : null,
              d.status === "no_dream" ? h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, ({ calm_night: "那晚心里太平静，一夜无梦。", no_material: "那天没说上什么话，梦没有材料。" })[d.reason] || "一夜无梦。") : null,
              d.status === "generated" ? h(React.Fragment, null,
                h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, lineHeight: 1.8, whiteSpace: "pre-wrap" } }, d.narrative),
                (d.motifs || []).length ? h("div", { className: "flex flex-wrap", style: { gap: 6, marginTop: 8 } }, d.motifs.map(m => h("span", { key: m, style: { fontFamily: F_BODY, fontSize: 10.5, color: t.sub, background: t.bg2, border: "1px solid " + t.line, padding: "1px 8px", borderRadius: 999 } }, m))) : null,
                d.wakeLine ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 8, borderTop: "1px dashed " + t.line, paddingTop: 6 } }, "醒来他大概会说：「" + d.wakeLine + "」") : null) : null)))); })()
        ) : h(React.Fragment, null,

        // 母题仪表（潜意识词频）
        openMotif && motifs.length ? h("div", { style: { border: "1px dashed " + t.line, borderRadius: 12, padding: "10px 12px", marginBottom: 12 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 6 } }, "你的潜意识常客（出现≥2次）· 记梦率 " + dreamDays + "/" + totalDays + " 天"),
          h("div", { className: "flex flex-wrap", style: { gap: 6 } }, motifs.map(([w, n]) => h("span", { key: w, style: { fontFamily: F_BODY, fontSize: 11.5, color: t.ink, background: t.bg2, border: "1px solid " + t.line, padding: "2px 9px", borderRadius: 999 } }, w + " ×" + n)))) : null,

        // 今日采集卡
        h("div", { style: { border: "1px solid " + t.line, borderRadius: 14, padding: "12px 14px", marginBottom: 14, background: t.bg2 } },
          h("div", { className: "flex items-center justify-between", style: { marginBottom: 8 } },
            h(Eyebrow, null, "刚醒？趁没蒸发"),
            h(DictateButton, { onText: v => setText(x => (x ? x + " " : "") + v), toast: props.toast })),
          h("textarea", { value: text, onChange: e => setText(e.target.value), rows: 3, placeholder: "梦到什么都行——一个画面、一种颜色、一句醒来还记得的话。残渣也是梦。", className: "w-full outline-none p-3 rounded-lg", style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, color: t.ink, background: t.bg, border: "1px solid " + t.line, resize: "none" } }),
          h("div", { className: "flex", style: { gap: 8, marginTop: 8 } },
            h("button", { onClick: () => addEntry("dream"), className: "flex-1 py-2 active:opacity-70", style: { borderRadius: 8, background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 12.5 } }, "🌙 记完整的梦"),
            h("button", { onClick: () => addEntry("fragment"), className: "flex-1 py-2 active:opacity-70", style: { borderRadius: 8, border: "1px solid " + t.line, color: t.ink, fontFamily: F_BODY, fontSize: 12.5 } }, "🫧 只有残渣"),
            h("button", { onClick: () => addEntry("none"), className: "py-2 px-3 active:opacity-70", style: { borderRadius: 8, border: "1px dashed " + t.line, color: t.fog, fontFamily: F_BODY, fontSize: 12.5 } }, "😴 没梦"))),

        // 历史（按天分组）
        byDay.length === 0 ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "30px 0", lineHeight: 1.8 } }, "馆里还空着。", h("br"), "明早睁眼第一件事：来这儿嘟囔十秒。") : null,
        byDay.map(g => h("div", { key: g.day, style: { marginBottom: 14 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 6 } }, g.day),
          g.items.map(e => h("div", { key: e.id, style: { border: "1px solid " + t.line, borderRadius: 12, padding: "10px 12px", marginBottom: 8 } },
            h("div", { className: "flex items-center justify-between", style: { marginBottom: e.text ? 6 : 0 } },
              h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: "#fff", background: (KIND[e.kind] || KIND.dream)[1], padding: "1px 8px", borderRadius: 999 } }, (KIND[e.kind] || KIND.dream)[0]),
              h("div", { className: "flex", style: { gap: 10 } },
                h("button", { onClick: () => setPickFor(pickFor === e.id ? null : e.id), disabled: !!busyId, className: "active:opacity-60 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.tint } }, busyId === e.id ? "解梦中…" : "找TA解"),
                h("button", { onClick: () => { if (confirm("删掉这条梦？解读也会一起消失。")) commit(loadLog().filter(x => x.id !== e.id)); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "删"))),
            e.text ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, lineHeight: 1.75, whiteSpace: "pre-wrap" } }, e.text) : null,
            pickFor === e.id ? h("div", { className: "flex flex-wrap", style: { gap: 6, marginTop: 8 } }, chars.map(c =>
              h("button", { key: c.id, onClick: () => interpret(e, c), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 11.5, padding: "4px 11px", borderRadius: 999, border: "1px solid " + t.line, color: t.ink, background: t.bg2 } }, c.remark || c.name))) : null,
            (e.interpretations || []).map((it, i) => h("div", { key: i, style: { marginTop: 8, background: t.bg, borderRadius: 10, padding: "8px 11px", borderLeft: "3px solid " + t.tint } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 4 } }, it.name + " 的解法"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, lineHeight: 1.75, whiteSpace: "pre-wrap" } }, it.text)))))))),
      )
    );
  }

  // 主屏图标：月亮抱着一本摊开的书（和「梦境」app 的图标区分开）
  window.GDreamBook = function (props) {
    const size = (props && props.size) || 34, color = (props && props.color) || "#1b1a17";
    return h("svg", { width: size, height: size, viewBox: "0 0 48 48", fill: "none" },
      h("path", { d: "M31 7a13 13 0 1 0 10 20 15 15 0 1 1-10-20z", stroke: color, strokeWidth: 2.6, strokeLinejoin: "round" }),
      h("path", { d: "M10 32c4-2 8-2 12 0 4-2 8-2 12 0", stroke: color, strokeWidth: 2.6, strokeLinecap: "round" }),
      h("path", { d: "M10 32v7c4-2 8-2 12 0 4-2 8-2 12 0v-7", stroke: color, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" }),
      h("path", { d: "M22 32v7", stroke: color, strokeWidth: 2, strokeLinecap: "round" }));
  };

  window.DreamJournalApp = DreamJournalApp;
})();
