// js/map.js — 好友地图：真·在线地图(Leaflet+OSM)，角色按「家乡城市 + 此刻日程活动」定位。
// 主屏 2×2 实时小组件 MapWidget + 全屏 CharMap。Leaflet 没加载时优雅降级不崩。
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;

  // 常用城市 → [lat,lng]，给角色设家乡用（离线，不靠地理编码 API）
  const CITY_DB = {
    "北京": [39.90, 116.40], "上海": [31.23, 121.47], "广州": [23.13, 113.26], "深圳": [22.54, 114.06],
    "杭州": [30.27, 120.16], "成都": [30.57, 104.07], "重庆": [29.56, 106.55], "武汉": [30.59, 114.31],
    "西安": [34.34, 108.94], "南京": [32.06, 118.80], "苏州": [31.30, 120.62], "天津": [39.13, 117.20],
    "长沙": [28.23, 112.94], "青岛": [36.07, 120.38], "厦门": [24.48, 118.09], "沈阳": [41.81, 123.43],
    "哈尔滨": [45.80, 126.53], "大连": [38.91, 121.61], "郑州": [34.75, 113.62], "昆明": [25.04, 102.71],
    "合肥": [31.82, 117.23], "福州": [26.07, 119.30], "济南": [36.65, 117.12], "贵阳": [26.65, 106.63],
    "香港": [22.32, 114.17], "台北": [25.03, 121.56], "澳门": [22.20, 113.54],
    "东京": [35.68, 139.69], "大阪": [34.69, 135.50], "首尔": [37.57, 126.98], "新加坡": [1.35, 103.82],
    "曼谷": [13.76, 100.50], "吉隆坡": [3.14, 101.69], "伦敦": [51.51, -0.13], "巴黎": [48.86, 2.35],
    "纽约": [40.71, -74.01], "洛杉矶": [34.05, -118.24], "旧金山": [37.77, -122.42], "西雅图": [47.61, -122.33],
    "多伦多": [43.65, -79.38], "温哥华": [49.28, -123.12], "温尼伯": [49.90, -97.14], "卡尔加里": [51.05, -114.07], "蒙特利尔": [45.50, -73.57],
    "悉尼": [-33.87, 151.21], "墨尔本": [-37.81, 144.96],
    "柏林": [52.52, 13.40], "莫斯科": [55.76, 37.62], "迪拜": [25.20, 55.27]
  };
  const CITY_NAMES = Object.keys(CITY_DB);

  // 日程活动类型 → 相对家的小偏移（度），让 pin 随日程在城里挪一点（没有真实门牌，靠此营造"移动感"）
  const ACT_OFFSET = {
    work: [0.020, 0.028], create: [0.015, -0.022], meal: [-0.013, 0.021], out: [0.030, -0.013],
    social: [-0.021, -0.024], rest: [0.004, 0.006], coffee: [0.007, 0.013], sleep: [0, 0], other: [0.011, 0.009]
  };
  function charHome(char) { const hm = char && char.home; return hm && typeof hm.lat === "number" ? hm : null; }
  // 没设城市的角色：按 id 稳定地在锚点(你的定位/温尼伯)附近撒开 ±0.024°(≈2.5km)，不重叠
  function charJitter(char) {
    const id = String((char && (char.id || char.name)) || "");
    let hh = 0; for (let i = 0; i < id.length; i++) hh = (hh * 31 + id.charCodeAt(i)) | 0;
    const a = Math.abs(hh);
    return [((a % 24) - 12) / 500, ((Math.floor(a / 24) % 24) - 12) / 500];
  }
  // pos：优先家乡城市；没设就落在锚点(userGeo 或温尼伯)附近；再叠日程活动偏移
  function charPos(char, st, userGeo) {
    const hm = charHome(char);
    let lat, lng;
    if (hm) { lat = hm.lat; lng = hm.lng; }
    else {
      const anc = (userGeo && typeof userGeo.lat === "number") ? userGeo : { lat: CITY_DB["温尼伯"][0], lng: CITY_DB["温尼伯"][1] };
      const j = charJitter(char); lat = anc.lat + j[0]; lng = anc.lng + j[1];
    }
    const off = st && ACT_OFFSET[st.type]; if (off) { lat += off[0]; lng += off[1]; }
    return [lat, lng];
  }
  function avatarHtml(char, size) {
    const s = size || 34;
    const img = char.avatarImage;
    const inner = img
      ? "<div style='width:100%;height:100%;border-radius:50%;background:center/cover no-repeat url(\"" + img + "\")'></div>"
      : "<div style='width:100%;height:100%;border-radius:50%;background:" + (char.color || "#7c5c4e") + ";display:flex;align-items:center;justify-content:center;color:#fff;font-size:" + Math.round(s * 0.42) + "px;font-family:serif'>" + String(char.name || "?").slice(0, 1) + "</div>";
    return "<div style='width:" + s + "px;height:" + s + "px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 7px rgba(0,0,0,.32);box-sizing:border-box;background:#fff'>" + inner + "</div>";
  }

  // 共享的 Leaflet 画布：把 pins 放上去，自动 fit。opts.static=不可交互（widget 用）
  function MapCanvas({ pins, opts, style, className }) {
    const elRef = useRef(null);
    const mapRef = useRef(null);
    const lgRef = useRef(null);
    const fittedRef = useRef(false);
    const sigRef = useRef("");
    const o = opts || {};
    useEffect(function () {
      if (!window.L || !elRef.current || mapRef.current) return;
      const L = window.L;
      const inter = !o.static;
      const map = L.map(elRef.current, {
        zoomControl: !!o.zoomControl, dragging: inter, scrollWheelZoom: inter, doubleClickZoom: inter,
        boxZoom: inter, keyboard: inter, touchZoom: inter, tap: inter, attributionControl: false
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
      map.setView([31.23, 121.47], 3);
      mapRef.current = map;
      lgRef.current = L.layerGroup().addTo(map);
      // 容器尺寸稳定后修正
      setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 120);
      return function () { try { map.remove(); } catch (e) {} mapRef.current = null; lgRef.current = null; fittedRef.current = false; };
    }, []);
    useEffect(function () {
      const L = window.L, map = mapRef.current, lg = lgRef.current;
      if (!L || !map || !lg) return;
      // 位置签名：没变就不重建 marker（主屏时钟每秒刷新时别让 Leaflet 空转→卡）
      const sig = (pins || []).map(function (p) { return (p.pos ? p.pos[0].toFixed(4) + "," + p.pos[1].toFixed(4) : "-") + "|" + (p.tooltip || ""); }).join(";");
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      lg.clearLayers();
      const pts = [];
      (pins || []).forEach(function (p) {
        if (!p.pos) return;
        const sz = p.size || 34;
        const mk = L.marker(p.pos, { icon: L.divIcon({ html: p.html, className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }), interactive: !o.static });
        if (p.onClick && !o.static) mk.on("click", p.onClick);
        if (p.tooltip) mk.bindTooltip(p.tooltip, { direction: "top", offset: [0, -sz / 2], className: "cm-tip" });
        mk.addTo(lg); pts.push(p.pos);
      });
      // 修 flex 里初始 0 高只加载一格瓦片：先 invalidateSize，容器真正有尺寸(sized)才 fit 并标记 fitted
      const fit = function () {
        try { map.invalidateSize(); } catch (e) {}
        const sized = map.getSize && map.getSize().x > 60 && map.getSize().y > 60;
        const doFit = o.fitOnce ? !fittedRef.current : true;
        if (doFit && sized && pts.length) {
          if (pts.length === 1) map.setView(pts[0], o.zoom || 10);
          else { try { map.fitBounds(pts, { padding: [26, 26], maxZoom: o.zoom || 11 }); } catch (e) {} }
          fittedRef.current = true;
        }
      };
      fit();
      const t1 = setTimeout(fit, 250), t2 = setTimeout(fit, 750);
      return function () { clearTimeout(t1); clearTimeout(t2); };
    }, [pins]);
    // 降级：没 Leaflet 时给个占位
    if (!window.L) return h("div", { className: className, style: Object.assign({ display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#cfe0ea,#e6ddd0)", color: "#6a7a86", fontSize: 12, textAlign: "center", padding: 12 }, style || {}) }, "地图组件加载中…（需要联网）");
    return h("div", { ref: elRef, className: className, style: Object.assign({ background: "#dfe6ea" }, style || {}) });
  }

  // 蓝点 HTML（你自己的实时位置）
  function meDotHtml(size) { const s = size || 18; return "<div style='width:" + s + "px;height:" + s + "px;border-radius:50%;background:#3f6d8c;border:3px solid #fff;box-shadow:0 0 0 4px rgba(63,109,140,.28)'></div>"; }
  // 主屏 2×2 实时小组件：迷你好友地图 + 顶部标题 + 在线人数
  function MapWidget({ characters, status, userGeo, onOpen }) {
    const t = (typeof useTheme === "function") ? useTheme() : { ink: "#2b2823", fog: "#9a9082" };
    const list = characters || [];
    const pins = list.map(function (c) {
      const st = (status || {})[c.id];
      return { pos: charPos(c, st, userGeo), html: avatarHtml(c, 28), size: 28 };
    }).filter(function (p) { return p.pos; });
    if (userGeo && typeof userGeo.lat === "number") pins.push({ pos: [userGeo.lat, userGeo.lng], size: 16, html: meDotHtml(14) });
    return h("button", { onClick: onOpen, className: "active:opacity-90 text-left",
      style: { position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 24, overflow: "hidden", isolation: "isolate", border: "1px solid rgba(255,255,255,0.65)", boxShadow: "0 8px 30px rgba(30,28,24,0.12)", background: "#dfe6ea" } },
      h(MapCanvas, { pins: pins, opts: { static: true, zoom: 9 }, style: { position: "absolute", inset: 0, width: "100%", height: "100%" } }),
      // 顶部渐变 + 标题
      h("div", { style: { position: "absolute", top: 0, left: 0, right: 0, padding: "10px 12px 18px", background: "linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0))", pointerEvents: "none" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "好友地图"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 1 } }, list.length ? list.length + " 位 · 此刻的位置" : "点开给角色设定城市")),
      pins.length === 0 ? h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" } },
        h("div", { style: { fontSize: 26, opacity: 0.5 } }, "🗺️")) : null);
  }

  // 全屏好友地图
  function CharMap({ characters, status, profile, userGeo, mode, onSetMode, onSetHome, onBack }) {
    const t = useTheme();
    const [sel, setSel] = useState(null);   // 选中要设城市的角色 id
    const [q, setQ] = useState("");
    // 你自己的实时位置（像苹果地图蓝点）：进地图就持续 watchPosition，离开清掉。仅前台生效。
    const [livePos, setLivePos] = useState(userGeo && typeof userGeo.lat === "number" ? [userGeo.lat, userGeo.lng] : null);
    useEffect(function () {
      if (!navigator.geolocation) return;
      const id = navigator.geolocation.watchPosition(
        function (p) { setLivePos([p.coords.latitude, p.coords.longitude]); },
        function () {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
      return function () { try { navigator.geolocation.clearWatch(id); } catch (e) {} };
    }, []);
    const pins = (characters || []).map(function (c) {
      const st = (status || {})[c.id];
      const label = st && st.title ? (c.name + " · " + st.title) : c.name;
      return { pos: charPos(c, st, userGeo), html: avatarHtml(c, 40), size: 40, tooltip: label, onClick: function () { setSel(c.id); } };
    }).filter(function (p) { return p.pos; });
    // 你自己的实时蓝点
    if (livePos) pins.push({ pos: livePos, size: 22, html: meDotHtml(20), tooltip: (profile && profile.name || "我") + "（你 · 实时）" });
    const cityList = CITY_NAMES.filter(function (n) { return !q.trim() || n.indexOf(q.trim()) >= 0; });
    const selChar = sel ? (characters || []).find(function (c) { return c.id === sel; }) : null;
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "好友地图", en: "Where they are", onBack: onBack,
        right: h("div", { className: "flex", style: { gap: 6, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: 2 } },
          [["real", "现实"], ["story", "架空"]].map(function (m) {
            const on = (mode || "real") === m[0];
            return h("button", { key: m[0], onClick: function () { onSetMode && onSetMode(m[0]); }, style: { fontFamily: F_BODY, fontSize: 12, padding: "4px 12px", borderRadius: 999, background: on ? t.ink : "transparent", color: on ? t.bg2 : t.sub } }, m[1]);
          })) }),
      (mode || "real") === "story"
        ? h("div", { className: "flex-1 flex items-center justify-center px-8", style: { textAlign: "center" } },
            h("div", null, h("div", { style: { fontSize: 34, marginBottom: 10 } }, "🏰"),
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink, marginBottom: 6 } }, "架空世界地图"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, lineHeight: 1.6 } }, "这里将放你自己的世界地图图片，把角色钉在剧情地点上。\n（下一步做上传+图钉，先占位）")))
        : h("div", { className: "flex-1", style: { position: "relative", minHeight: 0, isolation: "isolate" } },
            h(MapCanvas, { pins: pins, opts: { fitOnce: true, zoomControl: true, zoom: 11 }, style: { position: "absolute", inset: 0, width: "100%", height: "100%" } }),
            // 底部角色条（z-index 压过 Leaflet 图层，否则会被地图盖住）
            h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1200, padding: "10px 12px 14px", background: "linear-gradient(0deg,rgba(255,255,255,0.96),rgba(255,255,255,0.7) 55%,rgba(255,255,255,0))", display: "flex", gap: 8, overflowX: "auto" } },
              (characters || []).map(function (c) {
                const hm = charHome(c); const st = (status || {})[c.id];
                return h("button", { key: c.id, onClick: function () { setSel(c.id); }, className: "shrink-0 active:opacity-80",
                  style: { display: "flex", alignItems: "center", gap: 7, background: "#fff", border: "1px solid " + t.line, borderRadius: 999, padding: "5px 12px 5px 6px", boxShadow: "0 2px 8px rgba(0,0,0,.08)" } },
                  h("div", { style: { width: 26, height: 26, borderRadius: 999, flexShrink: 0, background: c.avatarImage ? "center/cover no-repeat url(" + c.avatarImage + ")" : (c.color || "#7c5c4e"), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: F_DISPLAY, fontSize: 12 } }, c.avatarImage ? "" : String(c.name || "?").slice(0, 1)),
                  h("div", { style: { textAlign: "left" } },
                    h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, lineHeight: 1.1 } }, c.remark || c.name),
                    h("div", { style: { fontFamily: F_BODY, fontSize: 9.5, color: hm ? t.tint : t.accent } }, hm ? (hm.city + (st && st.title ? " · " + String(st.title).slice(0, 8) : "")) : "点我设城市")));
              }))),
      // 设城市弹层
      sel && h(Sheet, { onClose: function () { setSel(null); setQ(""); }, tall: true },
        h("div", { className: "flex items-center justify-between", style: { marginBottom: 8 } },
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink } }, "「" + (selChar ? (selChar.remark || selChar.name) : "") + "」在哪座城市"),
          charHome(selChar) ? h("button", { onClick: function () { onSetHome(sel, null); setSel(null); setQ(""); }, style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, "清除") : null),
        h("input", { value: q, onChange: function (e) { setQ(e.target.value); }, placeholder: "搜城市名，如 上海 / 东京 / 伦敦",
          style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "10px 12px", width: "100%", outline: "none", marginBottom: 10 } }),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, maxHeight: "42vh", overflowY: "auto" } },
          cityList.map(function (name) {
            const cur = charHome(selChar) && charHome(selChar).city === name;
            return h("button", { key: name, onClick: function () { const c = CITY_DB[name]; onSetHome(sel, { city: name, lat: c[0], lng: c[1] }); setSel(null); setQ(""); }, className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 13.5, color: cur ? "#fff" : t.ink, background: cur ? t.tint : "transparent", border: "1px solid " + (cur ? t.tint : t.line), borderRadius: 999, padding: "7px 15px" } }, name);
          }),
          cityList.length === 0 ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: 8 } }, "没找到这个城市，换个说法试试（目前支持常用城市）") : null)));
  }

  window.MapKit = { MapWidget: MapWidget, CharMap: CharMap, CITY_DB: CITY_DB, charHome: charHome };
})();
