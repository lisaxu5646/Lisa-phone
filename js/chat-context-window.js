(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChatContextWindow = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function select(messages, options) {
    const list = Array.isArray(messages) ? messages : [];
    const opts = options || {};
    const maxChars = Math.max(1000, Number(opts.maxChars) || 14000);
    const maxMessages = Math.max(1, Number(opts.maxMessages) || 80);
    const picked = [];
    let chars = 0;

    // Only the prompt window is bounded. The original array and stored chat are untouched.
    for (let i = list.length - 1; i >= 0 && picked.length < maxMessages; i--) {
      const message = list[i];
      const cost = String(message && message.content || "").length + 48;
      if (picked.length && chars + cost > maxChars) break;
      picked.push(message);
      chars += cost;
    }
    picked.reverse();
    return picked;
  }

  return { select };
});
