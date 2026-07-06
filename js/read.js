// ============================================================
// 一起读（read）—— 仿电子书架 + 邀角色一起看 + 批注 + 半屏讨论 + 总结喂记忆库
// 书的正文存 IndexedDB（本地，不进云同步，避免撑爆存档）；
// 书的元数据 + 阅读进度 + 批注存 localStorage x_read_books（随云同步）。
// 模型调用直接走全局 callAI；喂全局记忆库靠 props.onAddMemory 回调。
// ============================================================
(function () {
  // ---- IndexedDB：只放正文，key=bookId，value=全文字符串 ----
  const DB_NAME = "LisaReadDB", STORE = "books";
  function idb() {
    return new Promise(function (res, rej) {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbPut(id, text) {
    return idb().then(function (db) { return new Promise(function (res, rej) {
      const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(text, id);
      tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); };
    }); });
  }
  function idbGet(id) {
    return idb().then(function (db) { return new Promise(function (res, rej) {
      const rq = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      rq.onsuccess = function () { res(rq.result || ""); }; rq.onerror = function () { rej(rq.error); };
    }); });
  }
  function idbDel(id) {
    return idb().then(function (db) { return new Promise(function (res, rej) {
      const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id);
      tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); };
    }); });
  }

  // ---- 元数据存取 ----
  function loadBooks() { return loadJSON("x_read_books", []); }
  function saveBooks(list) { saveJSON("x_read_books", list); }

  const PAGE_CHARS = 1600; // 每页目标字数（按段落边界切）
  function paginate(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    // 把「没换行的超长大段」按句末标点切成 ~500 字的小块，保证有足够段落锚点、也能正常翻页；正常段落不动
    const paras = [];
    raw.forEach(function (p) {
      if (p.length <= PAGE_CHARS) { paras.push(p); return; }
      const sents = p.match(/[^。！？!?…]*[。！？!?…]+|[^。！？!?…]+$/g) || [p];
      let buf = "";
      sents.forEach(function (s) {
        if (buf && (buf + s).length > 500) { paras.push(buf); buf = s; } else buf += s;
      });
      if (buf) paras.push(buf);
    });
    if (!paras.length) return [[""]];
    const pages = []; let cur = []; let len = 0;
    paras.forEach(function (p) {
      cur.push(p); len += p.length;
      if (len >= PAGE_CHARS) { pages.push(cur); cur = []; len = 0; }
    });
    if (cur.length) pages.push(cur);
    return pages.length ? pages : [[""]];
  }
  const spineColor = function (id) {
    const pal = ["#5a6357", "#4f5a63", "#7a6a5a", "#6d5a78", "#33322e", "#8a5a4a"];
    let s = 0; for (let i = 0; i < id.length; i++) s = (s + id.charCodeAt(i)) % pal.length;
    return pal[s];
  };

  // ---- 模型：让角色对给定段落（可跨多页）批注若干条 ----
  //   paras 是一段扁平的段落文本数组（可能跨好几页）；返回 [{i, note}]，i 是 paras 里的 0 基下标。
  //   输出走「逐行」而非 JSON 数组——弱模型逐行写「正好 N 条」比塞 JSON 数组可靠得多。
  async function genAnnotations(active, char, profile, worldbook, paras, n, prior) {
    const uName = (profile && profile.name) || "对方";
    const maxPara = paras.length;
    const numbered = paras.map(function (p, i) { return "[" + (i + 1) + "] " + p; }).join("\n");
    const sys = (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "") +
      "你在和「" + uName + "」一起读一本书，在书页边上写旁批。完全代入下面这个角色，用【你自己的人设、口吻、见识、脾气】去读、去反应——共鸣、吐槽、联想到自己、看穿人物心机、被某句戳到、和作者较劲都行。别写读后感八股、别复述剧情，短、有你这个人的味道。\n\n【你的人设】\n" + (char.persona || "（暂无设定）") +
      (worldbook && worldbook.trim() ? "\n\n【世界书】\n" + worldbook.trim() : "") +
      (prior && prior.length ? "\n\n【你之前已经批注过的（别重复这些）】\n" + prior.map(function (a) { return "· " + a.note; }).join("\n") : "") +
      "\n\n【正文（按段落编号，可能跨好几页）】\n" + numbered +
      "\n\n请就上面这段，写**正好 " + n + " 条**批注，可以分布在不同段落、也可多条落在同一段。\n【输出格式·务必严格遵守】只输出 " + n + " 行，每行一条批注，格式为 `段<段号>：<批注>`。示例：\n段3：这人嘴上硬，心里早就软了。\n段3：换我早翻脸走人了。\n段8：一碗黄酒二两黄豆，写得我都馋了。\n不要写 JSON、不要总起语、不要空行、不要任何多余的话——就这 " + n + " 行，一行都不能少。";
    // 放宽 token 预算：Gemini 等「思考型」模型会先想再答、思考也吃输出 token，预算太紧会想到一半就停（只出一两条）。
    // 中转站按次计费、输出长短不额外收费，所以给足空间不心疼。
    const raw = await callAI(active, sys, [{ role: "user", content: "写满 " + n + " 条，每行一条。" }], { maxTokens: Math.min(8000, 1500 + n * 400) });
    // 先把「段N：」标记前都断行——兼容弱模型把多条挤在一行/一段的情况
    const norm = String(raw || "").replace(/```/g, "").replace(/\s*(段\s*\d+\s*[：:])/g, "\n$1");
    const lines = norm.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    const out = [];
    let spread = 0;
    lines.forEach(function (line) {
      if (/[：:]\s*$/.test(line)) return;                        // 以冒号结尾的开场白（如「好的，这就来：」）
      if (/^(好的|没问题|以下|如下|这就|收到|明白|ok|okay)/i.test(line) && line.length < 14) return; // 短套话
      const m = line.match(/^\s*(?:段|第)?\s*\[?\s*(\d+)\s*\]?\s*[：:.、)\-\s]+(.+)$/);
      let para, note;
      if (m) { para = Number(m[1]); note = m[2].trim(); }
      else { note = line.replace(/^[\s\d.、)\]［］【】\[\-—·•]+/, "").trim(); para = null; } // 没给段号，稍后铺开
      if (!note || note.length < 2) return;
      if (para == null) { para = Math.min(maxPara, 1 + Math.floor(spread * maxPara / Math.max(1, n))); spread++; }
      if (!(para >= 1)) para = 1;
      if (para > maxPara) para = maxPara;
      out.push({ i: para - 1, note: note });
    });
    return out.slice(0, n);
  }

  // ---- 模型：半屏讨论 ----
  async function discussReply(active, char, profile, worldbook, book, paras, anns, history, userMsg) {
    const uName = (profile && profile.name) || "对方";
    const passage = paras.join("\n").slice(0, 2200);
    const annText = anns.length ? anns.map(function (a) { return "· " + a.note; }).join("\n") : "";
    const hist = history.slice(-16).map(function (m) { return (m.role === "user" ? uName : char.name) + "：" + m.content; }).join("\n");
    const sys = (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "") +
      "你在和「" + uName + "」一起读《" + (book.title || "这本书") + "》，此刻你俩正就读到的这一段聊剧情。完全代入你的人设，像和朋友边读边讨论那样自然说话——有观点、会追问、会八卦人物、会和 " + uName + " 的看法碰撞，别客套别总结陈词。\n\n【你的人设】\n" + (char.persona || "（暂无设定）") +
      (worldbook && worldbook.trim() ? "\n\n【世界书】\n" + worldbook.trim() : "") +
      "\n\n【你俩正读到的这一页】\n" + passage +
      (annText ? "\n\n【你刚在这页写下的批注】\n" + annText : "") +
      (hist ? "\n\n【你俩刚才的讨论】\n" + hist : "") +
      "\n\n【输出】只输出 JSON：{\"say\":[\"气泡1\",\"气泡2\"]}。拆成 1~3 条短气泡，像即时通讯，别加名字前缀、别旁白括号、别 markdown。";
    const raw = await callAI(active, sys, [{ role: "user", content: userMsg }], { maxTokens: 900 });
    const parsed = extractJSON(raw);
    const say = (parsed && Array.isArray(parsed.say)) ? parsed.say.filter(Boolean) : null;
    return say && say.length ? say : [String(raw || "").replace(/^\{|\}$/g, "").trim() || "……"];
  }

  // ---- 模型：结束时把这次共读总结成记忆 ----
  async function summarizeSession(active, char, profile, book, anns, history) {
    const uName = (profile && profile.name) || "对方";
    const annText = anns.slice(-12).map(function (a) { return "· " + a.note; }).join("\n");
    const hist = history.slice(-24).map(function (m) { return (m.role === "user" ? uName : char.name) + "：" + m.content; }).join("\n");
    if (!annText && !hist) return "";
    const sys = "把下面这次「你和 " + uName + " 一起读《" + (book.title || "一本书") + "》」的经历，浓缩成 1~3 句会长期记住的事实（用你的第一人称视角）：你们一起读了什么、你对内容/人物的关键看法、和 " + uName + " 讨论时碰出的观点或默契、Ta 让你印象深的反应。只写沉淀下来的东西，别流水账。只输出这几句话本身。\n\n【你的人设】\n" + (char.persona || "").slice(0, 300);
    const u = (annText ? "【你的批注】\n" + annText + "\n\n" : "") + (hist ? "【讨论】\n" + hist : "");
    return (await callAI(active, sys, [{ role: "user", content: u }], { maxTokens: 400 })).trim();
  }

  // ============================================================
  // 组件
  // ============================================================
  function ReadTogether(props) {
    const t = useTheme();
    const [books, setBooks] = useState(loadBooks);
    const [openId, setOpenId] = useState(null);
    const fileRef = useRef(null);

    const persist = function (list) { setBooks(list); saveBooks(list); };
    const patchBook = function (id, patch) {
      persist(loadBooks().map(function (b) { return b.id === id ? Object.assign({}, b, typeof patch === "function" ? patch(b) : patch) : b; }));
    };

    const onFile = async function (e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (!/\.txt$/i.test(f.name) && f.type && f.type.indexOf("text") < 0) { props.toast && props.toast("目前只支持 .txt 文本"); return; }
      try {
        const text = await f.text();
        if (!text.trim()) { props.toast && props.toast("这个文件是空的"); return; }
        const id = "bk_" + Date.now();
        await idbPut(id, text);
        const title = f.name.replace(/\.txt$/i, "").slice(0, 40);
        persist([{ id: id, title: title, addedTs: Date.now(), lastReadTs: Date.now(), size: text.length, page: 0, partnerId: null, perPass: 3, annotations: [] }].concat(loadBooks()));
        props.toast && props.toast("《" + title + "》已上架");
      } catch (err) { props.toast && props.toast("读取失败：" + (err.message || "重试")); }
    };

    const delBook = async function (id) {
      try { await idbDel(id); } catch (e) {}
      persist(loadBooks().filter(function (b) { return b.id !== id; }));
      if (openId === id) setOpenId(null);
    };

    if (openId) {
      const bk = books.find(function (b) { return b.id === openId; });
      if (!bk) { setOpenId(null); return null; }
      return h(Reader, {
        book: bk, characters: props.characters, profile: props.profile, worldbook: props.worldbook, active: props.active, toast: props.toast,
        onBack: function () { setOpenId(null); },
        onPatch: function (patch) { patchBook(bk.id, patch); },
        onAddMemory: props.onAddMemory
      });
    }

    // ---- 书架 ----
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "一起读", en: "Read", onBack: props.onBack }),
      h("input", { ref: fileRef, type: "file", accept: ".txt,text/plain", style: { display: "none" }, onChange: onFile }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
        h("button", {
          onClick: function () { fileRef.current && fileRef.current.click(); },
          className: "w-full py-3 mb-5 active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 14, borderRadius: 11, border: "1px dashed " + t.line, color: t.sub, background: t.bg2 }
        }, "＋ 上传一本书（.txt）"),
        books.length === 0
          ? h("div", { style: { textAlign: "center", color: t.fog, fontFamily: F_BODY, fontSize: 13, lineHeight: 1.8, paddingTop: 40, whiteSpace: "pre-line" } }, "书架还是空的。\n上传一个 txt，点开就能邀角色一起读、写批注、聊剧情。")
          : h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 } },
              books.slice().sort(function (a, b) { return (b.lastReadTs || 0) - (a.lastReadTs || 0); }).map(function (b) {
                const partner = props.characters.find(function (c) { return c.id === b.partnerId; });
                const pages = b.size ? Math.max(1, Math.ceil(b.size / PAGE_CHARS)) : 1;
                const pct = Math.round(((b.page || 0) / Math.max(1, pages - 1 || 1)) * 100);
                return h("div", { key: b.id },
                  h("button", {
                    onClick: function () { setOpenId(b.id); },
                    onContextMenu: function (e) { e.preventDefault(); if (window.confirm("从书架移除《" + b.title + "》？（正文和批注一并删除）")) delBook(b.id); },
                    style: { width: "100%", aspectRatio: "3/4.3", borderRadius: "3px 9px 9px 3px", background: "linear-gradient(105deg," + spineColor(b.id) + " 0 10%, " + spineColor(b.id) + "cc 10% 100%)", boxShadow: "0 3px 10px rgba(0,0,0,.18)", borderLeft: "3px solid rgba(0,0,0,.22)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "10px 9px", textAlign: "left" }
                  },
                    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 12.5, lineHeight: 1.3, color: "#f3efe6", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } }, b.title),
                    h("div", null,
                      (b.annotations && b.annotations.length) ? h("div", { style: { fontFamily: F_BODY, fontSize: 9.5, color: "rgba(255,255,255,.75)" } }, "批注 " + b.annotations.length) : null,
                      h("div", { style: { fontFamily: F_BODY, fontSize: 9.5, color: "rgba(255,255,255,.6)" } }, (b.page || 0) > 0 ? pct + "%" : "未读"))
                  ),
                  h("div", { style: { marginTop: 5, display: "flex", alignItems: "center", gap: 4 } },
                    partner ? h(Avatar, { character: partner, size: 15, radius: 5 }) : null,
                    h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, partner ? partner.name : "还没邀人"))
                );
              })),
        books.length > 0 ? h("div", { style: { marginTop: 18, textAlign: "center", fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "长按封面可移除") : null
      ));
  }

  // ============================================================
  // 阅读器
  // ============================================================
  function Reader(props) {
    const t = useTheme();
    const book = props.book;
    const [pages, setPages] = useState(null);
    const [pageIdx, setPageIdx] = useState(book.page || 0);
    const [loading, setLoading] = useState(true);
    const [pickOpen, setPickOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [chat, setChat] = useState([]);
    const [draft, setDraft] = useState("");
    const [ending, setEnding] = useState(false);
    const scrollRef = useRef(null);

    const partner = props.characters.find(function (c) { return c.id === book.partnerId; });

    useEffect(function () {
      let alive = true;
      idbGet(book.id).then(function (text) {
        if (!alive) return;
        setPages(paginate(text)); setLoading(false);
      }).catch(function () { setLoading(false); setPages([["（正文读取失败，可能换过设备。请重新上传这本书。）"]]); });
      return function () { alive = false; };
    }, [book.id]);

    // 翻页时回到顶部 + 存进度
    useEffect(function () { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [pageIdx]);

    const totalPages = pages ? pages.length : 1;
    const curParas = pages ? (pages[Math.min(pageIdx, totalPages - 1)] || []) : [];
    const pageAnns = (book.annotations || []).filter(function (a) { return a.page === pageIdx; });
    const annsForPara = function (i) { return pageAnns.filter(function (a) { return a.para === i; }); };

    const gotoPage = function (idx) {
      const n = Math.max(0, Math.min(totalPages - 1, idx));
      setPageIdx(n); props.onPatch({ page: n, lastReadTs: Date.now() });
    };

    const doAnnotate = async function () {
      if (busy) return;
      if (!props.active) { props.toast && props.toast("请先到设置配置 API"); return; }
      if (!partner) { setPickOpen(true); return; }
      setBusy(true);
      try {
        // 批注范围：从当前页起、跨 span 页（span=1 就是本页）。把这些页的段落拍平成一串，让 TA 批。
        const span = book.annSpan || 1;
        const endP = Math.min(totalPages - 1, pageIdx + span - 1);
        const flat = [];
        for (let pg = pageIdx; pg <= endP; pg++) {
          (pages[pg] || []).forEach(function (txt, pi) { flat.push({ page: pg, para: pi, text: txt }); });
        }
        if (!flat.length) { props.toast && props.toast("这一段没有正文"); return; }
        const want = book.perPass || 3;
        const texts = flat.map(function (f) { return f.text; });
        // 已有的（本范围内、同角色）批注，作为「别重复」的底子
        const priorNotes = (book.annotations || []).filter(function (a) { return a.page >= pageIdx && a.page <= endP && a.charId === partner.id; }).map(function (a) { return { note: a.note }; });
        // 数量不够就自动补一轮：把已批的告诉它别重复，再要剩下的。按次计费、输出免费，多调一两次不心疼。
        let notes = [];
        for (let round = 0; round < 3 && notes.length < want; round++) {
          const need = want - notes.length;
          const got = await genAnnotations(props.active, partner, props.profile, props.worldbook, texts, need, priorNotes.concat(notes));
          if (!got.length) break; // 这轮一条都没补出来，别再空转
          notes = notes.concat(got);
        }
        if (!notes.length) { props.toast && props.toast("Ta 没批出新东西，换一段再试"); return; }
        notes = notes.slice(0, want);
        const add = notes.map(function (nn) {
          const f = flat[nn.i] || flat[0];
          return { id: "an_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), page: f.page, para: f.para, note: nn.note, charId: partner.id, charName: partner.name, ts: Date.now() };
        });
        props.onPatch(function (b) { return { annotations: (b.annotations || []).concat(add), lastReadTs: Date.now() }; });
        props.toast && props.toast(partner.name + " 批了 " + add.length + " 条" + (span > 1 ? "（跨 " + (endP - pageIdx + 1) + " 页）" : ""));
      } catch (e) { props.toast && props.toast("批注失败：" + (e.message || "重试")); }
      finally { setBusy(false); }
    };

    const sendDiscuss = async function () {
      const v = draft.trim();
      if (!v || busy) return;
      if (!props.active) { props.toast && props.toast("请先到设置配置 API"); return; }
      if (!partner) { setPickOpen(true); return; }
      setDraft("");
      const next = chat.concat([{ role: "user", content: v }]);
      setChat(next); setBusy(true);
      try {
        const say = await discussReply(props.active, partner, props.profile, props.worldbook, book, curParas, pageAnns, next, v);
        setChat(function (p) { return p.concat(say.map(function (s) { return { role: "char", content: s }; })); });
      } catch (e) { props.toast && props.toast("回复失败：" + (e.message || "重试")); }
      finally { setBusy(false); }
    };

    const endSession = async function () {
      if (ending) return;
      if (!chat.length && !(book.annotations || []).length) { props.toast && props.toast("还没读出什么，先批注或聊几句"); return; }
      if (!props.active || !partner) { setChatOpen(false); setChat([]); return; }
      setEnding(true);
      try {
        const summary = await summarizeSession(props.active, partner, props.profile, book, (book.annotations || []).filter(function (a) { return a.charId === partner.id; }), chat);
        if (summary) {
          props.onAddMemory && props.onAddMemory(summary, partner.id);
          props.toast && props.toast("已记入记忆库");
        } else { props.toast && props.toast("已结束"); }
        setChat([]); setChatOpen(false);
      } catch (e) { props.toast && props.toast("总结失败：" + (e.message || "重试")); }
      finally { setEnding(false); }
    };

    // ---- 顶栏 ----
    const span = book.annSpan || 1;
    const topbar = h("div", { className: "shrink-0", style: { padding: "6px 16px 10px", borderBottom: "1px solid " + t.line } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        partner
          ? h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 } },
              h(Avatar, { character: partner, size: 24, radius: 7 }),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, "和 " + partner.name + " 一起读"),
              h("button", { onClick: function () { setPickOpen(true); }, style: { fontFamily: F_BODY, fontSize: 11, color: t.tint } }, "换人"))
          : h("button", { onClick: function () { setPickOpen(true); }, style: { flex: 1, textAlign: "left", fontFamily: F_BODY, fontSize: 12.5, color: t.tint } }, "＋ 邀一个角色一起读")),
      // 批注控制：一次批几条 + 覆盖几页
      partner ? h("div", { style: { display: "flex", alignItems: "center", gap: 16, marginTop: 8 } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 5 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "每次批"),
          h(Stepper, { value: book.perPass || 3, min: 1, max: 12, onChange: function (v) { props.onPatch({ perPass: v }); } }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "条")),
        h("div", { style: { display: "flex", alignItems: "center", gap: 5 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "范围"),
          h(Stepper, { value: span, min: 1, max: 8, onChange: function (v) { props.onPatch({ annSpan: v }); } }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, span > 1 ? "页(从当前起)" : "页")),
        span > 1 ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint } }, "本页~第" + Math.min(totalPages, pageIdx + span) + "页") : null
      ) : null);

    // ---- 正文页 ----
    const reader = h("div", { ref: scrollRef, className: "flex-1 overflow-y-auto", style: { padding: "18px 20px 90px" } },
      loading ? h("div", { style: { textAlign: "center", color: t.fog, fontFamily: F_BODY, fontSize: 13, paddingTop: 40 } }, "翻开中…")
        : curParas.map(function (p, i) {
            const anns = annsForPara(i);
            return h(Fragment, { key: pageIdx + "_" + i },
              h("p", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 16, lineHeight: 1.95, color: t.ink, margin: "0 0 14px", textIndent: "2em", background: anns.length ? (t.tint + "12") : "transparent", borderRadius: anns.length ? 6 : 0, padding: anns.length ? "2px 6px" : 0 } }, p),
              anns.map(function (a) {
                const ch = props.characters.find(function (c) { return c.id === a.charId; });
                return h("div", { key: a.id, style: { display: "flex", gap: 7, margin: "-6px 0 16px", padding: "8px 11px", background: t.bg2, borderLeft: "2px solid " + t.tint, borderRadius: "0 8px 8px 0" } },
                  ch ? h(Avatar, { character: ch, size: 18, radius: 6 }) : null,
                  h("div", { style: { flex: 1 } },
                    h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint, marginBottom: 2 } }, a.charName),
                    h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, color: t.sub } }, a.note)));
              }));
          }));

    // ---- 底部翻页 + 动作条 ----
    const footer = h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 } },
      h("button", { onClick: function () { gotoPage(pageIdx - 1); }, disabled: pageIdx <= 0, style: { fontFamily: F_BODY, fontSize: 13, color: pageIdx <= 0 ? t.line : t.sub, padding: "6px 8px" } }, "‹ 上一页"),
      h("div", { style: { flex: 1, textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.fog } }, (pageIdx + 1) + " / " + totalPages),
      h("button", { onClick: function () { gotoPage(pageIdx + 1); }, disabled: pageIdx >= totalPages - 1, style: { fontFamily: F_BODY, fontSize: 13, color: pageIdx >= totalPages - 1 ? t.line : t.sub, padding: "6px 8px" } }, "下一页 ›"));

    const actionBar = h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 54, display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none" } },
      h("button", { onClick: doAnnotate, disabled: busy, style: { pointerEvents: "auto", fontFamily: F_BODY, fontSize: 13, color: "#f3efe6", background: t.ink, borderRadius: 999, padding: "9px 16px", boxShadow: "0 3px 12px rgba(0,0,0,.22)", opacity: busy ? .6 : 1 } }, busy ? "批注中…" : "✎ 让 Ta 批注"),
      h("button", { onClick: function () { if (!partner) { setPickOpen(true); return; } setChatOpen(true); }, style: { pointerEvents: "auto", fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "9px 16px", boxShadow: "0 3px 12px rgba(0,0,0,.14)" } }, "💬 讨论剧情"));

    return h("div", { className: "h-full flex flex-col", style: { position: "relative" } },
      h(Head, { zh: book.title, en: "Reading", onBack: props.onBack }),
      topbar, reader, actionBar, footer,
      pickOpen ? h(PartnerPicker, { characters: props.characters, currentId: book.partnerId, t: t,
        onPick: function (id) { props.onPatch({ partnerId: id }); setPickOpen(false); },
        onClose: function () { setPickOpen(false); } }) : null,
      chatOpen ? h(DiscussSheet, { partner: partner, chat: chat, draft: draft, busy: busy, ending: ending, t: t,
        onDraft: setDraft, onSend: sendDiscuss, onEnd: endSession, onClose: function () { setChatOpen(false); } }) : null
    );
  }

  // ---- 步进器 ----
  function Stepper(props) {
    const t = props.t || useTheme();
    const btn = function (label, fn, dis) { return h("button", { onClick: fn, disabled: dis, style: { width: 22, height: 22, borderRadius: 6, border: "1px solid " + t.line, color: dis ? t.line : t.sub, fontFamily: F_BODY, fontSize: 14, lineHeight: "20px", background: t.bg2 } }, label); };
    return h("div", { style: { display: "flex", alignItems: "center", gap: 5 } },
      btn("−", function () { props.onChange(Math.max(props.min, props.value - 1)); }, props.value <= props.min),
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink, minWidth: 12, textAlign: "center" } }, props.value),
      btn("+", function () { props.onChange(Math.min(props.max, props.value + 1)); }, props.value >= props.max));
  }

  // ---- 选角色 ----
  function PartnerPicker(props) {
    const t = props.t;
    return h("div", { style: { position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,.35)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }, onClick: props.onClose },
      h("div", { onClick: function (e) { e.stopPropagation(); }, style: { background: t.bg, borderRadius: "18px 18px 0 0", padding: "16px 18px 26px", maxHeight: "70%", overflowY: "auto" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink, marginBottom: 12 } }, "邀谁一起读"),
        (props.characters || []).length === 0
          ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "还没有角色，先去「群像」建一个")
          : props.characters.map(function (c) {
              return h("button", { key: c.id, onClick: function () { props.onPick(c.id); }, style: { width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 6px", borderBottom: "1px solid " + t.line, textAlign: "left" } },
                h(Avatar, { character: c, size: 34, radius: 10 }),
                h("div", { style: { flex: 1 } },
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.name),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, c.tagline || "")),
                c.id === props.currentId ? h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.tint } }, "当前") : null);
            })));
  }

  // ---- 半屏讨论抽屉 ----
  function DiscussSheet(props) {
    const t = props.t;
    const endRef = useRef(null);
    useEffect(function () { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [props.chat.length, props.busy]);
    return h("div", { style: { position: "absolute", inset: 0, zIndex: 45, display: "flex", flexDirection: "column", justifyContent: "flex-end" } },
      h("div", { onClick: props.onClose, style: { flex: 1, background: "rgba(0,0,0,.25)" } }),
      h("div", { style: { height: "56%", background: t.bg, borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", boxShadow: "0 -6px 20px rgba(0,0,0,.18)" } },
        h("div", { style: { flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 8px", borderBottom: "1px solid " + t.line } },
          props.partner ? h(Avatar, { character: props.partner, size: 22, radius: 7 }) : null,
          h("div", { style: { flex: 1, fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "和 " + (props.partner ? props.partner.name : "") + " 讨论"),
          h("button", { onClick: props.onEnd, disabled: props.ending, style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, props.ending ? "总结中…" : "结束并记入记忆"),
          h("button", { onClick: props.onClose, style: { fontFamily: F_BODY, fontSize: 18, color: t.fog, marginLeft: 4 } }, "×")),
        h("div", { className: "flex-1 overflow-y-auto", style: { padding: "12px 14px" } },
          props.chat.length === 0 ? h("div", { style: { textAlign: "center", color: t.fog, fontFamily: F_BODY, fontSize: 12.5, paddingTop: 20, lineHeight: 1.7 } }, "就读到的这一段，随便聊——\n人物为什么这么做、你俩怎么看、接下来会怎样。")
            : props.chat.map(function (m, i) {
                const mine = m.role === "user";
                return h("div", { key: i, style: { display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 } },
                  h("div", { style: { maxWidth: "78%", padding: "8px 12px", borderRadius: 13, fontFamily: F_BODY, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", background: mine ? t.tint : t.bg2, color: mine ? "#fff" : t.ink, border: mine ? "none" : "1px solid " + t.line } }, m.content));
              }),
          props.busy ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "2px 4px" } }, (props.partner ? props.partner.name : "Ta") + " 在想…") : null,
          h("div", { ref: endRef })),
        h("div", { style: { flexShrink: 0, display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid " + t.line } },
          h("input", { value: props.draft, onChange: function (e) { props.onDraft(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") props.onSend(); }, placeholder: "说说你的看法…", style: { flex: 1, fontFamily: F_BODY, fontSize: 14, padding: "9px 13px", borderRadius: 999, border: "1px solid " + t.line, background: t.bg2, color: t.ink, outline: "none" } }),
          h("button", { onClick: props.onSend, disabled: props.busy, style: { fontFamily: F_BODY, fontSize: 13, color: "#fff", background: t.ink, borderRadius: 999, padding: "0 16px", opacity: props.busy ? .6 : 1 } }, "发送"))));
  }

  window.ReadTogether = ReadTogether;
})();
