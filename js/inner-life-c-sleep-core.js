// 内在生活系统 C · 睡眠意识纯状态机（DORMANT）
// 第 3 步提供日程派生、意识队列与统一唤醒事务；仍不接消息入口、UI、发声闸或夜巡。
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InnerLifeCSleepCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PHASES = Object.freeze(["awake", "drowsy", "asleep", "waking"]);
  const SCHEMA_VERSION = 1;
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const DROWSY_MS = 45 * MINUTE;
  const WAKING_MS = 45 * MINUTE;
  const PRESSURE_GUARD_MS = 90 * MINUTE;
  const MAX_TICK_MS = 6 * HOUR;
  const PRESSURE_RATE_PER_HOUR = Object.freeze({ awake: 0.025, drowsy: 0.04, asleep: -0.18, waking: 0.01 });
  const FEATURE_PHASE = "shadow";
  const WAKE_REASONS = Object.freeze(["natural", "knock"]);

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const pad2 = value => String(value).padStart(2, "0");

  function localDayKey(utcMs, utcOffsetMinutes) {
    const d = new Date(utcMs + Number(utcOffsetMinutes || 0) * MINUTE);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function shiftDayKey(dayKey, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ""));
    if (!match) return null;
    const d = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3] + Number(days || 0)));
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function localTimeToUtc(dayKey, time, utcOffsetMinutes) {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ""));
    const hm = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
    if (!day || !hm || +hm[1] > 23 || +hm[2] > 59) return null;
    return Date.UTC(+day[1], +day[2] - 1, +day[3], +hm[1], +hm[2]) - Number(utcOffsetMinutes || 0) * MINUTE;
  }

  function normalizedSeqs(plan) {
    let previous = -1, dayOffset = 0;
    return (plan && Array.isArray(plan.seqs) ? plan.seqs : []).map((item, index) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(item && item.time || "").trim());
      if (!m || +m[1] > 23 || +m[2] > 59) return null;
      const minute = +m[1] * 60 + +m[2];
      if (previous >= 0 && minute < previous && previous - minute > 720) dayOffset++;
      if (minute > previous || previous - minute > 720) previous = minute;
      return { item, index, minute, dayOffset };
    }).filter(Boolean);
  }

  function firstWake(plan) {
    const row = normalizedSeqs(plan).find(x => String(x.item.type || "").toLowerCase() !== "sleep");
    return row ? row.item.time : null;
  }

  function sleepStarts(plan) {
    return normalizedSeqs(plan)
      .filter(x => String(x.item.type || "").toLowerCase() === "sleep")
      .map(x => ({ time: x.item.time, dayOffset: x.dayOffset, index: x.index }));
  }

  function wakeAfter(plan, sleep, nextPlan) {
    const sameDay = normalizedSeqs(plan).find(x => x.index > sleep.index && String(x.item.type || "").toLowerCase() !== "sleep");
    if (sameDay) return { time: sameDay.item.time, dayOffset: sameDay.dayOffset };
    const next = normalizedSeqs(nextPlan).find(x => String(x.item.type || "").toLowerCase() !== "sleep");
    return next ? { time: next.item.time, dayOffset: 1 + next.dayOffset } : null;
  }

  function fingerprint(value) {
    let h = 2166136261, text = String(value == null ? "" : value);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function deriveSchedule(now, utcOffsetMinutes, schedules, deviceOffsetMinutes) {
    const roleToday = localDayKey(now, utcOffsetMinutes), deviceToday = localDayKey(now, Number(deviceOffsetMinutes) || 0);
    const plans = schedules && typeof schedules === "object" ? schedules : {};
    const windows = [], starts = [];
    for (const delta of [-1, 0]) {
      const deviceKey = shiftDayKey(deviceToday, delta), roleKey = shiftDayKey(roleToday, delta), nextDeviceKey = shiftDayKey(deviceKey, 1), nextRoleKey = shiftDayKey(roleKey, 1);
      const plan = plans[roleKey] || plans[deviceKey]; // v49.72 起角色当地日键权威；右侧兼容旧设备日键
      const nextPlan = plans[nextRoleKey] || plans[nextDeviceKey];
      for (const sleep of sleepStarts(plan)) {
        const sleepKey = shiftDayKey(roleKey, sleep.dayOffset), start = localTimeToUtc(sleepKey, sleep.time, utcOffsetMinutes);
        const wakeSpec = wakeAfter(plan, sleep, nextPlan);
        const wake = wakeSpec ? localTimeToUtc(shiftDayKey(roleKey, wakeSpec.dayOffset), wakeSpec.time, utcOffsetMinutes) : null;
        starts.push(start);
        if (Number.isFinite(start) && Number.isFinite(wake) && wake > start) windows.push({ start, wake });
      }
    }
    const tomorrowDevice = shiftDayKey(deviceToday, 1), tomorrowRole = shiftDayKey(roleToday, 1);
    for (const sleep of sleepStarts(plans[tomorrowRole] || plans[tomorrowDevice])) starts.push(localTimeToUtc(shiftDayKey(tomorrowRole, sleep.dayOffset), sleep.time, utcOffsetMinutes));
    const validStarts = starts.filter(Number.isFinite).sort((a, b) => a - b);
    const currentWindow = windows.find(x => now >= x.start && now < x.wake) || null;
    const lastWake = windows.filter(x => x.wake <= now).sort((a, b) => b.wake - a.wake)[0] || null;
    const nextSleep = validStarts.find(x => x > now) || null;
    let phase = "awake", sleepStartTs = null, wakeAtTs = null, nextTransitionTs = nextSleep;
    if (currentWindow) {
      phase = "asleep"; sleepStartTs = currentWindow.start; wakeAtTs = currentWindow.wake; nextTransitionTs = currentWindow.wake;
    } else if (lastWake && now < lastWake.wake + WAKING_MS) {
      phase = "waking"; sleepStartTs = lastWake.start; wakeAtTs = lastWake.wake; nextTransitionTs = lastWake.wake + WAKING_MS;
    } else if (nextSleep && now >= nextSleep - DROWSY_MS) {
      phase = "drowsy"; sleepStartTs = nextSleep; nextTransitionTs = nextSleep;
    }
    const reliable = windows.length > 0 || validStarts.length > 0;
    const auditKeys = [...new Set([-1, 0, 1].flatMap(delta => [shiftDayKey(roleToday, delta), shiftDayKey(deviceToday, delta)]))];
    const serial = auditKeys.map(key => [key, normalizedSeqs(plans[key]).map(x => [x.item.time, x.item.type])]);
    return { phase, reliable, sleepStartTs, wakeAtTs, nextTransitionTs, scheduleFingerprint: fingerprint(JSON.stringify(serial)), today: roleToday, scheduleDayKey: plans[roleToday] ? roleToday : deviceToday };
  }

  function createSleepState(now) {
    const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return { schemaVersion: SCHEMA_VERSION, phase: "awake", pressure: 0.25, phaseSince: safeNow, source: "unknown_schedule", lastSleptTs: null, lastWokeTs: null, wakeReason: null, startleTs: null, sleepStartTs: null, wakeAtTs: null, nextTransitionTs: null, forcedUntilTs: null, scheduleFingerprint: null, queue: [], queueOrder: 0, revision: 1, updatedTs: safeNow };
  }

  function safeSleep(previous, now) {
    if (!previous || previous.schemaVersion !== SCHEMA_VERSION || !PHASES.includes(previous.phase)) return createSleepState(now);
    const seen = new Set(), queue = (Array.isArray(previous.queue) ? previous.queue : []).filter(item => {
      const id = String(item && item.messageId || "");
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    }).map((item, index) => ({ messageId: String(item.messageId), arrivedTs: Number(item.arrivedTs) || now, order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1, perceived: false, perceivedTs: null }));
    return { ...createSleepState(now), ...previous, pressure: clamp01(previous.pressure), queue, queueOrder: Math.max(Number(previous.queueOrder) || 0, ...queue.map(x => x.order), 0), updatedTs: Number.isFinite(Number(previous.updatedTs)) ? Number(previous.updatedTs) : now };
  }

  function messageHash(messageId) { return fingerprint("message|" + String(messageId || "")); }
  function arrivalBucket(ts) { return Math.floor((Number(ts) || 0) / (15 * MINUTE)) * 15 * MINUTE; }

  function receiveMessage(sleepState, message, input) {
    const now = Number(input && input.now), arrivedTs = Number.isFinite(now) ? now : Date.now();
    const mode = input && input.mode === "live" ? "live" : "shadow";
    if (input && input.engineerEyes === true) return { state: sleepState || null, message, decision: "exempt", diagnostic: null };
    const state = safeSleep(sleepState, arrivedTs), messageId = String(message && message.id || "");
    if (!message || message.role !== "user" || !messageId) return { state, message, decision: "ignored", diagnostic: null };
    if (state.phase !== "asleep") {
      const nextMessage = mode === "live" ? { ...message, perceived: true, perceivedTs: arrivedTs, sleepQueued: false } : message;
      return { state, message: nextMessage, decision: "perceived_now", diagnostic: null };
    }
    const duplicate = state.queue.some(item => item.messageId === messageId);
    const projectedDepth = state.queue.length + (duplicate ? 0 : 1);
    const diagnostic = { kind: "would_queue", messageIdHash: messageHash(messageId), arrivalBucketTs: arrivalBucket(arrivedTs), projectedDepth, duplicate };
    if (mode === "shadow") return { state: sleepState || state, message, decision: "would_queue", diagnostic };
    if (duplicate) return { state, message: { ...message, perceived: false, perceivedTs: null, sleepQueued: true }, decision: "queued_duplicate", diagnostic };
    const order = Number(state.queueOrder || 0) + 1;
    const queued = { messageId, arrivedTs, order, perceived: false, perceivedTs: null };
    return { state: { ...state, queue: [...state.queue, queued], queueOrder: order, revision: Number(state.revision || 0) + 1, updatedTs: arrivedTs }, message: { ...message, perceived: false, perceivedTs: null, sleepQueued: true }, decision: "queued", diagnostic };
  }

  function planRelease(sleepState, messages, wakeTsValue) {
    const wakeTs = Number.isFinite(Number(wakeTsValue)) ? Number(wakeTsValue) : Date.now(), state = safeSleep(sleepState, wakeTs);
    const byId = new Map((Array.isArray(messages) ? messages : []).filter(Boolean).map(message => [String(message.id || ""), message]));
    const ordered = [...state.queue].sort((a, b) => a.order - b.order || a.arrivedTs - b.arrivedTs), releasable = [], missing = [];
    for (const item of ordered) {
      if (!byId.has(item.messageId)) { missing.push(item.messageId); continue; }
      releasable.push({ messageId: item.messageId, arrivedTs: item.arrivedTs, perceivedTs: wakeTs, order: item.order });
    }
    return { wakeTs, releasable, missing, releaseIds: releasable.map(x => x.messageId), diagnostic: { kind: "would_release", count: releasable.length, orderHashes: releasable.map(x => messageHash(x.messageId)), missingCount: missing.length } };
  }

  function commitRelease(sleepState, messages, plan, succeeded) {
    if (!succeeded || !plan || !Array.isArray(plan.releaseIds)) return { state: sleepState, messages, committed: false };
    const ids = new Set(plan.releaseIds.map(String)), wakeTs = Number(plan.wakeTs) || Date.now(), state = safeSleep(sleepState, wakeTs);
    const nextMessages = (Array.isArray(messages) ? messages : []).map(message => ids.has(String(message && message.id || "")) ? { ...message, perceived: true, perceivedTs: wakeTs, sleepQueued: false } : message);
    return { state: { ...state, queue: state.queue.filter(item => !ids.has(item.messageId)), revision: Number(state.revision || 0) + 1, updatedTs: wakeTs }, messages: nextMessages, committed: true };
  }

  function planWakeRelease(sleepState, messages, input) {
    const now = Number(input && input.now), wakeTs = Number.isFinite(now) ? now : Date.now();
    const reason = WAKE_REASONS.includes(input && input.reason) ? input.reason : "natural";
    const mode = input && input.mode === "live" ? "live" : FEATURE_PHASE;
    if (input && input.engineerEyes === true) return { decision: "exempt", reason, wakeTs, originalState: sleepState || null, proposedState: sleepState || null, release: null, diagnostic: null };
    const state = safeSleep(sleepState, wakeTs), release = planRelease(state, messages, wakeTs);
    if (reason === "knock" && state.phase !== "asleep") return { decision: "already_awake", reason, wakeTs, originalState: sleepState || state, proposedState: state, release, diagnostic: null };
    const proposedState = reason === "knock" ? { ...state, phase: "waking", phaseSince: wakeTs, source: "knock", lastWokeTs: wakeTs, wakeReason: "knock", startleTs: wakeTs, wakeAtTs: wakeTs, nextTransitionTs: wakeTs + WAKING_MS, forcedUntilTs: null, revision: Number(state.revision || 0) + 1, updatedTs: wakeTs } : { ...state, wakeReason: "natural", startleTs: null };
    const diagnostic = { kind: reason === "knock" ? "would_knock_wake" : "would_natural_wake", releaseCount: release.releasable.length, orderHashes: release.diagnostic.orderHashes, missingCount: release.missing.length, startle: reason === "knock" };
    return { decision: mode === "shadow" ? "would_wake_and_release" : "wake_and_release", reason, wakeTs, originalState: sleepState || state, proposedState, release, diagnostic };
  }

  function commitWakeRelease(wakePlan, messages, succeeded) {
    if (!wakePlan || wakePlan.decision !== "wake_and_release") return { state: wakePlan && wakePlan.originalState || null, messages, committed: false };
    if (!succeeded) return { state: wakePlan.originalState, messages, committed: false };
    const released = commitRelease(wakePlan.proposedState, messages, wakePlan.release, true);
    return { ...released, committed: true, wakeReason: wakePlan.reason, startle: wakePlan.reason === "knock" };
  }

  function tickSleep(previous, input) {
    const now = Number(input && input.now);
    const safeNow = Number.isFinite(now) ? now : Date.now();
    if (input && input.engineerEyes === true) return { state: previous || null, exempt: true, transition: null, audit: { source: "exempt_digital", phase: "exempt_digital" } };
    const prev = safeSleep(previous, safeNow), elapsed = Math.max(0, Math.min(MAX_TICK_MS, safeNow - Number(prev.updatedTs || safeNow)));
    const derived = deriveSchedule(safeNow, Number(input && input.utcOffsetMinutes) || 0, input && input.schedules, Number(input && input.deviceOffsetMinutes) || 0);
    const pressurePhase = PHASES.includes(prev.phase) ? prev.phase : "awake";
    let pressure = clamp01(prev.pressure + PRESSURE_RATE_PER_HOUR[pressurePhase] * elapsed / HOUR);
    let phase = derived.phase, source = derived.reliable ? "schedule" : "unknown_schedule", forcedUntilTs = null;
    let sleepStartTs = derived.sleepStartTs, wakeAtTs = derived.wakeAtTs, nextTransitionTs = derived.nextTransitionTs;
    if (prev.source === "knock" && prev.phase === "waking" && Number(prev.nextTransitionTs) > safeNow) {
      phase = "waking"; source = "knock"; sleepStartTs = prev.sleepStartTs; wakeAtTs = prev.wakeAtTs; nextTransitionTs = prev.nextTransitionTs;
    } else if (!derived.reliable && prev.source === "pressure_guard" && Number(prev.forcedUntilTs) > safeNow) {
      phase = "asleep"; source = "pressure_guard"; forcedUntilTs = Number(prev.forcedUntilTs); sleepStartTs = Number(prev.sleepStartTs) || safeNow; wakeAtTs = forcedUntilTs; nextTransitionTs = forcedUntilTs;
    } else if (!derived.reliable && pressure >= 1) {
      phase = "asleep"; source = "pressure_guard"; forcedUntilTs = safeNow + PRESSURE_GUARD_MS; sleepStartTs = safeNow; wakeAtTs = forcedUntilTs; nextTransitionTs = forcedUntilTs;
    }
    const changed = phase !== prev.phase, woke = prev.phase === "asleep" && phase !== "asleep", slept = prev.phase !== "asleep" && phase === "asleep";
    const state = { ...prev, phase, pressure, phaseSince: changed ? safeNow : prev.phaseSince, source, lastSleptTs: slept ? safeNow : prev.lastSleptTs, lastWokeTs: woke ? safeNow : prev.lastWokeTs, sleepStartTs, wakeAtTs, nextTransitionTs, forcedUntilTs, scheduleFingerprint: derived.scheduleFingerprint, revision: Number(prev.revision || 0) + 1, updatedTs: safeNow };
    return { state, exempt: false, transition: changed ? { from: prev.phase, to: phase, at: safeNow, source } : null, audit: { source, reliableSchedule: derived.reliable, elapsedAppliedMs: elapsed, elapsedCapped: safeNow - Number(prev.updatedTs || safeNow) > MAX_TICK_MS, pressureBefore: prev.pressure, pressureAfter: pressure, phase } };
  }

  function tickInnerState(innerState, input) {
    if (!innerState || typeof innerState !== "object") return { state: innerState, sleep: null, exempt: !!(input && input.engineerEyes), transition: null };
    const result = tickSleep(innerState.sleep, input);
    if (result.exempt) return { ...result, sleep: innerState.sleep || null, state: innerState };
    return { ...result, sleep: result.state, state: { ...innerState, sleep: result.state, updatedTs: result.state.updatedTs, revision: Number(innerState.revision || 0) + 1 } };
  }

  return Object.freeze({ PHASES, SCHEMA_VERSION, FEATURE_PHASE, WAKE_REASONS, DROWSY_MS, WAKING_MS, PRESSURE_GUARD_MS, MAX_TICK_MS, PRESSURE_RATE_PER_HOUR, localDayKey, shiftDayKey, localTimeToUtc, deriveSchedule, createSleepState, tickSleep, tickInnerState, messageHash, arrivalBucket, receiveMessage, planRelease, commitRelease, planWakeRelease, commitWakeRelease });
});
