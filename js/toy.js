// ============================================================
// 配件（本地直连）— Lovense Standard API 本地命令，纯前端，不依赖 Mac/后端
// 架构：iPhone 上 Lovense Remote(开 Game Mode) = 蓝牙主机 + 本地 HTTPS 服务，
//       本 app 直接 POST 到 https://<域名>:<端口>/command 控制。域名带有效证书(*.lovense.club)绕过混合内容。
// UI 隐身：默认不出现，设置·数据 tab 连点「数据」7 下解锁（x_toyUnlocked）。配置只存本机、不进云同步。
// ============================================================
function loadToyCfg() {
  try { const c = JSON.parse(localStorage.getItem("x_toy") || "null"); if (c && typeof c === "object") return Object.assign({ url: "", platform: "LisaPhone", enabled: false, cap: 12 }, c); } catch (e) {}
  return { url: "", platform: "LisaPhone", enabled: false, cap: 12 };
}
function toyCap() { const c = loadToyCfg(); const n = Math.round(c.cap); return isNaN(n) ? 12 : Math.max(1, Math.min(20, n)); }
function saveToyCfg(c) { const clean = Object.assign(loadToyCfg(), c || {}); try { localStorage.setItem("x_toy", JSON.stringify(clean)); } catch (e) {} return clean; }
function toyReady(c) { c = c || loadToyCfg(); return !!(c.enabled && c.url); }
// 归一本地地址：削尾 /command、去尾斜杠。用户从 Lovense Remote 的 Game Mode 页面抄「域名:端口」。
function toyBase(url) {
  let u = String(url || "").trim().replace(/\s+/g, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;      // 只填了 域名:端口 → 补 https
  return u.replace(/\/command\/?$/i, "").replace(/\/+$/, "");
}
// 发一条命令到本地服务。body=Lovense 命令对象。返回解析后的 JSON，或抛出可读报错。
async function toyCommand(body, opts) {
  const c = loadToyCfg();
  const base = toyBase(c.url);
  if (!base) throw new Error("没填本地地址（在 Lovense Remote 开 Game Mode，把「域名:端口」抄过来）");
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 8000);
  let r, txt;
  try {
    r = await fetch(base + "/command", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-platform": c.platform || "LisaPhone" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    txt = await r.text();
  } catch (e) {
    throw new Error("连不上本地服务：" + (e && e.message || e) + "。（确认同一个 WiFi、Lovense Remote 开着且在 Game Mode、地址没过期）");
  } finally { clearTimeout(to); }
  let d = null; try { d = JSON.parse(txt); } catch (e) {}
  if (d && (d.code === 200 || d.code === 0 || d.result === true || /ok|success/i.test(txt))) return d;
  if (d && d.code && d.code !== 200) throw new Error("Lovense 返回错误 code " + d.code + (d.message ? "：" + d.message : "") + "（100=没有玩具连着；400/500=命令或地址问题）");
  if (!r.ok) throw new Error("HTTP " + r.status + "：" + String(txt).slice(0, 160));
  return d || { raw: txt };
}
// 常用封装：强度 0~20，时长秒（0=持续到下一条/Stop）
function toyVibrate(strength, timeSec) {
  const s = Math.max(0, Math.min(20, Math.round(strength || 0)));
  return toyCommand({ command: "Function", action: "Vibrate:" + s, timeSec: timeSec || 0, apiVer: 1 });
}
function toyStop() { return toyCommand({ command: "Function", action: "Stop", timeSec: 0, apiVer: 1 }); }
function toyGetToys() { return toyCommand({ command: "GetToys" }); }

// ── 波形预设（语义绑定：台词跟着节奏走，别只发恒定值）──
// 每个预设吃「峰值强度 I(1~20)」，吐一串强度序列；Pattern 命令按 interval 逐格播放、循环填满 timeSec。
const TOY_STRENGTH = {
  teasing: I => [2, 2, Math.round(I * 0.5), 2, I, 2, 2],        // 若即若离，偶尔一下
  steady: I => [I],                                             // 恒定（实际走 Function）
  wave: I => [1, Math.round(I * 0.4), Math.round(I * 0.7), I, Math.round(I * 0.7), Math.round(I * 0.4), 1], // 起伏
  pulse: I => [I, 0, I, 0],                                     // 一下一下点名
  edge: I => [Math.round(I * 0.4), Math.round(I * 0.6), Math.round(I * 0.85), I, I, 1] // 推到顶再骤降（吊着）
};
const TOY_INTERVAL = { teasing: 800, steady: 1000, wave: 600, pulse: 400, edge: 700 };
const TOY_PATTERNS = ["teasing", "steady", "wave", "pulse", "edge"];
// 按语义规格播放。强度【一律封顶 toyCap()】，角色越不过；时长封顶 30s。返回 promise。
function toyPlay(spec) {
  spec = spec || {};
  const cap = toyCap();
  const I = Math.max(1, Math.min(cap, Math.round(spec.intensity || 0) || 1));   // ⚠️用户上限封顶，角色不可越
  const D = Math.max(1, Math.min(30, Math.round(spec.duration || 3) || 3));
  const pat = TOY_PATTERNS.includes(String(spec.pattern || "").toLowerCase()) ? String(spec.pattern).toLowerCase() : "steady";
  if (pat === "steady") return toyVibrate(I, D);
  const seq = TOY_STRENGTH[pat](I).map(x => Math.max(0, Math.min(cap, Math.round(x)))).join(";");
  const interval = TOY_INTERVAL[pat] || 600;
  return toyCommand({ command: "Pattern", rule: "V:1;F:v;S:" + interval + "#", strength: seq, timeSec: D, apiVer: 1 });
}

// ── 设置 UI（只在解锁后渲染；藏在 设置·数据 tab）──
function ToyConfig({ toast }) {
  const t = useTheme();
  const [c, setC] = useState(loadToyCfg());
  const [busy, setBusy] = useState(false);
  const [str, setStr] = useState(10);
  const [diag, setDiag] = useState("");
  const set = patch => setC(p => { const n = Object.assign({}, p, patch); saveToyCfg(n); return n; });
  const inSt = { fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 8, padding: "8px 12px", width: "100%", outline: "none" };
  const row = (label, node) => h("div", { style: { marginBottom: 10 } },
    h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 4 } }, label), node);
  const run = async (fn, okMsg) => {
    setBusy(true); setDiag("");
    try { const d = await fn(); setDiag("✓ " + (okMsg || "成功") + (d && d.data ? "：" + JSON.stringify(d.data).slice(0, 200) : "")); }
    catch (e) { setDiag("✗ " + (e && e.message || e)); }
    finally { setBusy(false); }
  };
  return h("div", { style: { marginTop: 26, paddingTop: 18, borderTop: "1px dashed " + t.line } },
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, marginBottom: 4 } }, "配件 · 本地"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, lineHeight: 1.5, color: t.fog, marginBottom: 12 } },
      "在 iPhone 上打开 Lovense Remote → 连上设备 → 开「Game Mode」，把页面上的「域名:端口」原样抄进下面。要和手机同一个 WiFi。只存本机、不进云。"),
    row("本地地址（域名:端口）", h("input", { value: c.url, onChange: e => set({ url: e.target.value }), placeholder: "192-168-1-44.lovense.club:30010", style: inSt })),
    row("标识（X-platform，随便起）", h("input", { value: c.platform, onChange: e => set({ platform: e.target.value }), placeholder: "LisaPhone", style: inSt })),
    h("div", { className: "flex items-center justify-between", style: { padding: "10px 0" } },
      h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, "启用"),
      h("button", { onClick: () => set({ enabled: !c.enabled }), style: { width: 50, height: 29, borderRadius: 999, background: c.enabled ? t.ink : t.line, position: "relative" } },
        h("span", { style: { position: "absolute", top: 3, left: c.enabled ? 24 : 3, width: 23, height: 23, borderRadius: 999, background: "#fff", transition: "left .2s" } }))),
    // 强度上限（角色越不过这个值）——安全铁律②
    h("div", { style: { padding: "6px 0" } },
      h("div", { className: "flex items-center justify-between", style: { marginBottom: 4 } },
        h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "强度上限（TA 越不过）"),
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, (c.cap == null ? 12 : c.cap))),
      h("input", { type: "range", min: 1, max: 20, step: 1, value: c.cap == null ? 12 : c.cap, onChange: e => set({ cap: +e.target.value }), style: { width: "100%" } })),
    // 测试面板
    h("div", { style: { marginTop: 8, paddingTop: 12, borderTop: "1px solid " + t.line } },
      h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
        h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "测试 · 强度"),
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, str)),
      h("input", { type: "range", min: 0, max: 20, step: 1, value: str, onChange: e => setStr(+e.target.value), style: { width: "100%" } }),
      h("div", { className: "flex gap-2", style: { marginTop: 10 } },
        h("button", { onClick: () => run(() => toyVibrate(str, 0), "已发送"), disabled: busy, className: "flex-1", style: { fontFamily: F_BODY, fontSize: 13, color: "#fff", background: t.tint, borderRadius: 8, padding: "9px 0" } }, busy ? "…" : "测试"),
        h("button", { onClick: () => run(() => toyStop(), "已停止"), disabled: busy, className: "flex-1", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, border: "1px solid " + t.line, borderRadius: 8, padding: "9px 0" } }, "停止"),
        h("button", { onClick: () => run(() => toyGetToys(), "已连接"), disabled: busy, style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, border: "1px solid " + t.line, borderRadius: 8, padding: "9px 14px" } }, "检测")),
      diag ? h("div", { style: { fontFamily: "monospace", fontSize: 11, color: diag[0] === "✓" ? "#3c7a4a" : t.accent, marginTop: 10, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 } }, diag) : null),
    h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 12, lineHeight: 1.5 } },
      "地址会随网络变，重连后回来重抄一次即可。人不在同一 WiFi 时本地直连用不了（那要走 Lovense 云端 API，得先搭一小截后端）。"));
}
if (typeof window !== "undefined") { window.ToyConfig = ToyConfig; window.toyVibrate = toyVibrate; window.toyStop = toyStop; window.toyReady = toyReady; window.toyCommand = toyCommand; window.toyPlay = toyPlay; window.toyCap = toyCap; window.TOY_PATTERNS = TOY_PATTERNS; }
