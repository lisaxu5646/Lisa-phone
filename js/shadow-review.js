// 07-22 Shadow 转正评审包：统一读取各旁路的聚合报告。
// 只读、不清数据、不切开关；导出不含聊天正文、prompt 或思维链。
(function () {
  "use strict";
  const safe = async (name, fn) => {
    try { return await fn(); } catch (e) { return { error: name + " 读取失败" }; }
  };
  const ownerId = async () => {
    try { const u = window.Cloud && window.Cloud.getSessionUser && await window.Cloud.getSessionUser(); if (u && u.id) return u.id; } catch (e) {}
    return "local-device";
  };
  const cleanPersonality = report => {
    if (!report || report.error) return report;
    return {
      cards: report.cards, firstObservedAt: report.firstObservedAt, lastObservedAt: report.lastObservedAt, spanHours: report.spanHours, types: report.types, dimensions: report.dimensions,
      tenDayMismatches: report.tenDayMismatches, conflictingTraits: report.conflictingTraits,
      recent: (report.last || []).map(x => ({
        fingerprint: x.fingerprint, charHash: x.charHash, type: x.type, dimension: x.dimension,
        traitKey: x.traitKey, seenCount: x.seenCount, mismatchSpanDays: x.mismatchSpanDays,
        eligibleAfterTenDays: !!x.eligibleAfterTenDays, hasConflict: !!x.hasConflict,
        firstSeenAt: x.firstSeenAt, lastSeenAt: x.lastSeenAt,
        evidenceCount: (x.observations || []).reduce((n, o) => n + (o.evidence || []).length, 0)
      }))
    };
  };
  async function build(characters, appVersion) {
    const chars = Array.isArray(characters) ? characters : [], owner = await ownerId();
    const modules = {
      recall: window.RecallShadow, extraction: window.MemoryQualityShadow,
      correction: window.MemoryCorrectionShadow, repairGate: window.OpenRepairShadow,
      experienceGate: window.ExperienceGateShadow, twoResolution: window.TwoResolutionShadow,
      contextBudget: window.ContextBudgetShadow, messageBranch: window.MessageBranchShadow,
      insightCandidates: window.InsightCandidateShadow
    };
    const memory = {};
    for (const [key, mod] of Object.entries(modules)) {
      memory[key] = await safe(key, () => mod && mod.report ? mod.report(key === "recall" ? 300 : 300) : ({ unavailable: true }));
    }
    const e = await safe("E", () => window.InnerLifeETidalShadow && window.InnerLifeETidalShadow.report ? window.InnerLifeETidalShadow.report() : ({ unavailable: true }));
    const c = await safe("C", () => window.SleepShadow && window.SleepShadow.report ? window.SleepShadow.report(500) : ({ unavailable: true }));
    const personality = cleanPersonality(await safe("personality", () => window.PersonalityShadow && window.PersonalityShadow.report ? window.PersonalityShadow.report() : ({ unavailable: true })));
    const a = [], b = [], drives = [];
    for (const char of chars) {
      const label = char.remark || char.name || char.id;
      if (window.InnerLifeAShadow) {
        const state = await safe("A state", () => window.InnerLifeAShadow.get(owner, char.id));
        const report = await safe("A report", () => window.InnerLifeAShadow.report(owner, char.id));
        if (state || (report && report.sampleCount)) a.push({ charId: char.id, name: label, state, report });
      }
      if (window.InnerLifeBShadow && window.InnerLifeBShadow.pilotFor && window.InnerLifeBShadow.pilotFor(char)) {
        b.push({ charId: char.id, name: label, report: await safe("B report", () => window.InnerLifeBShadow.report(owner, char)) });
      }
      if (window.DesireDriveShadow && window.DesireDriveShadow.status) {
        const state = await safe("drive", () => window.DesireDriveShadow.status(char.id));
        if (state) drives.push({ charId: char.id, name: label, drives: state.drives, baselines: state.baselines, top: state.top, ticks: state.ticks, warnings: state.warnings, suppressed: state.suppressed, updatedAt: state.t });
      }
    }
    return {
      schema: "lisa-shadow-promotion-review-v1",
      generatedAt: new Date().toISOString(), appVersion: appVersion || null,
      safety: { readOnly: true, changedLiveBehavior: false, containsChatText: false, openedAnyGate: false },
      sampleWindow: { note: "各模块保留期不同；样本不足只能续观，不能自动转正。" },
      memory, innerLife: { E: e, A: a, B: b, C: c, legacyNineDrives: drives }, personality
    };
  }
  async function download(characters, appVersion) {
    const data = await build(characters, appVersion), stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "lisa-shadow-review-" + stamp + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return data;
  }
  window.ShadowReview = Object.freeze({ build, download });
})();
