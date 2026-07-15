// ============================================================
// 记忆迁移·只读审计器（v48.97）
// 只读取本机/旧云存档的 x_memLib，生成原始备份、逐 ID 指纹和差异报告。
// 不写 localStorage、不写 memories 表、不改任何记忆。
// ============================================================
(function () {
  const enc = new TextEncoder();

  function stableJSON(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "[" + value.map(v => stableJSON(v === undefined ? null : v)).join(",") + "]";
    if (typeof value === "object") {
      const keys = Object.keys(value).filter(k => value[k] !== undefined && typeof value[k] !== "function").sort();
      return "{" + keys.map(k => JSON.stringify(k) + ":" + stableJSON(value[k])).join(",") + "}";
    }
    const out = JSON.stringify(value);
    return out === undefined ? "null" : out;
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(String(text)));
    return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, "0")).join("");
  }

  // 未来 memories 表共享的业务字段。hits/lastHit 按 Lisa 定案只留本机，不参与共享行指纹。
  function sharedRow(m) {
    return {
      id: m && m.id,
      text: m && m.text,
      tags: Array.isArray(m && m.tags) ? m.tags : [],
      charIds: Array.isArray(m && m.charIds) ? m.charIds : [],
      v: typeof (m && m.v) === "number" ? m.v : 0,
      a: typeof (m && m.a) === "number" ? m.a : 1,
      open: !!(m && m.open),
      pinned: !!(m && m.pinned),
      ts: Number(m && m.ts) || 0,
      archived: !!(m && m.archived),
      archivedBatch: m && m.archivedBatch != null ? m.archivedBatch : null,
      source: m && m.source != null ? m.source : null
    };
  }

  function parseRaw(raw, label) {
    if (typeof raw !== "string") return { ok: false, label, error: "没有 x_memLib 原始值", rawJson: null, rows: [] };
    try {
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows)) return { ok: false, label, error: "x_memLib 不是数组", rawJson: raw, rows: [] };
      return { ok: true, label, rawJson: raw, rows };
    } catch (e) {
      return { ok: false, label, error: "x_memLib JSON 解析失败：" + ((e && e.message) || e), rawJson: raw, rows: [] };
    }
  }

  async function auditSide(raw, label) {
    const parsed = parseRaw(raw, label);
    if (!parsed.ok) return parsed;
    const idCounts = {};
    parsed.rows.forEach(m => {
      const id = m && m.id != null ? String(m.id) : "";
      if (id) idCounts[id] = (idCounts[id] || 0) + 1;
    });
    const fingerprints = await Promise.all(parsed.rows.map(async (m, index) => ({
      index,
      id: m && m.id != null ? String(m.id) : null,
      fullSha256: await sha256(stableJSON(m)),
      sharedSha256: await sha256(stableJSON(sharedRow(m)))
    })));
    return {
      ok: true,
      label,
      stats: {
        totalRows: parsed.rows.length,
        activeRows: parsed.rows.filter(m => !(m && m.archived)).length,
        archivedRows: parsed.rows.filter(m => !!(m && m.archived)).length,
        uniqueIds: Object.keys(idCounts).length,
        duplicateIds: Object.keys(idCounts).filter(id => idCounts[id] > 1).map(id => ({ id, count: idCounts[id] })),
        missingIds: parsed.rows.filter(m => !m || m.id == null || !String(m.id)).length,
        emptyTexts: parsed.rows.filter(m => !m || !String(m.text || "").trim()).length
      },
      rawSha256: await sha256(parsed.rawJson),
      canonicalFullSha256: await sha256(stableJSON(parsed.rows)),
      canonicalSharedSha256: await sha256(stableJSON(parsed.rows.map(sharedRow))),
      fingerprints,
      // 原始字符串是迁移前的逐字备份；不要重新 stringify 后冒充原件。
      rawJson: parsed.rawJson
    };
  }

  function compareSides(local, cloud) {
    if (!local.ok || !cloud.ok) return { comparable: false };
    const map = side => {
      const out = new Map();
      side.fingerprints.forEach(x => { if (x.id && !out.has(x.id)) out.set(x.id, x); });
      return out;
    };
    const lm = map(local), cm = map(cloud);
    const localIds = [...lm.keys()].sort(), cloudIds = [...cm.keys()].sort();
    const missingInCloud = localIds.filter(id => !cm.has(id));
    const missingInLocal = cloudIds.filter(id => !lm.has(id));
    const changedSharedRows = localIds.filter(id => cm.has(id) && lm.get(id).sharedSha256 !== cm.get(id).sharedSha256).map(id => ({
      id,
      localSharedSha256: lm.get(id).sharedSha256,
      cloudSharedSha256: cm.get(id).sharedSha256
    }));
    return {
      comparable: true,
      exactSharedMatch: missingInCloud.length === 0 && missingInLocal.length === 0 && changedSharedRows.length === 0,
      missingInCloud,
      missingInLocal,
      changedSharedRows
    };
  }

  async function buildMemoryAuditBundle(localRaw, cloudRaw, meta) {
    const local = await auditSide(localRaw, "primary-device-localStorage");
    const cloud = await auditSide(cloudRaw, "legacy-saves-blob");
    return {
      schema: "lisa-memory-audit-v1",
      generatedAt: new Date().toISOString(),
      readOnly: true,
      notes: [
        "本文件含完整私人记忆原文，只作本地迁移备份，不要上传公开仓库。",
        "hits/lastHit 只留本机；sharedSha256 不包含它们，fullSha256 包含原条目的全部现存字段。",
        "生成本报告没有写入、删除或整理任何记忆。"
      ],
      meta: meta || {},
      local,
      cloud,
      diff: compareSides(local, cloud)
    };
  }

  function downloadMemoryAudit(bundle) {
    const stamp = String(bundle.generatedAt || new Date().toISOString()).replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lisa-memory-audit-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.MemoryAudit = { build: buildMemoryAuditBundle, download: downloadMemoryAudit };
})();

