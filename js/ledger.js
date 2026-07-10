// ============================================================
// 记账（ledger）—— 多币种个人记账，独立小 app
// 用户在国外：生活用 CAD、玩游戏充 CNY —— 多币种【各记各的、默认不换算不合并本币】。
//   · 钱包式落地页：币种像卡片叠着，点一张「抽出」看该币种本月富信息汇总（支出/收入/结余+分类+对比+流水入口）
//   · 记一笔：支出/收入切换 · 多币种(可增删改) · 分类网格(可增删改) · 日期 · 备注
//   · 每笔可编辑/删除；可【选多个角色一次性批注】（一次 API 出多人，参考实时心情+人设，忠于性别不偷懒）
//   · 可设「谁能看到我的账」→ 被授权角色在聊天里自然感知真实开销（financeNote，只读、绝不碰钱包/余额）
// 和「钱包」(x_wallet) 是两套钱：钱包=RP 虚构 CNY 经济；这里=你真实的个人财务。互不换算、互不触发。
// 数据存 localStorage x_ledger，随云同步。
// ============================================================
(function () {
  const ACCENT = "#4f6d5a";   // 记账主色（沉静的墨绿）
  const GOLD = "#b89150";
  const EXP = "#c25a4a";      // 支出（暖红）
  const INC = "#4f6d5a";      // 收入（绿）
  const AC = () => (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "");
  const NAC = () => (typeof NARRATIVE_ANTI_CLICHE !== "undefined" ? NARRATIVE_ANTI_CLICHE + "\n\n" : "");
  const CUR_COLORS = ["#a8543f", "#4f6d5a", "#4f5a78", "#7a6a5a", "#6d5a78", "#3f6d6d"];

  // ---- 默认币种 & 分类 ----
  const DEFAULT_CURS = [
    { code: "CAD", symbol: "$", label: "加币" },
    { code: "CNY", symbol: "¥", label: "人民币" }
  ];
  const DEF_EXP = [
    { name: "餐饮", emoji: "🍚" }, { name: "买菜", emoji: "🛒" }, { name: "交通", emoji: "🚌" },
    { name: "购物", emoji: "🛍️" }, { name: "日用", emoji: "🧴" }, { name: "居住", emoji: "🏠" },
    { name: "娱乐", emoji: "🎬" }, { name: "游戏充值", emoji: "🎮" }, { name: "医疗", emoji: "💊" },
    { name: "人情", emoji: "🎁" }, { name: "学习", emoji: "📚" }, { name: "其他", emoji: "✨" }
  ];
  const DEF_INC = [
    { name: "工资", emoji: "💰" }, { name: "兼职", emoji: "💼" }, { name: "红包", emoji: "🧧" },
    { name: "报销", emoji: "🧾" }, { name: "其他", emoji: "✨" }
  ];

  // ---- 数据存取 ----
  function defaultData() {
    return { txns: [], settings: { visibleTo: [], currencies: DEFAULT_CURS.map(c => ({ ...c })), cats: { expense: DEF_EXP.map(c => ({ ...c })), income: DEF_INC.map(c => ({ ...c })) } } };
  }
  function loadData() {
    const d = loadJSON("x_ledger", null);
    if (!d) return defaultData();
    const def = defaultData();
    d.txns = Array.isArray(d.txns) ? d.txns : [];
    d.settings = d.settings || {};
    d.settings.visibleTo = Array.isArray(d.settings.visibleTo) ? d.settings.visibleTo : [];
    d.settings.currencies = Array.isArray(d.settings.currencies) && d.settings.currencies.length ? d.settings.currencies : def.settings.currencies;
    d.settings.cats = d.settings.cats || {};
    d.settings.cats.expense = Array.isArray(d.settings.cats.expense) && d.settings.cats.expense.length ? d.settings.cats.expense : def.settings.cats.expense;
    d.settings.cats.income = Array.isArray(d.settings.cats.income) && d.settings.cats.income.length ? d.settings.cats.income : def.settings.cats.income;
    d.monthly = d.monthly || {}; // 月度盘点：{ "YYYY-MM": { genAt, comments:[{charId,charName,text,ts}] } }
    return d;
  }
  function saveData(d) { saveJSON("x_ledger", d); }

  // ---- 时间 / 金额工具 ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function todayStr() { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function monthKey(dateStr) { return String(dateStr || "").slice(0, 7); }        // "YYYY-MM"
  function thisMonthKey() { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function fmtMonth(mk) { const p = mk.split("-"); return p[0] + "年" + parseInt(p[1], 10) + "月"; }
  function shiftMonth(mk, delta) {
    const p = mk.split("-"); let y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1 + delta;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + pad(m + 1);
  }
  function fmtDay(dateStr) { const p = String(dateStr || "").split("-"); return p.length === 3 ? (parseInt(p[1], 10) + "月" + parseInt(p[2], 10) + "日") : dateStr; }
  function fmtNum(n) { const v = Math.round((Number(n) || 0) * 100) / 100; return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtAmt(n, cur) { return (cur ? cur.symbol : "") + fmtNum(n); }

  // 某币种在某月的收支汇总 + 分类明细
  function summarize(txns, code, mk) {
    let exp = 0, inc = 0; const cats = {};
    txns.forEach(t => {
      if (t.currency !== code || monthKey(t.date) !== mk) return;
      const a = Number(t.amount) || 0;
      if (t.type === "income") inc += a;
      else { exp += a; if (!cats[t.category]) cats[t.category] = { amount: 0, emoji: t.catEmoji || "" }; cats[t.category].amount += a; }
    });
    const catList = Object.keys(cats).map(k => ({ name: k, amount: cats[k].amount, emoji: cats[k].emoji })).sort((x, y) => y.amount - x.amount);
    return { exp, inc, net: inc - exp, catList, count: txns.filter(t => t.currency === code && monthKey(t.date) === mk).length };
  }

  // ============================================================
  // 事件判定（纯本地、零 API）：这笔账值不值得角色「自己注意到、主动开口」
  // 命中返回 {key,desc}，没命中返回 null——绝大多数账没事件，一分钱 API 不花
  // ============================================================
  function detectTxnEvent(txns, txn, cur) {
    const a = Number(txn.amount) || 0;
    if (!(a > 0)) return null;
    const hist = txns.filter(x => x.id !== txn.id && x.currency === txn.currency && x.type === txn.type);
    if (txn.type === "expense") {
      // 大额：比 Ta 平时单笔支出的均值高出 3 倍以上（至少 5 笔历史才有「平时」可言）
      if (hist.length >= 5) {
        const avg = hist.reduce((s, x) => s + (Number(x.amount) || 0), 0) / hist.length;
        if (avg > 0 && a >= avg * 3) return { key: "big", desc: "这笔（" + fmtAmt(a, cur) + "）比 Ta 平时一笔的水平（约 " + fmtAmt(avg, cur) + "）大出好几倍" };
      }
      // 高频：本月同分类第 5、10、15…笔（每满 5 提一次，不然天天唠叨）
      const catN = txns.filter(x => x.type === "expense" && x.currency === txn.currency && x.category === txn.category && monthKey(x.date) === monthKey(txn.date)).length;
      if (catN >= 5 && catN % 5 === 0) return { key: "freq", desc: "这已经是 Ta 这个月第 " + catN + " 笔『" + txn.category + "』了" };
      // 深夜：0~5 点当天记的支出（熬夜花钱最容易被逮到）
      const hour = new Date().getHours();
      if (hour < 5 && txn.date === todayStr()) return { key: "night", desc: "现在是深夜" + (hour === 0 ? "十二" : hour) + "点多，Ta 深更半夜还在花钱" };
    } else {
      // 大进账：比平时收入的均值高出 2 倍以上（至少 2 笔历史）
      if (hist.length >= 2) {
        const avg = hist.reduce((s, x) => s + (Number(x.amount) || 0), 0) / hist.length;
        if (avg > 0 && a >= avg * 2) return { key: "income", desc: "这是笔难得的大进账（" + fmtAmt(a, cur) + "）" };
      }
    }
    return null;
  }

  // ============================================================
  // 供聊天引擎调用：把「被授权角色能看到的记账动态」拼成一段（financeNote）
  // 只读、只感知，绝不碰钱包/角色余额。app.js 的 ctxFor 会调用它。
  // ============================================================
  window.ledgerNoteFor = function (charId) {
    try {
      const d = loadJSON("x_ledger", null);
      if (!d || !d.settings || !(d.settings.visibleTo || []).includes(charId)) return "";
      const txns = Array.isArray(d.txns) ? d.txns : [];
      if (!txns.length) return "";
      const curs = d.settings.currencies || DEFAULT_CURS;
      const mk = thisMonthKey();
      const lines = [];
      curs.forEach(cur => {
        const s = summarize(txns, cur.code, mk);
        if (!s.exp && !s.inc) return;
        let l = "· " + cur.label + "（" + cur.code + "）本月：支出 " + fmtAmt(s.exp, cur) + "，收入 " + fmtAmt(s.inc, cur) + "，结余 " + fmtAmt(s.net, cur);
        if (s.catList.length) l += "；花得最多的是 " + s.catList.slice(0, 3).map(c => c.name + " " + fmtAmt(c.amount, cur)).join("、");
        lines.push(l);
      });
      const big = txns.filter(t => t.type === "expense").slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12)
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 4);
      if (big.length) {
        lines.push("最近几笔较大的开销：" + big.map(t => {
          const cur = curs.find(c => c.code === t.currency) || { symbol: "" };
          return fmtDay(t.date) + " " + t.category + " " + fmtAmt(t.amount, cur) + (t.note ? "（" + String(t.note).slice(0, 16) + "）" : "");
        }).join("；"));
      }
      return lines.join("\n");
    } catch (e) { return ""; }
  };

  // ============================================================
  // 模型：多个角色一次性批注同一笔账（一次调用，省 API）
  // 返回按传入顺序对齐的 [{text}]；text 为空串表示这一位没生成出来（上层不入库、提示重试）
  // ============================================================
  async function genComments(active, txn, cur, list, uName, worldbook, opts) {
    const typeZh = txn.type === "income" ? "进账" : "花销";
    const amt = fmtAmt(txn.amount, cur) + "（" + cur.label + "）";
    // 性格升级素材（全部本地算，零额外 API）：
    // ① 该角色最近对别的账说过什么 → 逼 Ta 换新说法，治「每次都同一个梗」
    const allTxns = (loadData().txns || []);
    const prevOf = id => allTxns.filter(x => x.id !== txn.id).flatMap(x => (x.comments || []).filter(cm => cm.charId === id).map(cm => String(cm.text || ""))).filter(Boolean).slice(0, 2);
    // ② 本月同分类的频率/累计 → 角色能说出「这个月第几次了」这种真看过账本的话
    let bgLine = "";
    if (txn.type === "expense") {
      const same = allTxns.filter(x => x.type === "expense" && x.currency === txn.currency && x.category === txn.category && monthKey(x.date) === monthKey(txn.date));
      const tot = same.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      if (same.length > 1) bgLine = "\n【背景】这个月『" + txn.category + "』连这笔已是第 " + same.length + " 笔、共 " + fmtAmt(tot, cur) + "。角色可以自然联系这个频率或累计来说话，但别报账式复述数字。";
    }
    const block = list.map((it, i) => (i + 1) + "、「" + it.name + "」\n  人设：" + (it.persona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 320) + (it.mood ? "\n  此刻心情：" + it.mood : "")
      + (it.aff != null ? "\n  对 " + uName + " 的好感度：" + Math.round(it.aff) + "/100（据此把握语气的亲疏和上不上心的程度）" : "")
      + (prevOf(it.id).length ? "\n  Ta 最近对别的账说过：" + prevOf(it.id).map(s => "「" + s.slice(0, 40) + "」").join("、") + "——这次必须换新的说法和角度，别复读同样的梗和句式" : "")).join("\n\n");
    // 事件驱动模式：不是用户请 Ta 来看，而是 Ta 自己刷到了这笔账、主动开口的第一反应
    const evIntro = opts && opts.event
      ? uName + " 刚记下一笔" + typeZh + "，下面每位角色恰好【自己注意到】了它——" + opts.event.desc + "。请【分别以每位角色本人的口吻】，各说一句 Ta 主动开口的第一反应：惊讶、皱眉、心疼、打趣、盘问都行，按各自人设来，像 Ta 忍不住先开口的那句。\n"
      : "下面是 " + uName + " 刚记下的一笔真实的" + typeZh + "。请【分别以下面每位角色本人的口吻】，各说一句 Ta 看到 " + uName + " 这笔账时会真实说出口的话。\n";
    const sys = AC() + NAC() +
      evIntro +
      "【硬性要求，必须做到】\n" +
      "· 真的进入角色、说出有内容有态度的一句，结合人设＋此刻心情＋这笔账的分类和金额。严禁敷衍成『看了一眼没说什么』『无所谓』『随你』这类空话——那是偷懒。\n" +
      "· 人称必须对：从人设判断角色的性别，男用「他」女用「她」；判断不出就直接叫名字或干脆不用第三人称。绝对不许写成『Ta』『TA』这种占位符。\n" +
      "· 每人一句、口语、像随手发的消息；几个人语气各不相同，别写成同一个腔调，别说教别客套别报流水账。\n" +
      "· 反应可以多样：心疼你乱花、笑你手松、替你算账、酸一下、担心、或只是顺口关心——按各自人设来。\n\n" +
      "【这笔账】" + fmtDay(txn.date) + " · " + typeZh + " · " + txn.category + " · " + amt + (txn.note ? " · 备注：" + txn.note : "") + bgLine + "\n\n" +
      "【要批注的角色】\n" + block +
      (worldbook && worldbook.trim() ? "\n\n【世界书（仅参考）】\n" + worldbook.trim().slice(0, 400) : "") +
      "\n\n【输出】只输出 JSON，comments 数组和上面角色顺序【一一对应、数量一致】：{\"comments\":[{\"name\":\"角色名\",\"text\":\"这位角色的一句话\"}...]}。别加解释、别加代码块。";
    const raw = await callAI(active, sys, [{ role: "user", content: "开始批注。" }], { maxTokens: 6000 });
    const p = extractJSON(raw) || {};
    const arr = Array.isArray(p.comments) ? p.comments : (Array.isArray(p) ? p : []);
    return list.map((it, i) => {
      const byName = arr.find(r => r && r.name && String(r.name).trim() === it.name);
      const r = byName || arr[i];
      const txt = r && (r.text || r.comment) ? String(r.text || r.comment).trim() : "";
      return { text: txt };
    });
  }

  // ============================================================
  // 小工具：风格统一的字段输入弹窗（增/改币种、增/改分类都用它，替掉原生 prompt）
  // fields: [{key,label,value,placeholder,maxLength}]
  // ============================================================
  function FieldDialog(props) {
    const t = useTheme();
    const [vals, setVals] = useState(() => { const o = {}; (props.fields || []).forEach(f => o[f.key] = f.value || ""); return o; });
    const lift = useKbLift();
    const set = (k, v) => setVals(s => ({ ...s, [k]: v }));
    const submit = () => {
      for (const f of props.fields) { if (f.required && !String(vals[f.key] || "").trim()) { return; } }
      props.onSubmit(vals);
    };
    return h("div", { className: "absolute inset-0 z-[60] flex items-center justify-center", style: { background: "rgba(20,19,15,0.5)", backdropFilter: "blur(3px)", padding: 24 }, onClick: props.onCancel },
      h("div", { onClick: e => e.stopPropagation(), style: { width: "100%", maxWidth: 320, background: t.bg2, borderRadius: 20, padding: "20px 18px 16px", animation: "fadeUp .2s ease both", transform: lift ? "translateY(-" + Math.round(lift / 2) + "px)" : "none", transition: "transform .18s ease" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink, marginBottom: 16, textAlign: "center" } }, props.title),
        (props.fields || []).map(f => h("div", { key: f.key, style: { marginBottom: 12 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 5 } }, f.label),
          h("input", { value: vals[f.key], onChange: e => set(f.key, e.target.value), placeholder: f.placeholder || "", maxLength: f.maxLength || 40, disabled: f.locked,
            style: { width: "100%", fontFamily: F_BODY, fontSize: 14, color: f.locked ? t.fog : t.ink, background: t.bg, border: "1px solid " + t.line, borderRadius: 10, padding: "10px 12px", outline: "none" } }))),
        h("div", { className: "flex gap-3", style: { marginTop: 6 } },
          h("button", { onClick: props.onCancel, className: "flex-1 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 14, color: t.sub, padding: "11px 0", borderRadius: 12, border: "1px solid " + t.line, background: "transparent" } }, "取消"),
          h("button", { onClick: submit, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: ACCENT, padding: "12px 0", borderRadius: 12, border: "none" } }, props.submitLabel || "保存"))));
  }

  // ============================================================
  // 主组件
  // ============================================================
  function Ledger(props) {
    const t = useTheme();
    const [data, setData] = useState(loadData);
    const [view, setView] = useState("home");   // home | cur:<code> | txn:<id>
    const [addState, setAddState] = useState(null); // null | {edit?:txn}
    const [showSet, setShowSet] = useState(false);
    const uName = (props.profile && props.profile.name) || "我";

    const persist = d => { setData(d); saveData(d); };
    const addTxn = txn => { const d = loadData(); d.txns = [txn].concat(d.txns); persist(d); return txn; };
    const updTxn = (id, patch) => { const d = loadData(); d.txns = d.txns.map(x => x.id === id ? { ...x, ...patch } : x); persist(d); };
    const delTxn = id => { const d = loadData(); d.txns = d.txns.filter(x => x.id !== id); persist(d); };

    const curs = data.settings.currencies || DEFAULT_CURS;
    const curOf = code => curs.find(c => c.code === code) || { code: code, symbol: "", label: code };

    // 事件驱动一次性反应：记完账本地判定事件（大额/高频/深夜/大进账），命中且有可见角色时，
    // 让好感最高的一位「自己注意到」这笔账、主动留一句批注。没事件=零 API；反应只留在账本里，不进聊天 prompt。
    const autoReact = async txn => {
      try {
        if (!props.active) return;
        const d = loadData();
        const vis = (d.settings.visibleTo || []).filter(id => (props.characters || []).some(c => c.id === id));
        if (!vis.length) return;
        const cur = curOf(txn.currency);
        const ev = detectTxnEvent(d.txns, txn, cur);
        if (!ev) return;
        const aff = props.affinities || {};
        const cid = vis.slice().sort((x, y) => (aff[y] != null ? aff[y] : 50) - (aff[x] != null ? aff[x] : 50))[0];
        const c = (props.characters || []).find(x => x.id === cid);
        if (!c) return;
        const mo = props.moods && props.moods[c.id];
        const list = [{ id: c.id, name: c.name, persona: c.persona || "", mood: mo && mo.label ? String(mo.label) : "", aff: aff[c.id] }];
        const outs = await genComments(props.active, txn, cur, list, uName, props.worldbook, { event: ev });
        const cmts = (outs || []).filter(o => o && o.text).map(o => ({ charId: c.id, charName: c.name, text: o.text, ts: Date.now(), auto: true, event: ev.key }));
        if (!cmts.length) return;
        const now = loadData().txns.find(x => x.id === txn.id);
        if (!now) return; // 用户已把这笔删了就算了
        updTxn(txn.id, { comments: (now.comments || []).concat(cmts) });
        props.toast && props.toast(c.name + " 注意到了这笔账");
      } catch (e) {/* 静默：主动反应失败不打扰记账本身 */}
    };

    // 月度盘点：新月份第一次打开记账，给上月账本生成一次角色盘点（一次 API 出所有可见角色的话；失败不落库、下次打开再试）
    const genMonthly = async (mk, vis) => {
      try {
        const d0 = loadData();
        const curs0 = d0.settings.currencies || DEFAULT_CURS;
        const prevMk = shiftMonth(mk, -1);
        const statLines = [];
        curs0.forEach(cur => {
          const s = summarize(d0.txns, cur.code, mk);
          if (!s.exp && !s.inc) return;
          const p = summarize(d0.txns, cur.code, prevMk);
          let l = "· " + cur.label + "（" + cur.code + "）：支出 " + fmtAmt(s.exp, cur) + "、收入 " + fmtAmt(s.inc, cur) + "、结余 " + fmtAmt(s.net, cur) + "（" + s.count + " 笔）";
          if (s.catList.length) l += "，花最多的是 " + s.catList.slice(0, 3).map(c => c.name + " " + fmtAmt(c.amount, cur)).join("、");
          if (p.exp > 0) l += "；比上个月支出" + (s.exp >= p.exp ? "多" : "少") + Math.abs(Math.round((s.exp - p.exp) / p.exp * 100)) + "%";
          statLines.push(l);
        });
        if (!statLines.length) return;
        const aff = props.affinities || {};
        const list = vis.map(id => { const c = props.characters.find(x => x.id === id); const mo = props.moods && props.moods[id]; return { id, name: c.name, persona: c.persona || "", mood: mo && mo.label ? String(mo.label) : "", aff: aff[id] }; });
        const block = list.map((it, i) => (i + 1) + "、「" + it.name + "」\n  人设：" + (it.persona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 300) + (it.mood ? "\n  此刻心情：" + it.mood : "") + (it.aff != null ? "\n  对 " + uName + " 的好感度：" + Math.round(it.aff) + "/100（据此把握语气亲疏）" : "")).join("\n\n");
        const sys = AC() + NAC() +
          uName + " 上个月（" + fmtMonth(mk) + "）的账本盘点如下。请【分别以每位角色本人的口吻】对这份月账单说一段话（1~3 句）。\n" +
          "【硬性要求】\n" +
          "· 这是【月度盘点】不是单笔吐槽：看整月的花钱习惯和趋势——心疼、表扬、揶揄手松、替 Ta 操心结余、注意到某类花得突然多，都按各自人设来，几个人腔调各不相同。\n" +
          "· 人称从人设判断性别，男「他」女「她」，判断不出就叫名字；绝不许写『Ta』。严禁『看了一眼没说什么』这类空话。\n\n" +
          "【上月账单】\n" + statLines.join("\n") + "\n\n【要盘点的角色】\n" + block +
          "\n\n【输出】只输出 JSON，comments 与角色顺序一一对应、数量一致：{\"comments\":[{\"name\":\"角色名\",\"text\":\"这位角色的月度盘点\"}]}。别加解释、别加代码块。";
        const raw = await callAI(props.active, sys, [{ role: "user", content: "开始盘点。" }], { maxTokens: 6000 });
        const pd = extractJSON(raw) || {};
        const arr = Array.isArray(pd.comments) ? pd.comments : [];
        const cmts = list.map((it, i) => { const byName = arr.find(r => r && String(r.name || "").trim() === it.name); const r = byName || arr[i]; const txt = r && (r.text || r.comment) ? String(r.text || r.comment).trim() : ""; return { charId: it.id, charName: it.name, text: txt, ts: Date.now() }; }).filter(x => x.text);
        if (!cmts.length) return;
        const d1 = loadData();
        d1.monthly = d1.monthly || {};
        d1.monthly[mk] = { genAt: Date.now(), comments: cmts };
        persist(d1);
      } catch (e) {/* 静默：下次打开再试 */}
    };
    useEffect(() => {
      const lastMk = shiftMonth(thisMonthKey(), -1);
      const d = loadData();
      if ((d.monthly || {})[lastMk]) return;                                   // 这个月已经盘过
      if (!d.txns.some(x => monthKey(x.date) === lastMk)) return;              // 上月没账
      const vis = (d.settings.visibleTo || []).filter(id => (props.characters || []).some(c => c.id === id));
      if (!vis.length || !props.active) return;
      genMonthly(lastMk, vis);
    }, []);

    // ---- 视图主体 ----
    let body;
    if (view.indexOf("cur:") === 0) {
      const code = view.slice(4);
      body = h(CurView, { code, cur: curOf(code), txns: data.txns, onBack: () => setView("home"), onOpenTxn: id => setView("txn:" + id) });
    } else if (view.indexOf("txn:") === 0) {
      const id = view.slice(4);
      const txn = data.txns.find(x => x.id === id);
      if (!txn) { setView("home"); return null; }
      body = h(TxnView, {
        txn, cur: curOf(txn.currency), characters: props.characters, moods: props.moods, affinities: props.affinities,
        active: props.active, worldbook: props.worldbook, uName, toast: props.toast,
        onBack: () => setView("home"),
        onEdit: () => setAddState({ edit: txn }),
        onAddComments: cmts => updTxn(id, { comments: (txn.comments || []).concat(cmts) }),
        onDelete: () => { delTxn(id); setView("home"); }
      });
    } else {
      // 钱包式落地页
      body = h("div", { className: "h-full flex flex-col" },
        h(Head, { zh: "记账", en: "Ledger", onBack: props.onBack, right: h("button", { onClick: () => setShowSet(true), className: "active:opacity-50" }, h(GConfig, { size: 19, color: t.ink })) }),
        h(WalletHome, { data, curs, characters: props.characters, onOpenCur: code => setView("cur:" + code), visibleCount: (data.settings.visibleTo || []).length, onManageVisible: () => setShowSet(true) }),
        h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: "linear-gradient(to top, " + t.bg + " 60%, transparent)" } },
          h("button", { onClick: () => setAddState({}), className: "w-full active:opacity-85",
            style: { background: ACCENT, color: "#fff", border: "none", borderRadius: 999, padding: "15px 0", fontFamily: F_BODY, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 } },
            h(IPlus, { size: 18, color: "#fff" }), "记一笔")));
    }

    // 弹层（记一笔/编辑、设置）在任意视图之上都能弹出
    return h("div", { className: "h-full", style: { position: "relative" } },
      body,
      addState ? h(AddSheet, {
        settings: data.settings, curs, edit: addState.edit,
        onClose: () => setAddState(null),
        onAddCurrency: cur => { const d = loadData(); d.settings.currencies = (d.settings.currencies || []).concat([cur]); persist(d); },
        onAddCat: (type, cat) => { const d = loadData(); d.settings.cats[type] = (d.settings.cats[type] || []).concat([cat]); persist(d); },
        onSave: txn => {
          if (addState.edit) { updTxn(addState.edit.id, txn); setAddState(null); props.toast && props.toast("改好了"); }
          else { addTxn(txn); setAddState(null); autoReact(txn); if (props.characters && props.characters.length) setView("txn:" + txn.id); else props.toast && props.toast("记好了"); }
        }
      }) : null,
      showSet ? h(SettingsSheet, {
        settings: data.settings, characters: props.characters, txns: data.txns, toast: props.toast,
        onClose: () => setShowSet(false),
        onPersist: mutate => { const d = loadData(); mutate(d); persist(d); }
      }) : null);
  }

  // ============================================================
  // 钱包式落地页：币种卡叠着，点一张「抽出」看该币种本月富汇总
  // ============================================================
  function WalletHome(props) {
    const t = useTheme();
    const { data, curs } = props;
    const [open, setOpen] = useState(null); // 当前抽出的币种 code（一次一张）
    const [mOpen, setMOpen] = useState(false); // 上月账单卡展开
    const mk = thisMonthKey(), lmk = shiftMonth(mk, -1);

    // 本月有账的排前面
    const cards = curs.map((cur, i) => ({ cur, s: summarize(data.txns, cur.code, mk), last: summarize(data.txns, cur.code, lmk), has: data.txns.some(x => x.currency === cur.code), color: CUR_COLORS[i % CUR_COLORS.length] }))
      .sort((a, b) => (b.has ? 1 : 0) - (a.has ? 1 : 0));

    const deltaLine = (s, last, cur) => {
      if (!last.exp) return s.exp ? "上月没记支出" : "";
      const d = s.exp - last.exp, pct = Math.round(Math.abs(d) / last.exp * 100);
      if (!d) return "和上月持平";
      return "较上月" + (d > 0 ? "多" : "少") + "花 " + fmtAmt(Math.abs(d), cur) + " · " + (d > 0 ? "↑" : "↓") + pct + "%";
    };

    // 上月账单卡：上月有账才显示；统计全本地算，角色盘点批注由 Ledger 组件按月生成一次存 data.monthly
    const mrec = (data.monthly || {})[lmk];
    const mstats = curs.map(cur => ({ cur, s: summarize(data.txns, cur.code, lmk), p: summarize(data.txns, cur.code, shiftMonth(lmk, -1)) })).filter(x => x.s.exp || x.s.inc);
    const charOf = id => (props.characters || []).find(c => c.id === id);
    return h("div", { className: "flex-1 overflow-y-auto px-5 pb-28" },
      h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 16, lineHeight: 1.5 } },
        fmtMonth(mk) + " · 各币种各记各的、不换算 · 点卡片看明细"),
      mstats.length ? h("div", { style: { border: "1px solid " + t.line, borderRadius: 16, background: t.bg2, marginBottom: 14, overflow: "hidden" } },
        h("button", { onClick: () => setMOpen(o => !o), className: "w-full active:opacity-70 flex items-center gap-2", style: { padding: "12px 15px", textAlign: "left", background: "transparent", border: "none" } },
          h("span", { style: { fontSize: 15 } }, "📒"),
          h("div", { className: "flex-1 min-w-0" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, "上月账单 · " + fmtMonth(lmk)),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
              mstats.map(x => x.cur.code + " 支出 " + fmtAmt(x.s.exp, x.cur)).join(" · ") + (mrec && (mrec.comments || []).length ? " · 💬" + mrec.comments.length : ""))),
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, flexShrink: 0 } }, mOpen ? "收起 ▲" : "展开 ▼")),
        mOpen ? h("div", { style: { borderTop: "1px dashed " + t.line, padding: "12px 15px" } },
          mstats.map(({ cur, s, p }) => h("div", { key: cur.code, style: { marginBottom: 10 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, fontWeight: 600 } }, cur.label + "（" + cur.code + "）"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginTop: 2, lineHeight: 1.6 } },
              "支出 " + fmtAmt(s.exp, cur) + " · 收入 " + fmtAmt(s.inc, cur) + " · 结余 " + fmtAmt(s.net, cur) + "（" + s.count + " 笔）" +
              (s.catList.length ? "，花最多：" + s.catList.slice(0, 3).map(c => (c.emoji || "") + c.name + " " + fmtAmt(c.amount, cur)).join("、") : "") +
              (p.exp > 0 ? "；比再上月支出" + (s.exp >= p.exp ? "多 " : "少 ") + Math.abs(Math.round((s.exp - p.exp) / p.exp * 100)) + "%" : "")))),
          (mrec && (mrec.comments || []).length) ? h("div", { style: { borderTop: "1px dashed " + t.line, paddingTop: 10, marginTop: 2, display: "flex", flexDirection: "column", gap: 10 } },
            mrec.comments.map((cm, i) => {
              const ch = charOf(cm.charId);
              return h("div", { key: i, style: { display: "flex", gap: 9 } },
                ch ? h(Avatar, { character: ch, size: 30, radius: 9 }) : h("div", { style: { width: 30, height: 30, borderRadius: 9, background: "#c2bdb1", flexShrink: 0 } }),
                h("div", { style: { flex: 1, minWidth: 0 } },
                  h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.sub, marginBottom: 2 } }, cm.charName + " 的月度盘点"),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, lineHeight: 1.55 } }, cm.text)));
            })) : h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, paddingTop: 4 } }, (props.visibleCount || 0) > 0 ? "角色盘点生成中…（没配后台 API 或失败会下次打开再试）" : "设了「谁能看到我的账」后，TA 们会对整月账本盘点几句。")) : null) : null,
      h("div", { style: { display: "flex", flexDirection: "column", gap: 13 } },
        cards.map(({ cur, s, last, color }) => {
          const isOpen = open === cur.code;
          const maxCat = s.catList.length ? s.catList[0].amount : 1;
          return h("div", { key: cur.code, style: { background: color, borderRadius: 20, overflow: "hidden", color: "#f6f4ef", boxShadow: isOpen ? "0 10px 30px rgba(0,0,0,0.18)" : "0 3px 10px rgba(0,0,0,0.08)", transition: "box-shadow .2s" } },
            // 卡片正面（点击抽出/收回）
            h("button", { onClick: () => setOpen(o => o === cur.code ? null : cur.code), className: "w-full text-left active:opacity-95",
              style: { padding: "17px 18px 15px", border: "none", background: "transparent", color: "inherit", display: "block" } },
              h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
                h("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                  // 卡片金色芯片
                  h("div", { style: { width: 30, height: 22, borderRadius: 5, background: "linear-gradient(135deg,#e8cf94,#b89150)", flexShrink: 0 } }),
                  h("span", { style: { fontFamily: F_DISPLAY, fontSize: 17 } }, cur.label)),
                h("span", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.7, letterSpacing: "0.12em" } }, cur.code)),
              h("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between" } },
                h("div", null,
                  h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, opacity: 0.75, marginBottom: 2 } }, "本月支出"),
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 30, lineHeight: 1 } }, fmtAmt(s.exp, cur))),
                h("div", { style: { textAlign: "right", fontFamily: F_BODY, fontSize: 11.5, opacity: 0.85, lineHeight: 1.7 } },
                  h("div", null, "收入 " + fmtAmt(s.inc, cur)),
                  h("div", null, "结余 " + fmtAmt(s.net, cur)))),
              h("div", { style: { marginTop: 10, fontFamily: F_BODY, fontSize: 10.5, opacity: 0.7, display: "flex", justifyContent: "space-between" } },
                h("span", null, s.count + " 笔 · " + (deltaLine(s, last, cur) || "本月新记")),
                h("span", null, isOpen ? "收起 ▲" : "展开 ▼"))),
            // 抽出的富汇总
            isOpen ? h("div", { style: { padding: "4px 18px 18px" } },
              h("div", { style: { height: 1, background: "rgba(255,255,255,0.18)", margin: "2px 0 14px" } }),
              s.catList.length
                ? h("div", { style: { display: "flex", flexDirection: "column", gap: 9, marginBottom: 4 } },
                    s.catList.slice(0, 5).map(c => h("div", { key: c.name },
                      h("div", { style: { display: "flex", justifyContent: "space-between", fontFamily: F_BODY, fontSize: 12, marginBottom: 4 } },
                        h("span", null, (c.emoji ? c.emoji + " " : "") + c.name),
                        h("span", { style: { opacity: 0.9 } }, fmtAmt(c.amount, cur) + " · " + Math.round(c.amount / (s.exp || 1) * 100) + "%")),
                      h("div", { style: { height: 5, borderRadius: 5, background: "rgba(255,255,255,0.2)", overflow: "hidden" } },
                        h("div", { style: { height: "100%", width: Math.max(4, c.amount / maxCat * 100) + "%", background: "rgba(255,255,255,0.85)", borderRadius: 5 } })))))
                : h("div", { style: { fontFamily: F_BODY, fontSize: 12, opacity: 0.75, padding: "6px 0 12px" } }, "这个月还没有支出"),
              h("button", { onClick: () => props.onOpenCur(cur.code), className: "w-full active:opacity-80",
                style: { marginTop: 14, background: "rgba(255,255,255,0.16)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 0", fontFamily: F_BODY, fontSize: 13, fontWeight: 600 } },
                "查看流水 & 按月对比 ›")) : null);
        })),
      props.visibleCount
        ? h("button", { onClick: props.onManageVisible, className: "active:opacity-60", style: { display: "block", margin: "18px auto 0", fontFamily: F_BODY, fontSize: 11, color: t.fog, background: "transparent", border: "none" } },
            props.visibleCount + " 位角色能看到你的记账动态 · 点这调整")
        : h("button", { onClick: props.onManageVisible, className: "active:opacity-60", style: { display: "block", margin: "18px auto 0", fontFamily: F_BODY, fontSize: 11, color: t.fog, background: "transparent", border: "none" } },
            "还没让任何角色看到你的账 · 去设置"));
  }

  // ============================================================
  // 币种详情：切月份 + 汇总 + 分类明细 + 当月流水
  // ============================================================
  function CurView(props) {
    const t = useTheme();
    const { code, cur, txns } = props;
    const [mk, setMk] = useState(thisMonthKey());
    const s = summarize(txns, code, mk);
    const monthTxns = txns.filter(x => x.currency === code && monthKey(x.date) === mk)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const maxCat = s.catList.length ? s.catList[0].amount : 1;

    const navBtn = (label, delta) => h("button", { onClick: () => setMk(m => shiftMonth(m, delta)), className: "active:opacity-50",
      style: { fontFamily: F_DISPLAY, fontSize: 22, color: t.fog, width: 40, textAlign: "center", lineHeight: 1, background: "transparent", border: "none" } }, label);

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: cur.label, en: code, onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 16 } },
          navBtn("‹", -1),
          h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, minWidth: 110, textAlign: "center" } }, fmtMonth(mk)),
          navBtn("›", 1)),
        h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "16px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", textAlign: "center" } },
          [["支出", s.exp, EXP], ["收入", s.inc, INC], ["结余", s.net, t.ink]].map(([lab, val, col], i) =>
            h("div", { key: i, style: { flex: 1 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 4 } }, lab),
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: col } }, fmtAmt(val, cur))))),
        s.catList.length ? h("div", { style: { marginBottom: 22 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 10, letterSpacing: "0.05em" } }, "支出分类"),
          h("div", { style: { display: "flex", flexDirection: "column", gap: 11 } },
            s.catList.map(c => h("div", { key: c.name },
              h("div", { style: { display: "flex", justifyContent: "space-between", fontFamily: F_BODY, fontSize: 12.5, color: t.ink, marginBottom: 4 } },
                h("span", null, (c.emoji ? c.emoji + " " : "") + c.name),
                h("span", null, fmtAmt(c.amount, cur) + "  ·  " + Math.round(c.amount / (s.exp || 1) * 100) + "%")),
              h("div", { style: { height: 6, borderRadius: 6, background: t.line, overflow: "hidden" } },
                h("div", { style: { height: "100%", width: Math.max(3, c.amount / maxCat * 100) + "%", background: ACCENT, borderRadius: 6 } })))))) : null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 10, letterSpacing: "0.05em" } }, "流水 · " + monthTxns.length + " 笔"),
        monthTxns.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          monthTxns.map(x => h(TxnRow, { key: x.id, txn: x, cur, onClick: () => props.onOpenTxn(x.id) })))
          : h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "30px 0" } }, "这个月还没有记账")));
  }

  // 单条流水行
  function TxnRow(props) {
    const t = useTheme();
    const { txn, cur } = props;
    const isInc = txn.type === "income";
    return h("button", { onClick: props.onClick, className: "w-full active:opacity-70 text-left",
      style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 12 } },
      h("div", { style: { width: 34, height: 34, borderRadius: 10, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 } }, txn.catEmoji || (isInc ? "💰" : "💸")),
      h("div", { style: { flex: 1, minWidth: 0 } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, txn.category),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          fmtDay(txn.date) + (txn.note ? " · " + txn.note : "") + ((txn.comments || []).length ? " · 💬" + txn.comments.length : ""))),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: isInc ? INC : t.ink, flexShrink: 0 } },
        (isInc ? "+" : "-") + fmtAmt(txn.amount, cur)));
  }

  // ============================================================
  // 单笔详情：账 + 编辑/删除 + 角色批注（多选一次生成）
  // ============================================================
  function TxnView(props) {
    const t = useTheme();
    const { txn, cur } = props;
    const [pick, setPick] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false);
    const isInc = txn.type === "income";
    const comments = txn.comments || [];
    const charById = id => (props.characters || []).find(c => c.id === id);

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "这笔账", en: isInc ? "Income" : "Expense", onBack: props.onBack,
        right: h("div", { style: { display: "flex", gap: 16, alignItems: "center" } },
          h("button", { onClick: props.onEdit, className: "active:opacity-50" }, h(IPencil, { size: 17, color: t.ink })),
          h("button", { onClick: () => setConfirmDel(true), className: "active:opacity-50" }, h(ITrash, { size: 18, color: t.fog }))) }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
        h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 18, padding: "22px 20px", textAlign: "center", marginBottom: 22 } },
          h("div", { style: { fontSize: 30, marginBottom: 8 } }, txn.catEmoji || (isInc ? "💰" : "💸")),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 34, color: isInc ? INC : t.ink, lineHeight: 1 } },
            (isInc ? "+" : "-") + fmtAmt(txn.amount, cur)),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginTop: 10 } },
            txn.category + " · " + cur.label + " · " + fmtDay(txn.date)),
          txn.note ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, marginTop: 8, lineHeight: 1.5 } }, txn.note) : null),
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, letterSpacing: "0.05em" } }, "角色批注" + (comments.length ? " · " + comments.length : "")),
          (props.characters && props.characters.length)
            ? h("button", { onClick: () => setPick(true), className: "active:opacity-70",
                style: { fontFamily: F_BODY, fontSize: 12, color: "#fff", background: ACCENT, border: "none", borderRadius: 999, padding: "6px 14px" } },
                comments.length ? "再让 TA 们说说" : "让角色批注")
            : null),
        comments.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
          comments.map((cm, i) => {
            const ch = charById(cm.charId);
            return h("div", { key: i, style: { display: "flex", gap: 10 } },
              ch ? h(Avatar, { character: ch, size: 34, radius: 10 })
                 : h("div", { style: { width: 34, height: 34, borderRadius: 10, background: "#c2bdb1", flexShrink: 0 } }),
              h("div", { style: { flex: 1, minWidth: 0 } },
                h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 } }, cm.charName,
                  cm.auto ? h("span", { style: { fontSize: 9.5, color: GOLD, border: "1px solid " + GOLD + "55", borderRadius: 999, padding: "1px 7px" } },
                    cm.event === "big" ? "自己注意到 · 大额" : cm.event === "freq" ? "自己注意到 · 频率" : cm.event === "night" ? "自己注意到 · 深夜" : cm.event === "income" ? "自己注意到 · 进账" : "自己注意到") : null),
                h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, borderTopLeftRadius: 3, padding: "9px 12px", fontFamily: F_BODY, fontSize: 13, color: t.ink, lineHeight: 1.55 } }, cm.text)));
          }))
          : h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, textAlign: "center", padding: "20px 0" } },
              (props.characters && props.characters.length) ? "还没人看过这笔账，点上面让 TA 们说说" : "先去『名录』建个角色")),
      pick ? h(CommentPicker, {
        characters: props.characters, moods: props.moods, affinities: props.affinities, existing: comments.map(c => c.charId),
        txn, cur, active: props.active, worldbook: props.worldbook, uName: props.uName, toast: props.toast,
        onClose: () => setPick(false),
        onDone: cmts => { props.onAddComments(cmts); setPick(false); }
      }) : null,
      confirmDel ? h(ConfirmDialog, { title: "删掉这笔账？", body: "删掉后连同角色批注一起没了。", confirmLabel: "删掉", danger: true, onConfirm: props.onDelete, onCancel: () => setConfirmDel(false) }) : null);
  }

  // ============================================================
  // 批注角色多选 → 一次生成（含全选）
  // ============================================================
  function CommentPicker(props) {
    const t = useTheme();
    const [sel, setSel] = useState([]);
    const [busy, setBusy] = useState(false);
    const lift = useKbLift();
    const chars = props.characters || [];
    const moodOf = id => { const mo = props.moods && props.moods[id]; return mo && mo.label ? String(mo.label) : ""; };
    const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : s.concat([id]));
    const allOn = sel.length === chars.length && chars.length > 0;
    const toggleAll = () => setSel(allOn ? [] : chars.map(c => c.id));

    const run = async () => {
      if (!sel.length || busy) return;
      setBusy(true);
      try {
        const list = sel.map(id => { const c = chars.find(x => x.id === id); return { id, name: c.name, persona: c.persona || "", mood: moodOf(id), aff: props.affinities ? props.affinities[id] : null }; });
        const outs = await genComments(props.active, props.txn, props.cur, list, props.uName, props.worldbook);
        const cmts = list.map((it, i) => ({ charId: it.id, charName: it.name, text: outs[i].text, ts: Date.now() })).filter(c => c.text);
        if (!cmts.length) { props.toast && props.toast("这次没生成出来，再试一次"); setBusy(false); return; }
        if (cmts.length < list.length) props.toast && props.toast("有 " + (list.length - cmts.length) + " 位没接上话，可再点一次补上");
        props.onDone(cmts);
      } catch (e) { props.toast && props.toast("生成失败，重试一下"); setBusy(false); }
    };

    return h("div", { style: { position: "absolute", inset: 0, zIndex: 50, background: "rgba(20,18,15,0.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }, onClick: props.onClose },
      h("div", { onClick: e => e.stopPropagation(), style: { background: t.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", maxHeight: "78%", display: "flex", flexDirection: "column", marginBottom: lift || 0, transition: "margin-bottom .18s ease" } },
        h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 19, color: t.ink } }, "让谁看看这笔账"),
          (!busy && chars.length > 1) ? h("button", { onClick: toggleAll, className: "active:opacity-70",
            style: { fontFamily: F_BODY, fontSize: 12, color: allOn ? t.sub : ACCENT, background: "transparent", border: "none", flexShrink: 0, paddingTop: 3 } }, allOn ? "取消全选" : "全选") : null),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 16, lineHeight: 1.5 } }, "可多选，一次生成全部——省一次 API。TA 们会按各自人设和此刻心情说一句。"),
        busy
          ? h("div", { style: { padding: "40px 0", textAlign: "center", fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "TA 们正在看你的账本…")
          : h(Fragment, null,
              h("div", { style: { flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 } },
                chars.map(c => {
                  const on = sel.includes(c.id); const md = moodOf(c.id);
                  return h("button", { key: c.id, onClick: () => toggle(c.id), className: "active:opacity-80 text-left",
                    style: { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 12, background: on ? ACCENT : t.bg2, border: "1px solid " + (on ? ACCENT : t.line) } },
                    h(Avatar, { character: c, size: 32, radius: 9 }),
                    h("div", { style: { minWidth: 0, flex: 1 } },
                      h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: on ? "#fff" : t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.name),
                      md ? h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: on ? "rgba(255,255,255,0.75)" : t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, md) : null));
                })),
              h("button", { onClick: run, disabled: !sel.length, className: "w-full active:opacity-85",
                style: { background: sel.length ? ACCENT : t.line, color: "#fff", border: "none", borderRadius: 999, padding: "14px 0", fontFamily: F_BODY, fontSize: 14.5, fontWeight: 600 } },
                sel.length ? "生成批注（" + sel.length + " 人）" : "选一个或几个角色"))));
  }

  // ============================================================
  // 记一笔（新增 / 编辑）
  // ============================================================
  function AddSheet(props) {
    const t = useTheme();
    const { curs, edit } = props;
    const [type, setType] = useState(edit ? edit.type : "expense");
    const [amount, setAmount] = useState(edit ? String(edit.amount) : "");
    const [code, setCode] = useState(edit ? edit.currency : (curs[0] ? curs[0].code : "CAD"));
    const [cat, setCat] = useState(edit ? { name: edit.category, emoji: edit.catEmoji || "" } : null);
    const [date, setDate] = useState(edit ? edit.date : todayStr());
    const [note, setNote] = useState(edit ? (edit.note || "") : "");
    const [dialog, setDialog] = useState(null); // {kind:'cur'|'cat'}
    const lift = useKbLift();

    const catList = (props.settings.cats[type] || []);
    const cur = curs.find(c => c.code === code) || curs[0];

    const submitCat = vals => { const nc = { name: (vals.name || "").trim(), emoji: (vals.emoji || "").trim() }; if (!nc.name) return; props.onAddCat(type, nc); setCat(nc); setDialog(null); };
    const submitCur = vals => {
      const codeIn = (vals.code || "").trim().toUpperCase(); const label = (vals.label || "").trim();
      if (!codeIn || !label) return;
      if (curs.some(c => c.code === codeIn)) { setCode(codeIn); setDialog(null); return; }
      const nc = { code: codeIn, symbol: (vals.symbol || "").trim() || codeIn, label: label };
      props.onAddCurrency(nc); setCode(nc.code); setDialog(null);
    };

    const canSave = amount && Number(amount) > 0 && cat;
    const save = () => {
      if (!canSave) return;
      if (edit) {
        props.onSave({ date, type, amount: Math.round(Number(amount) * 100) / 100, currency: code, category: cat.name, catEmoji: cat.emoji || "", note: note.trim() });
      } else {
        props.onSave({ id: "l" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), ts: Date.now(), date, type, amount: Math.round(Number(amount) * 100) / 100, currency: code, category: cat.name, catEmoji: cat.emoji || "", note: note.trim(), comments: [] });
      }
    };

    const seg = (val, labelZh) => h("button", { onClick: () => { setType(val); setCat(null); }, className: "flex-1 active:opacity-80",
      style: { padding: "9px 0", borderRadius: 10, fontFamily: F_BODY, fontSize: 13.5, fontWeight: 600, border: "none",
        background: type === val ? (val === "income" ? INC : EXP) : "transparent", color: type === val ? "#fff" : t.sub } }, labelZh);

    return h("div", { style: { position: "absolute", inset: 0, zIndex: 50, background: "rgba(20,18,15,0.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }, onClick: props.onClose },
      h("div", { onClick: e => e.stopPropagation(), style: { background: t.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "8px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)", maxHeight: "90%", display: "flex", flexDirection: "column", marginBottom: lift || 0, transition: "margin-bottom .18s ease" } },
        h("div", { style: { width: 38, height: 4, borderRadius: 4, background: t.line, margin: "0 auto 14px" } }),
        h("div", { style: { display: "flex", gap: 4, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: 3, marginBottom: 16 } },
          seg("expense", "支出"), seg("income", "收入")),
        h("div", { style: { flex: 1, overflowY: "auto" } },
          h("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 } },
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 30, color: t.ink } }, cur ? cur.symbol : ""),
            h("input", { value: amount, onChange: e => setAmount(e.target.value.replace(/[^0-9.]/g, "")), inputMode: "decimal", placeholder: "0",
              style: { flex: 1, fontFamily: F_DISPLAY, fontSize: 34, color: t.ink, background: "transparent", border: "none", borderBottom: "1.5px solid " + t.line, outline: "none", padding: "2px 0" } })),
          h("div", { style: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 20 } },
            curs.map(c => h("button", { key: c.code, onClick: () => setCode(c.code), className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 12.5, color: code === c.code ? "#fff" : t.sub, background: code === c.code ? ACCENT : t.bg2, border: "1px solid " + (code === c.code ? ACCENT : t.line), borderRadius: 999, padding: "6px 13px" } },
              c.label + " " + c.code)),
            h("button", { onClick: () => setDialog({ kind: "cur" }), className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, background: t.bg2, border: "1px dashed " + t.line, borderRadius: 999, padding: "6px 13px" } }, "＋币种")),
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 10, letterSpacing: "0.05em" } }, "分类"),
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, marginBottom: 20 } },
            catList.map(c => { const on = cat && cat.name === c.name;
              return h("button", { key: c.name, onClick: () => setCat(c), className: "active:opacity-70",
                style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "11px 0", borderRadius: 12, background: on ? ACCENT : t.bg2, border: "1px solid " + (on ? ACCENT : t.line) } },
                h("span", { style: { fontSize: 20 } }, c.emoji || "•"),
                h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: on ? "#fff" : t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" } }, c.name)); }),
            h("button", { onClick: () => setDialog({ kind: "cat" }), className: "active:opacity-70",
              style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "11px 0", borderRadius: 12, background: t.bg2, border: "1px dashed " + t.line, color: t.fog } },
              h("span", { style: { fontSize: 20, lineHeight: 1 } }, "＋"),
              h("span", { style: { fontFamily: F_BODY, fontSize: 11 } }, "自定义"))),
          h("div", { style: { display: "flex", gap: 10, marginBottom: 12 } },
            h("input", { type: "date", value: date, onChange: e => setDate(e.target.value),
              style: { flex: 1, fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "10px 12px", outline: "none" } })),
          h("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "备注（可留空）", maxLength: 60,
            style: { width: "100%", fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "10px 12px", outline: "none", marginBottom: 18 } })),
        h("button", { onClick: save, disabled: !canSave, className: "w-full active:opacity-85",
          style: { background: canSave ? ACCENT : t.line, color: "#fff", border: "none", borderRadius: 999, padding: "14px 0", fontFamily: F_BODY, fontSize: 15, fontWeight: 600 } },
          edit ? "保存修改" : "记好了")),
      dialog && dialog.kind === "cat" ? h(FieldDialog, { title: "新分类", submitLabel: "添加",
        fields: [{ key: "name", label: "名称", placeholder: "如 咖啡", required: true }, { key: "emoji", label: "Emoji（可留空）", placeholder: "☕", maxLength: 4 }],
        onSubmit: submitCat, onCancel: () => setDialog(null) }) : null,
      dialog && dialog.kind === "cur" ? h(FieldDialog, { title: "新币种", submitLabel: "添加",
        fields: [{ key: "label", label: "名称", placeholder: "如 日元", required: true }, { key: "code", label: "三字母代码", placeholder: "JPY", maxLength: 4, required: true }, { key: "symbol", label: "符号（可留空）", placeholder: "¥", maxLength: 3 }],
        onSubmit: submitCur, onCancel: () => setDialog(null) }) : null);
  }

  // ============================================================
  // 设置：可见性 + 管理币种(增删改) + 管理分类(增删改)
  // ============================================================
  function SettingsSheet(props) {
    const t = useTheme();
    const s = props.settings;
    const [sel, setSel] = useState((s.visibleTo || []).slice());
    const [tab, setTab] = useState("visible"); // visible | cur | cat
    const [catType, setCatType] = useState("expense");
    const [dialog, setDialog] = useState(null); // {kind, ...}
    const [confirm, setConfirm] = useState(null); // {title,body,onConfirm}
    const chars = props.characters || [];
    const curs = s.currencies || [];
    const cats = (s.cats && s.cats[catType]) || [];

    const toggle = id => setSel(x => x.includes(id) ? x.filter(y => y !== id) : x.concat([id]));
    const saveVisible = () => { props.onPersist(d => { d.settings.visibleTo = sel; }); props.onClose(); };

    // 币种：改（label/symbol，code 锁定）、删（有账则拦）
    const editCur = c => setDialog({ kind: "editcur", code: c.code, label: c.label, symbol: c.symbol });
    const submitEditCur = vals => { props.onPersist(d => { d.settings.currencies = d.settings.currencies.map(c => c.code === dialog.code ? { ...c, label: (vals.label || "").trim() || c.label, symbol: (vals.symbol || "").trim() || c.symbol } : c); }); setDialog(null); };
    const delCur = c => {
      const used = (props.txns || []).some(x => x.currency === c.code);
      if (used) { props.toast && props.toast("这个币种下还有账，删不了"); return; }
      if (curs.length <= 1) { props.toast && props.toast("至少留一个币种"); return; }
      setConfirm({ title: "删掉「" + c.label + "」？", body: "这个币种没有任何账，可安全删除。", onConfirm: () => { props.onPersist(d => { d.settings.currencies = d.settings.currencies.filter(x => x.code !== c.code); }); setConfirm(null); } });
    };
    const addCur = () => setDialog({ kind: "addcur" });
    const submitAddCur = vals => { const code = (vals.code || "").trim().toUpperCase(), label = (vals.label || "").trim(); if (!code || !label) return; if (curs.some(c => c.code === code)) { setDialog(null); return; } props.onPersist(d => { d.settings.currencies = d.settings.currencies.concat([{ code, label, symbol: (vals.symbol || "").trim() || code }]); }); setDialog(null); };

    // 分类：改（name/emoji，并同步已有 txn 的分类名/emoji）、删
    const editCat = c => setDialog({ kind: "editcat", old: c.name, name: c.name, emoji: c.emoji });
    const submitEditCat = vals => {
      const name = (vals.name || "").trim(), emoji = (vals.emoji || "").trim(); if (!name) return;
      props.onPersist(d => {
        d.settings.cats[catType] = d.settings.cats[catType].map(c => c.name === dialog.old ? { name, emoji } : c);
        d.txns = d.txns.map(x => (x.type === catType && x.category === dialog.old) ? { ...x, category: name, catEmoji: emoji } : x);
      });
      setDialog(null);
    };
    const delCat = c => {
      if (cats.length <= 1) { props.toast && props.toast("至少留一个分类"); return; }
      const used = (props.txns || []).some(x => x.type === catType && x.category === c.name);
      setConfirm({ title: "删掉分类「" + c.name + "」？", body: used ? "已经记过的账会保留原样，只是以后记账不再有这个分类。" : "以后记账不再出现这个分类。", onConfirm: () => { props.onPersist(d => { d.settings.cats[catType] = d.settings.cats[catType].filter(x => x.name !== c.name); }); setConfirm(null); } });
    };
    const addCat = () => setDialog({ kind: "addcat" });
    const submitAddCat = vals => { const name = (vals.name || "").trim(); if (!name) return; if (cats.some(c => c.name === name)) { setDialog(null); return; } props.onPersist(d => { d.settings.cats[catType] = d.settings.cats[catType].concat([{ name, emoji: (vals.emoji || "").trim() }]); }); setDialog(null); };

    const tabBtn = (k, label) => h("button", { onClick: () => setTab(k), className: "flex-1 active:opacity-80",
      style: { padding: "8px 0", borderRadius: 9, fontFamily: F_BODY, fontSize: 12.5, fontWeight: 600, border: "none", background: tab === k ? ACCENT : "transparent", color: tab === k ? "#fff" : t.sub } }, label);

    const rowStyle = { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 12, background: t.bg2, border: "1px solid " + t.line };
    const iconBtn = (Icon, onClick, color) => h("button", { onClick, className: "active:opacity-50", style: { background: "transparent", border: "none", padding: 4 } }, h(Icon, { size: 16, color: color || t.fog }));

    return h("div", { style: { position: "absolute", inset: 0, zIndex: 50, background: "rgba(20,18,15,0.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }, onClick: props.onClose },
      h("div", { onClick: e => e.stopPropagation(), style: { background: t.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "18px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)", maxHeight: "84%", display: "flex", flexDirection: "column" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 19, color: t.ink, marginBottom: 14, textAlign: "center" } }, "记账设置"),
        h("div", { style: { display: "flex", gap: 4, background: t.bg2, border: "1px solid " + t.line, borderRadius: 11, padding: 3, marginBottom: 16 } },
          tabBtn("visible", "谁能看到"), tabBtn("cur", "币种"), tabBtn("cat", "分类")),
        h("div", { style: { flex: 1, overflowY: "auto" } },
          // ---- 可见性 ----
          tab === "visible" ? h(Fragment, null,
            h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 14, lineHeight: 1.55 } }, "被选中的角色在聊天里能自然感知你本月的真实收支和几笔大开销，按人设关心或调侃你。只是让 TA 知道，不碰任何余额。"),
            chars.length ? chars.map(c => { const on = sel.includes(c.id);
              return h("button", { key: c.id, onClick: () => toggle(c.id), className: "w-full active:opacity-80", style: { ...rowStyle, marginBottom: 8 } },
                h(Avatar, { character: c, size: 36, radius: 10 }),
                h("span", { style: { flex: 1, textAlign: "left", fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, c.name),
                h("div", { style: { width: 22, height: 22, borderRadius: 999, border: "1.5px solid " + (on ? ACCENT : t.line), background: on ? ACCENT : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } }, on ? h(ICheck, { size: 13, color: "#fff" }) : null));
            }) : h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "20px 0" } }, "先去『名录』建个角色")) : null,
          // ---- 币种管理 ----
          tab === "cur" ? h(Fragment, null,
            curs.map(c => h("div", { key: c.code, style: { ...rowStyle, marginBottom: 8 } },
              h("div", { style: { width: 30, height: 22, borderRadius: 5, background: "linear-gradient(135deg,#e8cf94,#b89150)", flexShrink: 0 } }),
              h("div", { style: { flex: 1, minWidth: 0 } },
                h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, c.label + " " + c.symbol),
                h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, letterSpacing: "0.08em" } }, c.code)),
              iconBtn(IPencil, () => editCur(c), t.sub), iconBtn(ITrash, () => delCur(c)))),
            h("button", { onClick: addCur, className: "w-full active:opacity-70", style: { ...rowStyle, justifyContent: "center", border: "1px dashed " + t.line, color: t.fog, fontFamily: F_BODY, fontSize: 13 } }, "＋ 添加币种")) : null,
          // ---- 分类管理 ----
          tab === "cat" ? h(Fragment, null,
            h("div", { style: { display: "flex", gap: 4, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: 3, marginBottom: 14 } },
              ["expense", "income"].map(k => h("button", { key: k, onClick: () => setCatType(k), className: "flex-1 active:opacity-80",
                style: { padding: "7px 0", borderRadius: 8, fontFamily: F_BODY, fontSize: 12.5, fontWeight: 600, border: "none", background: catType === k ? (k === "income" ? INC : EXP) : "transparent", color: catType === k ? "#fff" : t.sub } }, k === "income" ? "收入分类" : "支出分类"))),
            cats.map(c => h("div", { key: c.name, style: { ...rowStyle, marginBottom: 8 } },
              h("span", { style: { fontSize: 19, width: 24, textAlign: "center" } }, c.emoji || "•"),
              h("span", { style: { flex: 1, fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, c.name),
              iconBtn(IPencil, () => editCat(c), t.sub), iconBtn(ITrash, () => delCat(c)))),
            h("button", { onClick: addCat, className: "w-full active:opacity-70", style: { ...rowStyle, justifyContent: "center", border: "1px dashed " + t.line, color: t.fog, fontFamily: F_BODY, fontSize: 13 } }, "＋ 添加分类")) : null),
        // 底部主按钮（可见性 tab 才需要保存；管理 tab 即时生效，给「完成」）
        h("button", { onClick: tab === "visible" ? saveVisible : props.onClose, className: "w-full active:opacity-85",
          style: { marginTop: 14, background: ACCENT, color: "#fff", border: "none", borderRadius: 999, padding: "14px 0", fontFamily: F_BODY, fontSize: 14.5, fontWeight: 600 } },
          tab === "visible" ? "保存" : "完成")),
      // 弹窗们
      dialog && dialog.kind === "addcur" ? h(FieldDialog, { title: "新币种", submitLabel: "添加", fields: [{ key: "label", label: "名称", placeholder: "如 日元", required: true }, { key: "code", label: "三字母代码", placeholder: "JPY", maxLength: 4, required: true }, { key: "symbol", label: "符号（可留空）", placeholder: "¥", maxLength: 3 }], onSubmit: submitAddCur, onCancel: () => setDialog(null) }) : null,
      dialog && dialog.kind === "editcur" ? h(FieldDialog, { title: "改币种", submitLabel: "保存", fields: [{ key: "code", label: "代码（不可改）", value: dialog.code, locked: true }, { key: "label", label: "名称", value: dialog.label, required: true }, { key: "symbol", label: "符号", value: dialog.symbol, maxLength: 3 }], onSubmit: submitEditCur, onCancel: () => setDialog(null) }) : null,
      dialog && dialog.kind === "addcat" ? h(FieldDialog, { title: "新分类", submitLabel: "添加", fields: [{ key: "name", label: "名称", placeholder: "如 咖啡", required: true }, { key: "emoji", label: "Emoji（可留空）", placeholder: "☕", maxLength: 4 }], onSubmit: submitAddCat, onCancel: () => setDialog(null) }) : null,
      dialog && dialog.kind === "editcat" ? h(FieldDialog, { title: "改分类", submitLabel: "保存", fields: [{ key: "name", label: "名称", value: dialog.name, required: true }, { key: "emoji", label: "Emoji", value: dialog.emoji, maxLength: 4 }], onSubmit: submitEditCat, onCancel: () => setDialog(null) }) : null,
      confirm ? h(ConfirmDialog, { title: confirm.title, body: confirm.body, confirmLabel: "删掉", danger: true, onConfirm: confirm.onConfirm, onCancel: () => setConfirm(null) }) : null);
  }

  window.Ledger = Ledger;
})();
