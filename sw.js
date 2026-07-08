// ========== ARCHIVE Service Worker ==========
// 只负责「锁屏通知」，不预缓存任何资源——app 靠 index.html 的 ?v= 版本号刷新，
// SW 缓存反而会造成拿到旧文件，所以这里刻意不 cache。
const SW_VERSION = "archive-sw-v1";

// 安装即接管，激活即控制所有页面（不等下次刷新）
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ===== 页面发来「显示本地通知」的指令（纯前端，不依赖推送服务器）=====
// 这是 iOS PWA 也能弹锁屏通知的关键：页面 postMessage → SW showNotification。
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type !== "SHOW_LOCAL_NOTIFICATION") return;
  self.registration.showNotification(d.title || "ARCHIVE", {
    body: d.body || "",
    icon: d.icon || "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || ("archive-" + Date.now()),
    renotify: !!d.tag,
    data: { charId: d.charId || "", screen: d.screen || "" },
    vibrate: [80, 40, 80],
    requireInteraction: false,
  });
});

// ===== 远程推送（若将来接了推送服务器才会走到；纯前端用不到）=====
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "ARCHIVE", {
    body: d.body || "",
    icon: d.icon || "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || "archive-push",
    data: { charId: d.charId || "", screen: d.screen || "" },
    vibrate: [80, 40, 80],
  }));
});

// ===== 点通知：聚焦已开的窗口并让它打开对应聊天，否则开新窗口 =====
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const charId = (event.notification.data && event.notification.data.charId) || "";
  const screen = (event.notification.data && event.notification.data.screen) || "";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.startsWith(self.registration.scope)) {
          c.focus();
          c.postMessage({ type: "OPEN_FROM_NOTIF", charId: charId, screen: screen });
          return;
        }
      }
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
