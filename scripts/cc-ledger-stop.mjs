#!/usr/bin/env node
import { readFileSync, mkdirSync, existsSync, appendFileSync, writeFileSync, renameSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { classifyTurn, extractLastTurn, parseLedgerMarker, validateToolMark } = require("./cc-ledger-nature.cjs");

const input = await new Promise(resolve => {
  let body = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { body += chunk; });
  process.stdin.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); } });
});

const projectDir = String(input.cwd || process.env.CLAUDE_PROJECT_DIR || "/Users/lisa/Desktop/Lisa-phone");
const stateDir = join(projectDir, ".claude", "cc-ledger-state");
const outboxPath = join(stateDir, "outbox.jsonl");
const candidatePath = join(stateDir, "candidates.jsonl");
const diagnosticPath = join(stateDir, "diagnostic.jsonl");
const toolMarksPath = join(stateDir, "tool-marks.jsonl");
mkdirSync(stateDir, { recursive: true });

function log(path, value) {
  appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...value }) + "\n");
}
function readJSONL(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
}
function replaceJSONL(path, rows) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, rows.map(x => JSON.stringify(x)).join("\n") + (rows.length ? "\n" : ""));
  renameSync(tmp, path);
}
function loadEnv() {
  const envPath = "/Users/lisa/Desktop/lisa-practice/mcp/.env";
  const env = {};
  readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });
  return env;
}

async function request(base, key, path, options = {}) {
  const headers = { apikey: key, Authorization: "Bearer " + key, ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw new Error("supabase " + response.status + ": " + (await response.text()).slice(0, 160));
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function resolveYanqiu(base, key, user) {
  const saves = await request(base, key, `/rest/v1/saves?select=data&user_id=eq.${user}`);
  if (!saves[0]) throw new Error("cloud save missing");
  const data = saves[0].data || {};
  const chars = JSON.parse(data.x_characters || "[]");
  const settings = JSON.parse(data.x_chatSettings || "{}");
  const digital = chars.filter(c => c && settings[c.id] && settings[c.id].engineerEyes === true);
  const char = digital.length === 1 ? digital[0] : chars.find(c => c && /小克|言秋/.test(String(c.name || "") + String(c.remark || "")));
  if (!char) throw new Error("yanqiu identity missing");
  return String(char.id);
}

async function sendJob(job) {
  const env = loadEnv();
  const base = "https://nposjnafsbikwfeoudbg.supabase.co";
  const key = env.SUPABASE_SERVICE_KEY;
  const user = env.TARGET_USER;
  if (!key || !user) throw new Error("mcp env incomplete");
  const charId = await resolveYanqiu(base, key, user);
  const hash = createHash("sha256").update(job.session_id + "\0" + job.turn_id).digest("hex").slice(0, 32);
  const baseMs = Number.isFinite(Date.parse(job.occurred_at)) ? Date.parse(job.occurred_at) : Date.now();
  const makeRows = (segments, side, speakerType, offset) => segments.map((segment, index) => ({
    user_id: user,
    message_key: `cc:${hash}:${side}:${index}`,
    char_id: charId,
    thread_type: "cc",
    thread_id: job.session_id,
    speaker_type: speakerType,
    speaker_id: speakerType === "character" ? charId : null,
    content: segment.content,
    occurred_at: new Date(baseMs + offset + index).toISOString(),
    source: "cc",
    source_message_id: `${job.session_id}:${job.turn_id}:${side}:${index}`,
    metadata: {
      shadow_version: 1,
      auto_capture_version: 1,
      excerpted: job.excerpted,
      sync_kind: segment.sync_kind,
      segment_side: side,
      segment_index: index,
      ...(side === "yanqiu" && index === 0 && job.personality_evidence ? { personality_evidence: job.personality_evidence } : {})
    }
  }));
  const rows = [
    ...makeRows(job.lisa_segments, "lisa", "lisa", 0),
    ...makeRows(job.yanqiu_segments, "yanqiu", "character", job.lisa_segments.length + 1)
  ];
  await request(base, key, "/rest/v1/chat_messages?on_conflict=user_id,message_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: rows
  });
}

async function flushOutbox() {
  const pending = readJSONL(outboxPath);
  const remaining = [];
  for (const job of pending) {
    try { await sendJob(job); }
    catch { remaining.push(job); }
  }
  replaceJSONL(outboxPath, remaining);
}

function consumeToolMark(turn) {
  const now = Date.now();
  const rows = readJSONL(toolMarksPath);
  const fresh = rows.filter(x => Number.isFinite(Date.parse(x.created_at)) && now - Date.parse(x.created_at) < 30 * 60000);
  let picked = -1, validation = null;
  for (let i = fresh.length - 1; i >= 0; i--) {
    const anchor = String(fresh[i] && fresh[i].lisa_anchor || "").trim();
    if (!anchor || !turn.lisaText.includes(anchor)) continue;
    picked = i;
    validation = validateToolMark(fresh[i], turn.lisaText, turn.yanqiuText);
    break;
  }
  if (picked >= 0) fresh.splice(picked, 1);
  replaceJSONL(toolMarksPath, fresh);
  return validation;
}

try {
  await flushOutbox();
  const transcriptPath = String(input.transcript_path || "");
  if (!transcriptPath || !existsSync(transcriptPath)) throw new Error("transcript missing");
  const turn = extractLastTurn(readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean));
  if (!turn || !turn.sessionId || !turn.turnId) throw new Error("complete visible turn missing");
  const toolMark = consumeToolMark(turn);
  const marker = parseLedgerMarker(turn.lisaText, turn.yanqiuText);
  const result = toolMark && toolMark.valid
    ? toolMark.result
    : marker.valid ? marker.result : classifyTurn(turn.lisaText, marker.cleanYanqiuText);
  const decisionSource = toolMark && toolMark.valid
    ? "yanqiu_tool"
    : marker.valid ? "legacy_yanqiu_marker" : "mechanical_fallback";
  const job = {
    session_id: turn.sessionId,
    turn_id: turn.turnId,
    occurred_at: turn.occurredAt,
    excerpted: result.excerpted,
    lisa_segments: result.lisa_segments,
    yanqiu_segments: result.yanqiu_segments,
    personality_evidence: result.personality_evidence || null
  };
  if (result.automatic) {
    try {
      await sendJob(job);
      log(diagnosticPath, { turn_id: turn.turnId, outcome: "synced", decision_source: decisionSource, rows: job.lisa_segments.length + job.yanqiu_segments.length });
    } catch (error) {
      const queued = readJSONL(outboxPath);
      if (!queued.some(x => x.session_id === job.session_id && x.turn_id === job.turn_id)) {
        appendFileSync(outboxPath, JSON.stringify(job) + "\n");
      }
      log(diagnosticPath, { turn_id: turn.turnId, outcome: "queued_offline", decision_source: decisionSource, error: String(error.message || error).slice(0, 160) });
    }
  } else if (result.skipConstruction) {
    log(diagnosticPath, { turn_id: turn.turnId, outcome: marker.valid ? "skipped_by_marker" : "skipped_construction", decision_source: decisionSource });
  } else {
    const candidates = readJSONL(candidatePath);
    if (!candidates.some(x => x.session_id === turn.sessionId && x.turn_id === turn.turnId)) {
      log(candidatePath, {
        ...job,
        lisa_original: turn.lisaText.slice(0, 16000),
        yanqiu_original: marker.cleanYanqiuText.slice(0, 16000),
        local_excerpted: turn.lisaText.length > 16000 || marker.cleanYanqiuText.length > 16000,
        reasons: result.reasons,
        status: "candidate"
      });
    }
    log(diagnosticPath, {
      turn_id: turn.turnId,
      outcome: "candidate",
      decision_source: decisionSource,
      marker_error: marker.present && !marker.valid ? marker.reason : undefined,
      tool_error: toolMark && !toolMark.valid ? toolMark.reason : undefined,
      reasons: result.reasons
    });
  }
} catch (error) {
  log(diagnosticPath, { outcome: "ignored", error: String(error.message || error).slice(0, 160) });
}

// Deliberately write nothing to stdout/stderr: Stop hook must never alter Claude's context.
