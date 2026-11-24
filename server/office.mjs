import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.mjs";
import { assignIdentities, identityFor, hashString } from "./names.mjs";

const ACCENTS = [
  { id: "mint", main: "#55c9a6", soft: "#a6ecd7", dark: "#246f5c" },
  { id: "amber", main: "#e9a63a", soft: "#f6d79a", dark: "#7b5217" },
  { id: "coral", main: "#e26d62", soft: "#f4b3ab", dark: "#7c2f2a" },
  { id: "violet", main: "#917ce0", soft: "#c9bdf4", dark: "#46367c" },
  { id: "sky", main: "#57a9d6", soft: "#b3dcf2", dark: "#235b7a" },
  { id: "lime", main: "#a9c94e", soft: "#d9eaa2", dark: "#566b1f" },
  { id: "rose", main: "#dd7fa6", soft: "#f4bdd2", dark: "#7c2f4c" },
];

let db = null;
let dbLoadedFrom = null;

function getDb() {
  if (db && dbLoadedFrom === config.dbPath) return db;
  closeDb();
  if (!config.dbPath || !fs.existsSync(config.dbPath)) {
    throw new Error(`opencode database not found at ${config.dbPath || "(unknown path)"}`);
  }
  try {
    db = new DatabaseSync(config.dbPath, { readOnly: true });
  } catch {
    db = new DatabaseSync(config.dbPath);
    db.exec("PRAGMA query_only = ON");
  }
  db.exec("PRAGMA busy_timeout = 2500");
  dbLoadedFrom = config.dbPath;
  return db;
}

export function closeDb() {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
  }
  db = null;
  dbLoadedFrom = null;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function basename(p) {
  if (!p) return "";
  return String(p).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || String(p);
}

function prettyName(raw) {
  const s = String(raw || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "Untitled room";
  if (s.length <= 26) return s;
  return s.slice(0, 25) + "…";
}

function accentFor(key) {
  return ACCENTS[hashString("room:" + key) % ACCENTS.length];
}

function parseModel(value) {
  const m = parseJson(value, null);
  if (!m) return { provider: "", id: String(value || ""), label: String(value || "") };
  const id = m.id || m.modelID || "";
  const provider = m.providerID || "";
  return { provider, id, label: id || provider || "unknown" };
}

function firstLine(s, max = 90) {
  const one = String(s || "").replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

function fileName(input) {
  const p = input?.path || input?.filePath || input?.file || input?.filename || "";
  return basename(p) || "file";
}

/** Turn a tool call into something the office can display. */
export function describeTool(tool) {
  if (!tool) return { kind: "think", label: "Thinking", detail: "" };
  const input = tool.state?.input || tool.input || {};
  const name = String(tool.name || "tool");

  if (name === "shell" || name === "bash" || name === "execute") {
    const cmd = firstLine(input.command || input.code || "", 120);
    let label = "Running command";
    if (/\b(test|tests|vitest|jest|pytest|spec)\b/i.test(cmd)) label = "Running tests";
    else if (/\b(build|tsc|vite build|bundle|compile)\b/i.test(cmd)) label = "Building";
    else if (/\b(install|npm i|pnpm i|yarn)\b/i.test(cmd)) label = "Installing";
    else if (/\b(git|commit|push|pull)\b/i.test(cmd)) label = "On git duty";
    else if (name === "execute") label = "Running a script";
    return { kind: "terminal", label, detail: cmd };
  }
  if (name === "read") return { kind: "read", label: "Reading " + fileName(input), detail: String(input.path || "") };
  if (name === "edit") return { kind: "edit", label: "Editing " + fileName(input), detail: String(input.path || "") };
  if (name === "write") return { kind: "write", label: "Writing " + fileName(input), detail: String(input.path || "") };
  if (name === "grep") return { kind: "search", label: "Searching the code", detail: firstLine(input.pattern, 70) };
  if (name === "glob") return { kind: "search", label: "Finding files", detail: firstLine(input.pattern, 70) };
  if (name === "webfetch") {
    let host = "";
    try { host = new URL(String(input.url || "")).hostname; } catch { host = firstLine(input.url, 60); }
    return { kind: "web", label: "Fetching a page", detail: host };
  }
  if (name === "websearch") return { kind: "web", label: "Searching the web", detail: firstLine(input.query, 70) };
  if (name === "skill") return { kind: "skill", label: "Loading a skill", detail: firstLine(input.id || input.name, 48) };
  if (name === "question" || name === "askuserquestion") return { kind: "question", label: "Waiting for your answer", detail: firstLine(input.questions?.[0]?.question || input.question, 90) };
  if (name === "task" || name === "agent") return { kind: "delegate", label: "Delegating work", detail: firstLine(input.description || input.prompt, 70) };
  if (name === "todowrite" || name === "todoread") return { kind: "plan", label: "Planning the work", detail: "" };
  if (name === "apply_patch" || name === "patch") return { kind: "edit", label: "Applying a patch", detail: "" };
  return { kind: "tool", label: name.charAt(0).toUpperCase() + name.slice(1), detail: "" };
}

function toolStatus(tool) {
  return tool?.state?.status || tool?.status || "completed";
}

function collectTools(data) {
  const list = [];
  if (!Array.isArray(data?.content)) return list;
  for (const part of data.content) {
    if (part?.type === "tool") list.push(part);
  }
  return list;
}

function latestAssistant(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === "assistant") return msgs[i];
  }
  return null;
}

function latestIdle(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === "idle") return msgs[i];
  }
  return null;
}

function toolErrorText(tool) {
  const state = tool?.state || {};
  const err = state.error || state.output || state.metadata?.error;
  if (!err) return "";
  if (typeof err === "string") return firstLine(err, 160);
  return firstLine(err.message || JSON.stringify(err), 160);
}

function deriveAgent(session, msgs, identity, now, parentVisible) {
  const model = parseModel(session.model);
  const busy = Number(session.time_busy || 0) > Number(session.time_idle || 0);
  const lastAssistant = latestAssistant(msgs);
  const idle = latestIdle(msgs);
  let lastTool = null;

  if (lastAssistant) {
    const data = parseJson(lastAssistant.data, {});
    const tools = collectTools(data);
    lastTool = tools[tools.length - 1] || null;
    if (lastTool) {
      lastTool = { ...lastTool, _status: toolStatus(lastTool) };
    }
  }

  let status = "idle";
  let activity = { kind: "idle", label: "At ease", detail: "" };
  let attention = false;

  if (busy) {
    status = "working";
    const running = lastTool && lastTool._status === "running" ? lastTool : null;
    if (running && running.name === "question") {
      status = "attention";
      attention = true;
      activity = { ...describeTool(running), label: "Waiting for your answer" };
    } else if (running) {
      activity = describeTool(running);
    } else {
      activity = { kind: "think", label: "Thinking", detail: "" };
    }
  } else {
    const idleData = parseJson(idle?.data, {});
    const lastData = lastAssistant ? parseJson(lastAssistant.data, {}) : {};
    const outcome = idleData?.outcome;
    const hasError = !!(lastData?.error || (lastTool && lastTool._status === "error"));
    if (hasError || (outcome && outcome !== "succeeded" && outcome !== "aborted")) {
      status = "attention";
      attention = true;
      const err = lastData?.error;
      activity = {
        kind: "error",
        label: outcome === "aborted" ? "Stopped" : "Hit an error",
        detail: firstLine(typeof err === "string" ? err : err?.message || toolErrorText(lastTool), 120),
      };
    } else {
      const last = lastTool ? describeTool(lastTool) : null;
      activity = {
        kind: "idle",
        label: "At ease",
        detail: last ? last.label : "No open task",
        lastAction: last,
      };
    }
  }

  const updatedAt = Number(session.time_updated || session.time_created || 0);
  const isChild = !!session.parent_id;
  return {
    id: session.id,
    name: identity.name,
    trait: identity.trait,
    look: identity.look,
    title: session.title || "Untitled session",
    agent: session.agent || "build",
    model: model.label,
    provider: model.provider,
    directory: session.directory || "",
    status,
    attention,
    busy,
    activity,
    isChild,
    parentId: isChild && parentVisible.has(session.parent_id) ? session.parent_id : null,
    startedAt: Number(session.time_created || 0),
    updatedAt,
    busySince: busy ? Number(session.time_busy || 0) : 0,
    idleSince: !busy ? Number(session.time_idle || session.time_updated || 0) : 0,
    ageMs: Math.max(0, now - updatedAt),
    tokens: {
      input: Number(session.tokens_input || 0),
      output: Number(session.tokens_output || 0),
    },
    cost: Number(session.cost || 0),
    files: Number(session.summary_files || 0),
    additions: Number(session.summary_additions || 0),
    deletions: Number(session.summary_deletions || 0),
  };
}

function readMessagesFor(ids) {
  if (!ids.length) return new Map();
  const database = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = database.prepare(`
    WITH ranked AS (
      SELECT id, session_id, type, seq, time_created, data,
             ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY time_created DESC, seq DESC) AS rn
      FROM session_message
      WHERE session_id IN (${placeholders})
    )
    SELECT id, session_id, type, seq, time_created, data
    FROM ranked WHERE rn <= 24
    ORDER BY session_id ASC, time_created ASC, seq ASC
  `).all(...ids);

  const map = new Map(ids.map((id) => [id, []]));
  for (const row of rows) {
    const list = map.get(row.session_id);
    if (list) list.push(row);
  }
  return map;
}

export function readOffice(now = Date.now()) {
  const database = getDb();
  const cutoff = now - config.windowMinutes * 60_000;

  const projects = new Map();
  for (const p of database.prepare("SELECT id, name, worktree FROM project").all()) {
    projects.set(p.id, p);
  }

  const rows = database.prepare(`
    SELECT s.id, s.project_id, s.parent_id, s.directory, s.title, s.agent, s.model,
           s.time_created, s.time_updated, s.time_busy, s.time_idle, s.idle_outcome,
           s.tokens_input, s.tokens_output, s.cost,
           s.summary_files, s.summary_additions, s.summary_deletions
    FROM session_v2 s
    WHERE s.time_archived IS NULL
      AND (s.time_updated >= ? OR s.time_busy > COALESCE(s.time_idle, 0))
    ORDER BY MAX(COALESCE(s.time_updated, 0), COALESCE(s.time_busy, 0)) DESC
    LIMIT 60
  `).all(cutoff);

  const ids = rows.map((s) => s.id);
  const messageMap = readMessagesFor(ids);
  const identities = assignIdentities(ids);
  const visibleIds = new Set(ids);

  const roomMap = new Map();
  for (const session of rows) {
    const project = session.project_id ? projects.get(session.project_id) : null;
    const key = session.project_id || session.directory || session.id;
    const pathValue = session.directory || project?.worktree || "";
    if (!roomMap.has(key)) {
      const accent = accentFor(key);
      roomMap.set(key, {
        id: key,
        name: prettyName(project?.name || basename(project?.worktree || pathValue) || "Workspace"),
        path: pathValue,
        accent,
        agents: [],
        lastActive: 0,
      });
    }
    const room = roomMap.get(key);
    const identity = identities.get(session.id) || identityFor(session.id);
    const agent = deriveAgent(session, messageMap.get(session.id) || [], identity, now, visibleIds);
    room.agents.push(agent);
    room.lastActive = Math.max(room.lastActive, agent.updatedAt);
  }

  const rooms = [...roomMap.values()]
    .sort((a, b) => b.lastActive - a.lastActive)
    .slice(0, config.maxRooms);

  for (const room of rooms) {
    room.agents.sort((a, b) => a.startedAt - b.startedAt || a.name.localeCompare(b.name));
    room.agents = room.agents.slice(0, config.maxAgentsPerRoom).map((agent, index) => ({
      ...agent,
      seat: index,
      seatKind: index < 3 ? "desk" : "standing",
    }));
    room.working = room.agents.filter((a) => a.status === "working").length;
    room.attention = room.agents.filter((a) => a.attention).length;
    room.idle = room.agents.filter((a) => a.status === "idle").length;
    room.agentCount = room.agents.length;
  }

  const agents = rooms.flatMap((r) => r.agents.map((a) => ({ ...a, roomId: r.id, roomName: r.name, accent: r.accent })));
  const stats = {
    rooms: rooms.length,
    agents: agents.length,
    working: agents.filter((a) => a.status === "working").length,
    attention: agents.filter((a) => a.status === "attention").length,
    idle: agents.filter((a) => a.status === "idle").length,
    subagents: agents.filter((a) => a.isChild).length,
    tokens: agents.reduce((n, a) => n + a.tokens.input + a.tokens.output, 0),
  };

  return {
    ok: true,
    demo: false,
    version: config.version,
    generatedAt: now,
    dbPath: config.dbPath,
    windowMinutes: config.windowMinutes,
    stats,
    rooms,
    _identities: identities,
  };
}

function formatToolResult(tool) {
  const status = toolStatus(tool);
  if (status === "error") return toolErrorText(tool);
  if (!["shell", "execute", "grep", "glob", "webfetch", "websearch", "question"].includes(tool.name)) return "";
  const content = tool.state?.content;
  if (!Array.isArray(content)) return "";
  const text = content.filter((c) => c?.type === "text").map((c) => c.text).join("\n");
  return firstLine(text, 420);
}

export function readSessionDetail(sessionId, identities = new Map()) {
  const database = getDb();
  const row = database.prepare(`
    SELECT s.*, p.name AS project_name, p.worktree AS project_worktree
    FROM session_v2 s LEFT JOIN project p ON p.id = s.project_id
    WHERE s.id = ?
  `).get(sessionId);
  if (!row) return null;

  const raw = database.prepare(`
    SELECT id, type, seq, time_created, data FROM (
      SELECT id, type, seq, time_created, data
      FROM session_message WHERE session_id = ?
      ORDER BY time_created DESC, seq DESC LIMIT ?
    ) ORDER BY time_created ASC, seq ASC
  `).all(sessionId, config.detailMessages);

  const identity = identities.get(sessionId) || identityFor(sessionId);
  const model = parseModel(row.model);
  const items = [];

  for (const msg of raw) {
    const data = parseJson(msg.data, {});
    if (msg.type === "user") {
      const text = String(data.text || data.metadata?.displayText || "").trim();
      if (text) items.push({ kind: "prompt", time: msg.time_created, text: text.slice(0, 6000) });
      continue;
    }
    if (msg.type === "compaction") {
      items.push({ kind: "note", time: msg.time_created, text: "Context compacted" });
      continue;
    }
    if (msg.type !== "assistant") continue;

    for (const part of Array.isArray(data.content) ? data.content : []) {
      if (part.type === "text" && part.text?.trim()) {
        items.push({ kind: "text", time: part.time?.created || msg.time_created, text: part.text.trim().slice(0, 6000) });
      } else if (part.type === "tool") {
        const activity = describeTool(part);
        items.push({
          kind: "tool",
          time: part.time?.created || msg.time_created,
          name: part.name,
          status: toolStatus(part),
          label: activity.label,
          detail: activity.detail,
          result: formatToolResult(part),
        });
      }
    }
    if (data.error) {
      const err = typeof data.error === "string" ? data.error : data.error.message || "The agent hit an error";
      items.push({ kind: "error", time: msg.time_created, text: firstLine(err, 400) });
    }
  }

  const trimmed = items.slice(-140);
  const key = row.project_id || row.directory || row.id;
  const accent = accentFor(key);
  const roomName = prettyName(row.project_name || basename(row.project_worktree || row.directory) || "Workspace");
  return {
    ok: true,
    session: {
      id: row.id,
      name: identity.name,
      trait: identity.trait,
      look: identity.look,
      title: row.title || "Untitled session",
      roomName,
      accent,
      directory: row.directory || "",
      agent: row.agent || "build",
      model: model.label,
      provider: model.provider,
      created: Number(row.time_created || 0),
      updated: Number(row.time_updated || 0),
      busy: Number(row.time_busy || 0) > Number(row.time_idle || 0),
      tokens: { input: Number(row.tokens_input || 0), output: Number(row.tokens_output || 0) },
      cost: Number(row.cost || 0),
      files: Number(row.summary_files || 0),
      additions: Number(row.summary_additions || 0),
      deletions: Number(row.summary_deletions || 0),
      isChild: !!row.parent_id,
      parentId: row.parent_id || null,
    },
    items: trimmed,
  };
}
