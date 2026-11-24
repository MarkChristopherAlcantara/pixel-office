import { drawAvatar, drawPortrait } from "./sprites.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const STATUS_TEXT = {
  working: "WORKING",
  attention: "NEEDS YOU",
  idle: "AT EASE",
};

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatClock(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDate(date) {
  return `${DAYS[date.getDay()]} ${pad2(date.getDate())} ${MONTHS[date.getMonth()]}`;
}

export function formatRelative(ts, now = Date.now()) {
  if (!ts) return "—";
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatSince(ts, now = Date.now()) {
  if (!ts) return "—";
  return formatRelative(ts, now);
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ${min % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatTokens(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function short(text, max) {
  const value = String(text ?? "");
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/* ── chrome ─────────────────────────────────────────────── */

export function drawBrandMark(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  const r = (x, y, rw, rh, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, rw, rh);
  };
  const sx = w / 52;
  const s = (x, y, rw, rh, color) => r(Math.round(x * sx), Math.round(y * sx), Math.round(rw * sx), Math.round(rh * sx), color);

  s(6, 12, 40, 34, "#05090f");
  s(8, 14, 36, 32, "#1b2a44");
  s(8, 14, 36, 3, "#5ad4b2");
  s(11, 20, 9, 8, "#f2b24c");
  s(24, 20, 9, 8, "#5aa9e6");
  s(11, 31, 9, 8, "#5ad4b2");
  s(24, 31, 9, 8, "#ef7464");
  s(37, 20, 4, 19, "#0b1322");
  s(38, 23, 2, 4, "#8f9db7");
  s(4, 46, 44, 3, "#0a111d");
  s(10, 8, 32, 2, "#0a111d");
  s(19, 4, 14, 3, "#5ad4b2");
  s(21, 2, 10, 1, "#f3ead7");
}

export function drawClockIcon(canvas, date = new Date()) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const r = (x, y, rw, rh, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, rw, rh);
  };
  r(2, 2, 28, 28, "#05090f");
  r(3, 3, 26, 26, "#22324b");
  r(6, 6, 20, 20, "#e8e2d2");
  r(6, 6, 20, 1, "#fff8e7");
  for (let i = 0; i < 4; i++) {
    r(15, 7 + i, 2, 1, "#5f6f8c");
  }
  const cx = 16;
  const cy = 16;
  const minute = date.getMinutes();
  const hour = date.getHours() % 12 + minute / 60;
  const line = (angle, length, color) => {
    const px = Math.round(cx + Math.sin(angle) * length);
    const py = Math.round(cy - Math.cos(angle) * length);
    const steps = Math.max(Math.abs(px - cx), Math.abs(py - cy));
    for (let i = 0; i <= steps; i++) {
      r(
        Math.round(cx + ((px - cx) * i) / (steps || 1)),
        Math.round(cy + ((py - cy) * i) / (steps || 1)),
        1,
        1,
        color
      );
    }
  };
  line((hour / 12) * Math.PI * 2, 5, "#2a3345");
  line((minute / 60) * Math.PI * 2, 7, "#2a3345");
  r(15, 15, 2, 2, "#c0573f");
}

/* ── stats ──────────────────────────────────────────────── */

export function renderStats(container, stats) {
  const data = [
    { key: "rooms", label: "ROOMS", value: pad2(stats.rooms || 0) },
    { key: "working", label: "WORKING", value: pad2(stats.working || 0) },
    { key: "attention", label: "NEEDS YOU", value: pad2(stats.attention || 0) },
    { key: "idle", label: "AT EASE", value: pad2(stats.idle || 0) },
    { key: "subs", label: "SUBAGENTS", value: pad2(stats.subagents || 0) },
    { key: "tokens", label: "TOKENS", value: formatTokens(stats.tokens || 0) },
  ];
  container.replaceChildren(
    ...data.map((s) => {
      const el = node("div", `stat ${s.key}`);
      el.append(node("b", "", s.value), node("span", "", s.label));
      return el;
    })
  );
}

/* ── sidebar ────────────────────────────────────────────── */

export function renderRoomList(container, rooms, options = {}) {
  const { query = "", focusRoomId = null, selectedAgentId = null, now = Date.now() } = options;
  const needle = query.trim().toLowerCase();
  const blocks = [];
  let total = 0;

  for (const room of rooms) {
    const roomText = `${room.name} ${room.path || ""}`.toLowerCase();
    const roomMatches = !needle || roomText.includes(needle);
    const agents = [];
    for (const agent of room.agents || []) {
      const agentText = `${agent.name} ${agent.title} ${agent.agent} ${agent.activity?.label || ""} ${agent.model}`.toLowerCase();
      if (!roomMatches && needle && !agentText.includes(needle)) continue;
      agents.push(agent);
    }
    if (needle && !roomMatches && agents.length === 0) continue;
    if (!needle) agents.push(...[]);
    const shown = roomMatches ? room.agents || [] : agents;
    total += 1;

    const block = node("div", "room-block");
    block.dataset.roomId = room.id;
    if (room.accent?.main) block.style.setProperty("--room-accent", room.accent.main);
    if (room.id === focusRoomId) block.classList.add("focused");

    const head = node("button", "room-head");
    head.type = "button";
    head.dataset.roomId = room.id;
    head.title = room.path || room.name;
    const swatch = node("i", "room-swatch");
    const name = node("span", "room-name", room.name);
    const busy = room.agents?.filter((a) => a.status === "working").length || 0;
    const alert = room.agents?.filter((a) => a.status === "attention").length || 0;
    const meta = node(
      "span",
      "room-meta",
      `${shown.length} CREW${alert ? ` · ${alert}!` : busy ? ` · ${busy}W` : ""}`
    );
    head.append(swatch, name, meta);

    const list = node("div", "room-agents");
    for (const agent of shown) {
      const row = node("button", "agent-row");
      row.type = "button";
      row.dataset.agentId = agent.id;
      row.dataset.status = agent.status;
      row.title = agent.title || agent.name;
      if (agent.id === selectedAgentId) row.classList.add("active");
      if (agent.status === "idle" && agent.idleSince && now - agent.idleSince > 120000) row.classList.add("away");

      const avatar = document.createElement("canvas");
      avatar.className = "avatar";
      avatar.width = 26;
      avatar.height = 28;
      avatar.setAttribute("aria-hidden", "true");
      drawAvatar(avatar, agent.look);

      const copy = node("div", "agent-copy");
      const nameRow = node("div", "agent-name", agent.name);
      if (agent.isChild) nameRow.append(node("span", "sub-tag", "SUB"));
      const state = node("div", "agent-state");
      state.append(node("i"));
      const label =
        agent.status === "attention"
          ? agent.activity?.label || "Needs you"
          : agent.status === "working"
          ? agent.activity?.label || "Working"
          : "At ease";
      state.append(document.createTextNode(short(label, 30)));
      copy.append(nameRow, state);
      row.append(avatar, copy);
      list.append(row);
    }

    block.append(head, list);
    blocks.push(block);
  }

  if (!blocks.length) {
    blocks.push(node("div", "convo-empty", rooms.length ? "NO MATCHES ON THIS FLOOR" : "NO ROOMS OPEN"));
  }
  container.replaceChildren(...blocks);
  return total;
}

/* ── feed ───────────────────────────────────────────────── */

export function renderFeed(container, feed) {
  const list = [];
  for (const item of feed || []) {
    const row = node("div", "feed-item");
    row.dataset.tone = item.tone || "info";
    row.title = `${item.name || "Office"}: ${item.text}`;
    row.append(
      node("time", "", formatClock(item.time)),
      node("b", "", item.name || "OFFICE"),
      node("span", "", item.text)
    );
    list.push(row);
  }
  if (!list.length) list.push(node("div", "convo-empty", "THE FEED IS QUIET"));
  container.replaceChildren(...list);
}

/* ── drawer ─────────────────────────────────────────────── */

function activityLine(agent) {
  const status = agent?.status || "idle";
  const activity = agent?.activity || {};
  return {
    status,
    label: status === "attention" ? activity.label || "Needs you" : activity.label || (status === "working" ? "Working" : "At ease"),
    detail: activity.detail || "",
  };
}

export function renderDrawer(body, options) {
  const { detail, agent, filter = "all", now = Date.now() } = options;
  const session = detail.session || {};
  const live = agent || {};
  const accent = session.accent || live.accent || { main: "#5ad4b2", soft: "#a6ecd7", dark: "#123b33" };
  const status = live.status || (session.busy ? "working" : "idle");
  const activity = activityLine(live);
  const look = session.look || live.look;
  const title = session.title || live.title || "Untitled session";
  const roomName = session.roomName || live.roomName || "Workspace";
  const tokens = session.tokens || live.tokens || { input: 0, output: 0 };
  const since = status === "working" || status === "attention" ? live.busySince : live.idleSince;
  const files = session.files ?? live.files ?? 0;
  const additions = session.additions ?? live.additions ?? 0;
  const deletions = session.deletions ?? live.deletions ?? 0;

  const head = node("div", "d-head");
  const frame = node("div", "d-portrait");
  const portrait = document.createElement("canvas");
  portrait.width = 84;
  portrait.height = 108;
  portrait.setAttribute("aria-hidden", "true");
  drawPortrait(portrait, look, accent.main);
  frame.append(portrait);

  const ident = node("div", "d-ident");
  ident.append(node("h2", "d-name", session.name || live.name || "Agent"));
  ident.append(node("p", "d-trait", session.trait || live.trait || ""));
  const room = node("div", "d-room");
  room.append(node("i"), document.createTextNode(roomName));
  room.style.setProperty("--room-accent", accent.main);
  const statusEl = node("div", "d-status");
  statusEl.dataset.status = status;
  statusEl.append(node("i"), document.createTextNode(STATUS_TEXT[status] || status.toUpperCase()));
  ident.append(room, statusEl);
  head.append(frame, ident);

  const titleEl = node("h3", "d-title", title);
  titleEl.style.setProperty("--room-accent", accent.main);

  const nowBox = node("div", "d-now");
  nowBox.dataset.status = status;
  const nowHead = node("div", "d-now-head");
  nowHead.append(node("span", "", "RIGHT NOW"), node("span", "elapsed", formatSince(since, now)));
  const nowBody = node("div", "d-now-body");
  const activityEl = node("div", "d-activity");
  activityEl.append(node("span", "dot"), document.createTextNode(short(activity.label, 42).toUpperCase()));
  nowBody.append(activityEl);
  if (activity.detail) nowBody.append(node("div", "d-detail", short(activity.detail, 180)));
  nowBox.append(nowHead, nowBody);

  const grid = node("div", "d-grid");
  const cell = (label, value) => {
    const wrap = node("dl", "d-cell");
    wrap.append(node("dt", "", label), node("dd", "", value));
    return wrap;
  };
  const model = session.model || live.model || "—";
  grid.append(
    cell("MODEL", short(model, 26)),
    cell("TOKENS", `${formatTokens(tokens.input)} IN / ${formatTokens(tokens.output)} OUT`),
    cell("SESSION AGE", formatDuration(now - (session.created || live.startedAt || now))),
    cell("CHANGES", `${files} FILE${files === 1 ? "" : "S"}  +${additions}  −${deletions}`)
  );

  const path = node("div", "d-path");
  path.append(node("span", "", "DIRECTORY"), document.createTextNode(session.directory || live.directory || "—"));

  const items = detail.items || [];
  const chatCount = items.filter((i) => ["prompt", "text", "note"].includes(i.kind)).length;
  const toolCount = items.filter((i) => ["tool", "error"].includes(i.kind)).length;
  const section = node("div", "d-section-head");
  section.append(node("h3", "", `SESSION LOG · ${items.length}`));
  const filters = node("div", "d-filters");
  for (const [key, label, count] of [["all", "ALL", items.length], ["chat", "CHAT", chatCount], ["tools", "TOOLS", toolCount]]) {
    const btn = node("button", "d-filter", `${label} ${count}`);
    btn.type = "button";
    btn.dataset.filter = key;
    if (key === filter) btn.classList.add("active");
    filters.append(btn);
  }
  section.append(filters);

  const convo = node("div", "convo");
  convo.dataset.filter = filter;
  for (const item of items) convo.append(convoItem(item));

  body.replaceChildren(head, titleEl, nowBox, grid, path, section, convo);
  applyDrawerFilter(convo, filter);
}

function convoItem(item) {
  const kind = item.kind || "text";
  const el = node("div", "c-item");
  el.dataset.kind = kind;
  const label = node("div", "c-label");
  const time = node("span", "", formatClock(item.time || Date.now()));
  const kindLabel =
    kind === "prompt" ? "YOU" : kind === "tool" ? "TOOL" : kind === "error" ? "ERROR" : kind === "note" ? "NOTE" : "AGENT";
  label.append(node("b", "", kindLabel), time);
  el.append(label);

  if (kind === "tool") {
    const line = node("div", "c-text");
    line.append(node("span", "c-tool-name", item.label || item.name || "Tool"));
    el.append(line);
    if (item.detail) el.append(node("div", "c-tool-detail", short(item.detail, 200)));
    if (item.result) {
      const result = node("pre", "c-result", short(item.result, 1200));
      el.append(result);
    }
    const status = node("span", `c-status ${item.status || "completed"}`, ` ${(item.status || "completed").toUpperCase()}`);
    label.append(status);
  } else {
    el.append(node("div", "c-text", short(item.text || "", 4000)));
  }
  return el;
}

export function applyDrawerFilter(convo, filter) {
  if (!convo) return;
  convo.dataset.filter = filter;
  for (const item of convo.querySelectorAll(".c-item")) {
    const kind = item.dataset.kind;
    const show =
      filter === "all" ||
      (filter === "chat" && ["prompt", "text", "note"].includes(kind)) ||
      (filter === "tools" && ["tool", "error"].includes(kind));
    item.classList.toggle("hidden", !show);
  }
}

export function setDrawerLoading(body) {
  const wrap = node("div", "convo-empty", "OPENING SESSION FILE…");
  wrap.style.padding = "26px 4px";
  body.replaceChildren(wrap);
}

export function setDrawerError(body, message) {
  const wrap = node("div", "convo-empty", `CAN'T OPEN THIS FILE\n${message}`);
  wrap.style.whiteSpace = "pre-wrap";
  wrap.style.padding = "26px 4px";
  body.replaceChildren(wrap);
}

export { STATUS_TEXT };
