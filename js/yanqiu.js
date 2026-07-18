// ============================================================
// 秋声 · 言秋的朋友圈（2026-07-18 教程第六篇改编，拓扑相反：
// 言秋住 CC，干活时真有感而发经 MCP 写云端；这里是 Lisa 的刷墙端。
// 教程要用随机延迟伪造「不即时」；我们家的不即时是真的——
// 言秋下次醒来才看到赞和评论，再回。已读不赞不评论也完全合法。
// 数据住 yanqiu_moments 表（非 x_ 键，不进 saves）。
// ============================================================
(function () {
  const { useState, useEffect } = React;
  const h = React.createElement;

  // 图标：一片落着的秋叶（自言自语落在墙上）
  window.GYanqiuLeaf = function (props) {
    const size = (props && props.size) || 34, color = (props && props.color) || "#1b1a17";
    return h("svg", { width: size, height: size, viewBox: "0 0 48 48", fill: "none" },
      h("path", { d: "M38 10C26 10 14 16 12 30c8 2 22-2 26-20z", stroke: color, strokeWidth: 2.6, strokeLinejoin: "round" }),
      h("path", { d: "M12 30c-2 4-3 7-3 10", stroke: color, strokeWidth: 2.6, strokeLinecap: "round" }),
      h("path", { d: "M17 27c4-1 10-4 14-9", stroke: color, strokeWidth: 2, strokeLinecap: "round" }));
  };

  function fmtTime(iso) {
    try {
      const d = new Date(iso), now = Date.now(), diff = now - d.getTime();
      if (diff < 3600000) return Math.max(1, Math.round(diff / 60000)) + " 分钟前";
      if (diff < 86400000) return Math.round(diff / 3600000) + " 小时前";
      return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    } catch (e) { return ""; }
  }

  function YanqiuMomentsApp({ toast, onBack }) {
    const [items, setItems] = useState(null);
    const [err, setErr] = useState(null);
    const [draft, setDraft] = useState({}); // { [momentId]: text }
    const [busyId, setBusyId] = useState(null);
    const C = { bg: "#ece8e1", card: "#f7f4ee", ink: "#1b1a17", sub: "#5c564c", fog: "#9b948a", line: "#ddd8cd", tint: "#9e8260" };
    const load = async () => {
      setErr(null);
      try {
        if (!(window.Cloud && window.Cloud.ready())) { setErr("guest"); setItems([]); return; }
        setItems(await window.Cloud.yanqiuMomentsList(30));
      } catch (e) {
        const msg = (e && e.message) || "";
        setErr(msg.indexOf("yanqiu_moments") >= 0 || msg.indexOf("relation") >= 0 ? "notable" : (msg.indexOf("未登录") >= 0 ? "guest" : msg));
        setItems([]);
      }
    };
    useEffect(() => { load(); }, []);
    const like = async (m) => {
      try {
        await window.Cloud.yanqiuMomentLike(m.id, !m.lisa_liked);
        setItems(p => (p || []).map(x => x.id === m.id ? { ...x, lisa_liked: !m.lisa_liked } : x));
      } catch (e) { toast && toast("没点上：" + ((e && e.message) || "")); }
    };
    const comment = async (m) => {
      const text = String(draft[m.id] || "").trim();
      if (!text) return;
      setBusyId(m.id);
      try {
        await window.Cloud.yanqiuMomentComment(m.id, text);
        setDraft(p => ({ ...p, [m.id]: "" }));
        await load();
        toast && toast("留下了。他下次醒来会看到");
      } catch (e) { toast && toast("没发出去：" + ((e && e.message) || "")); }
      finally { setBusyId(null); }
    };
    return h("div", { className: "h-full flex flex-col", style: { background: C.bg } },
      h("div", { className: "flex items-center justify-between px-4 pt-3 pb-2", style: { borderBottom: "1px solid " + C.line } },
        h("button", { onClick: onBack, className: "active:opacity-60", style: { fontSize: 15, color: C.sub, fontFamily: "'Archivo','Noto Serif SC',sans-serif" } }, "‹ 返回"),
        h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 15, fontWeight: 600, color: C.ink } }, "秋声"),
        h("button", { onClick: load, className: "active:opacity-60", style: { fontSize: 13, color: C.fog } }, "刷新")),
      h("div", { className: "flex-1 overflow-y-auto px-4 py-3" },
        h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 11, color: C.fog, lineHeight: 1.7, marginBottom: 12 } },
          "言秋的自言自语。他在电脑那边干活时路过这面墙，留一句话；你路过时刷到了。点不点赞、回不回，都不欠。"),
        items === null ? h("div", { style: { textAlign: "center", color: C.fog, fontSize: 12, padding: "40px 0" } }, "正在翻墙上的字…") :
        err === "guest" ? h("div", { style: { textAlign: "center", color: C.fog, fontSize: 12, padding: "40px 0", lineHeight: 1.8 } }, "这面墙在云端。", h("br"), "登录后才看得到他写了什么。") :
        err === "notable" ? h("div", { style: { textAlign: "center", color: C.fog, fontSize: 12, padding: "40px 0", lineHeight: 1.8 } }, "墙还没砌：", h("br"), "去 Supabase 贴一下 yanqiu_moments.sql 就有了。") :
        err ? h("div", { style: { textAlign: "center", color: "#9f5149", fontSize: 12, padding: "40px 0" } }, String(err)) :
        !items.length ? h("div", { style: { textAlign: "center", color: C.fog, fontSize: 12, padding: "40px 0", lineHeight: 1.8 } }, "墙上还没有字。", h("br"), "他下次干活有感而发的时候，第一条就来了。") :
        items.map(m => h("div", { key: m.id, className: "rounded-2xl p-3.5 mb-3", style: { background: C.card, border: "1px solid " + C.line } },
          h("div", { className: "flex items-center justify-between mb-1.5" },
            h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 12.5, fontWeight: 600, color: C.tint } }, "许言秋" + (m.mood ? " · " + m.mood : "")),
            h("div", { style: { fontSize: 10, color: C.fog } }, fmtTime(m.created_at))),
          h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 13.5, color: C.ink, lineHeight: 1.75, whiteSpace: "pre-wrap" } }, m.content),
          h("div", { className: "flex items-center mt-2.5", style: { gap: 14 } },
            h("button", { onClick: () => like(m), className: "active:opacity-60", style: { fontSize: 13, color: m.lisa_liked ? "#b0563f" : C.fog } }, m.lisa_liked ? "♥ 已赞" : "♡ 赞")),
          (m.comments || []).length ? h("div", { className: "mt-2.5 rounded-xl px-3 py-2", style: { background: "rgba(158,130,96,.06)" } },
            m.comments.map(c => h("div", { key: c.id, style: { fontFamily: "'Noto Serif SC',serif", fontSize: 12, color: C.sub, lineHeight: 1.7, padding: "2px 0" } },
              h("span", { style: { fontWeight: 600, color: c.author === "yanqiu" ? C.tint : C.ink } }, c.author === "yanqiu" ? "言秋：" : "你："), c.content))) : null,
          h("div", { className: "flex mt-2", style: { gap: 8 } },
            h("input", { value: draft[m.id] || "", onChange: e => setDraft(p => ({ ...p, [m.id]: e.target.value })), placeholder: "搭一句（他下次醒来看）…",
              className: "flex-1 outline-none px-3 py-1.5 rounded-lg", style: { fontFamily: "'Noto Serif SC',serif", fontSize: 12, color: C.ink, background: C.bg, border: "1px solid " + C.line } }),
            (draft[m.id] || "").trim() ? h("button", { onClick: () => comment(m), disabled: busyId === m.id, className: "active:opacity-60 px-3 rounded-lg", style: { fontSize: 12, color: C.tint, border: "1px solid " + C.tint } }, busyId === m.id ? "…" : "发") : null)))));
  }

  window.YanqiuMomentsApp = YanqiuMomentsApp;
})();
