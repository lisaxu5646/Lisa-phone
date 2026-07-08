// ============================================================
// 锁屏通知（PWA / Service Worker）
// 前端本地通知：页面 postMessage → sw.js showNotification。
// iOS 16.4+ 需先「添加到主屏」以独立 app 打开、并授权，才能收到锁屏通知。
// 关掉 app 后的定时投递做不了（要真推送服务器）——只在页面开着/刚切后台时弹。
// ============================================================
(function () {
  const LS_KEY = "x_notifEnabled";
  const supported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

  function permission() { return supported() ? Notification.permission : "unsupported"; }
  function isOn() { return supported() && Notification.permission === "granted" && localStorage.getItem(LS_KEY) === "1"; }

  // 请求权限（必须由用户点击触发）。返回 Promise<'granted'|'denied'|'default'|'unsupported'>
  async function enable() {
    if (!supported()) return "unsupported";
    let perm = Notification.permission;
    if (perm !== "granted") { try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; } }
    if (perm === "granted") localStorage.setItem(LS_KEY, "1");
    return perm;
  }
  function disable() { localStorage.setItem(LS_KEY, "0"); }

  // 弹一条通知。onlyWhenHidden=true 时，页面在前台就不弹（默认 true，符合"切出去才提醒"）。
  function push(opts) {
    opts = opts || {};
    if (!isOn()) return;
    if (opts.onlyWhenHidden !== false && document.visibilityState === "visible") return;
    const payload = {
      type: "SHOW_LOCAL_NOTIFICATION",
      title: opts.title || "ARCHIVE",
      body: (opts.body && opts.body.length > 80) ? opts.body.slice(0, 80) + "…" : (opts.body || ""),
      icon: opts.icon || "icon-192.png",
      tag: opts.tag || "",
      charId: opts.charId || "",
      screen: opts.screen || "",
    };
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (sw) { sw.postMessage(payload); return; }
    // 降级：SW 还没接管时用普通 Notification（前台/刚开时）
    try {
      const n = new Notification(payload.title, { body: payload.body, icon: payload.icon, tag: payload.tag });
      n.onclick = function () { window.focus(); if (payload.charId && window.__openFromNotif) window.__openFromNotif(payload.charId, payload.screen); n.close(); };
      setTimeout(() => n.close(), 6000);
    } catch (e) {}
  }

  // 发一条测试通知（设置页「测试」按钮用；延迟一点方便切后台看锁屏效果）
  function test(delayMs) {
    if (!isOn()) return false;
    setTimeout(() => {
      const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
      const payload = { type: "SHOW_LOCAL_NOTIFICATION", title: "ARCHIVE 通知测试 🔔", body: "锁屏推送成功～切回来继续。", icon: "icon-192.png", tag: "notif-test" };
      if (sw) sw.postMessage(payload);
      else { try { new Notification(payload.title, { body: payload.body, icon: payload.icon }); } catch (e) {} }
    }, delayMs || 0);
    return true;
  }

  window.Notify = { supported, permission, isOn, enable, disable, push, test };
})();
