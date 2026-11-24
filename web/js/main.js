import { initPixelFont } from "./pixel-font.js";
import { OfficeScene } from "./scene.js";
import * as ui from "./ui.js";

const $ = (id) => document.getElementById(id);
const dom = {
  menuBtn: $("menuBtn"),
  brandMark: $("brandMark"),
  floorLine: $("floorLine"),
  stats: $("stats"),
  clockIcon: $("clockIcon"),
  clockTime: $("clockTime"),
  clockDate: $("clockDate"),
  demoBadge: $("demoBadge"),
  liveBadge: $("liveBadge"),
  helpBtn: $("helpBtn"),
  sidebar: $("sidebar"),
  sidebarScrim: $("sidebarScrim"),
  roomCount: $("roomCount"),
  searchInput: $("searchInput"),
  roomList: $("roomList"),
  sourceLine: $("sourceLine"),
  sourceSub: $("sourceSub"),
  stageLabel: $("stageLabel"),
  clearFocus: $("clearFocus"),
  stageHint: $("stageHint"),
  syncLabel: $("syncLabel"),
  scene: $("scene"),
  stage: $("stage"),
  emptyState: $("emptyState"),
  emptyTitle: $("emptyTitle"),
  emptyText: $("emptyText"),
  emptyHint: $("emptyHint"),
  demoBtn: $("demoBtn"),
  retryBtn: $("retryBtn"),
  feedCount: $("feedCount"),
  feedList: $("feedList"),
  statusLed: $("statusLed"),
  statusText: $("statusText"),
  dbLine: $("dbLine"),
  versionLine: $("versionLine"),
  drawerScrim: $("drawerScrim"),
  drawer: $("drawer"),
  drawerClose: $("drawerClose"),
  drawerBody: $("drawerBody"),
  helpModal: $("helpModal"),
  helpClose: $("helpClose"),
  helpDemo: $("helpDemo"),
  toast: $("toast"),
};

const params = new URLSearchParams(location.search);
const STATIC_DEMO = !!window.PIXEL_OFFICE_STATIC;
const STATIC_BUILT_AT = Number(window.PIXEL_OFFICE_BUILT_AT || 0);
const STATIC_REPO = "https://github.com/MarkChristopherAlcantara/pixel-office";
const store = {
  state: null,
  demo: STATIC_DEMO || params.get("demo") === "1",
  focusRoomId: null,
  selectedAgentId: null,
  drawerFilter: "all",
  detail: null,
  roomOrder: new Map(),
  orderSeq: 0,
  connected: false,
  lastSync: 0,
  gotState: false,
  attentionIds: new Set(),
  lastSourceError: null,
  toastTimer: null,
  pollTimer: null,
  stream: null,
  detailToken: 0,
  sceneReady: false,
};

let scene = null;

/* ── boot ───────────────────────────────────────────────── */

async function boot() {
  ui.renderStats(dom.stats, {});
  ui.drawBrandMark(dom.brandMark);
  tickClock();
  await initPixelFont();
  ui.drawBrandMark(dom.brandMark);
  tickClock();
  scene = new OfficeScene(dom.scene, {
    onAgentClick: (id) => openAgent(id),
    onRoomClick: (id) => setFocus(id),
    onBackgroundClick: () => {
      if (store.focusRoomId) setFocus(null);
    },
  });
  store.sceneReady = true;
  bindUi();
  connect();
  setInterval(tickClock, 1000);
  setInterval(updateConnection, 4000);
  updateConnection();
}

function tickClock() {
  const now = new Date();
  dom.clockTime.textContent = `${ui.pad2(now.getHours())}:${ui.pad2(now.getMinutes())}`;
  dom.clockDate.textContent = ui.formatDate(now);
  ui.drawClockIcon(dom.clockIcon, now);
}

/* ── data ───────────────────────────────────────────────── */

function stableRooms(rooms) {
  for (const room of rooms) {
    if (!store.roomOrder.has(room.id)) store.roomOrder.set(room.id, store.orderSeq++);
  }
  return rooms
    .slice()
    .sort((a, b) => (store.roomOrder.get(a.id) ?? 1e9) - (store.roomOrder.get(b.id) ?? 1e9))
    .map((room, index) => ({ ...room, index }));
}

function applyState(raw) {
  if (!raw || typeof raw !== "object") return;
  const rooms = stableRooms(Array.isArray(raw.rooms) ? raw.rooms : []);
  const state = { ...raw, rooms };
  store.state = state;
  store.demo = !!state.demo;
  store.connected = true;
  store.lastSync = Date.now();
  if (store.focusRoomId && !rooms.some((r) => r.id === store.focusRoomId)) {
    store.focusRoomId = null;
  }

  ui.renderStats(dom.stats, state.stats || {});
  ui.renderRoomList(dom.roomList, rooms, {
    query: dom.searchInput.value,
    focusRoomId: store.focusRoomId,
    selectedAgentId: store.selectedAgentId,
  });
  ui.renderFeed(dom.feedList, state.feed || []);
  dom.roomCount.textContent = ui.pad2(rooms.length);
  dom.feedCount.textContent = ui.pad2((state.feed || []).length);
  dom.versionLine.textContent = `v${state.version || "0.1.0"}`;
  renderChrome(state);
  updateStageChrome();
  notifyAttention(rooms);
  if (store.sceneReady) {
    scene.setState(state, {
      focusRoomId: store.focusRoomId,
      selectedAgentId: store.selectedAgentId,
    });
  }
  updateConnection();
}

function renderChrome(state) {
  const demo = !!state.demo;
  const sourceOk = state.source?.ok !== false;
  const error = state.source?.error || "";
  const stats = state.stats || {};
  const rooms = state.rooms || [];

  dom.floorLine.textContent = demo
    ? "FLOOR 07 · DEMO OFFICE · OPENCODE"
    : `FLOOR 07 · ${stats.agents || 0} SESSIONS · OPENCODE`;
  dom.demoBadge.classList.toggle("hidden", !demo);
  dom.liveBadge.classList.toggle("hidden", demo);
  const liveText = dom.liveBadge.querySelector("span");
  if (liveText) liveText.textContent = "LIVE";

  dom.sourceLine.textContent = demo ? "DEMO FIXTURES" : "READING OPENCODE.DB";
  dom.sourceSub.textContent = demo ? "SAMPLE ROOMS · NO DB" : "READ-ONLY · LOCAL";
  dom.sourceLine.title = state.dbPath || "";
  dom.statusText.textContent = !sourceOk
    ? "DATABASE READ ERROR"
    : demo
    ? "DEMO OFFICE · SAMPLE DATA"
    : "READING OPENCODE DATABASE";
  dom.statusLed.classList.toggle("error", !sourceOk);
  dom.dbLine.textContent = shortPath(demo ? "demo://opencode" : state.dbPath || "unknown");
  dom.dbLine.title = state.dbPath || "";

  dom.demoBtn.textContent = demo ? "BACK TO THE LIVE OFFICE" : "VIEW THE DEMO OFFICE";
  dom.helpDemo.textContent = demo ? "BACK TO LIVE OFFICE" : "VIEW DEMO OFFICE";
  if (STATIC_DEMO) {
    dom.floorLine.textContent = "FLOOR 07 · STATIC DEMO · SAMPLE DATA";
    dom.sourceLine.textContent = "STATIC DEMO";
    dom.sourceSub.textContent = "GITHUB PAGES · SAMPLE DATA";
    dom.demoBtn.textContent = "RELOAD THE DEMO";
    dom.helpDemo.textContent = "VIEW SOURCE ON GITHUB";
  }
  dom.demoBadge.title = STATIC_DEMO
    ? "Static GitHub Pages demo — sample data only"
    : "Back to the live office";

  const quiet = rooms.length === 0;
  dom.emptyState.classList.toggle("hidden", !quiet);
  if (quiet) {
    if (!sourceOk) {
      dom.emptyTitle.textContent = "THE OFFICE CAN'T READ OPENCODE";
      dom.emptyText.textContent = error || "The local opencode database could not be opened. Check the path below and try again.";
      dom.emptyHint.textContent = state.dbPath || "opencode.db";
    } else if (demo) {
      dom.emptyTitle.textContent = "THE DEMO IS QUIET";
      dom.emptyText.textContent = "Nothing is scheduled in the sample office. Switch back to the live floor.";
      dom.emptyHint.textContent = "?demo=1";
    } else {
      dom.emptyTitle.textContent = "THE OFFICE IS QUIET";
      dom.emptyText.textContent =
        "No opencode sessions in the last few minutes. Start one in any project and a character will walk in.";
      dom.emptyHint.textContent = "opencode";
    }
  }
  dom.stageHint.textContent = demo
    ? "sample sessions · click a character"
    : "click a character to open its file";
}

function shortPath(path) {
  const value = String(path || "");
  if (value.length <= 54) return value;
  return "…" + value.slice(value.length - 53);
}

function notifyAttention(rooms) {
  const next = new Set();
  const fresh = [];
  for (const room of rooms) {
    for (const agent of room.agents || []) {
      if (agent.status !== "attention") continue;
      next.add(agent.id);
      if (store.gotState && !store.attentionIds.has(agent.id)) {
        fresh.push({ name: agent.name, label: agent.activity?.label || "needs a hand" });
      }
    }
  }
  if (fresh.length) {
    toast(
      fresh.length === 1
        ? `${fresh[0].name} needs you — ${fresh[0].label}`
        : `${fresh.length} agents need you — open their files`,
      { error: true, ms: 5200 }
    );
  }
  store.attentionIds = next;
  store.gotState = true;
}

/* ── connection ─────────────────────────────────────────── */

function connect() {
  closeStream();
  stopPolling();
  if (STATIC_DEMO) {
    fetchState();
    return;
  }
  const url = `/api/events${store.demo ? "?demo=1" : ""}`;
  try {
    const es = new EventSource(url);
    store.stream = es;
    es.addEventListener("hello", () => {
      store.connected = true;
      updateConnection();
    });
    es.addEventListener("state", (event) => {
      let data = null;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      store.connected = true;
      store.lastSync = Date.now();
      stopPolling();
      applyState(data);
    });
    es.onerror = () => {
      store.connected = false;
      updateConnection();
      startPolling();
    };
  } catch {
    startPolling();
  }
  fetchState();
}

function closeStream() {
  if (store.stream) {
    try {
      store.stream.close();
    } catch {
      /* noop */
    }
    store.stream = null;
  }
}

/**
 * The static Pages build is a snapshot taken at build time. Move every
 * timestamp forward by the elapsed time so the feed and idle timers look
 * current whenever someone opens the demo.
 */
function freshenStaticState(data) {
  const now = Date.now();
  const builtAt = Number(data.generatedAt) || STATIC_BUILT_AT || now;
  const shift = Math.max(0, now - builtAt);
  if (!shift) return;
  for (const room of data.rooms || []) {
    if (room.lastActive) room.lastActive += shift;
    for (const agent of room.agents || []) {
      for (const key of ["startedAt", "updatedAt", "busySince", "idleSince"]) {
        if (agent[key]) agent[key] += shift;
      }
    }
  }
  for (const item of data.feed || []) {
    if (item.time) item.time += shift;
  }
  data.generatedAt = now;
}

function freshenStaticDetail(data) {
  const now = Date.now();
  const builtAt = Number(data.generatedAt) || STATIC_BUILT_AT || now;
  const shift = Math.max(0, now - builtAt);
  if (!shift) return;
  if (data.session) {
    if (data.session.created) data.session.created += shift;
    if (data.session.updated) data.session.updated += shift;
  }
  for (const item of data.items || []) {
    if (item.time) item.time += shift;
  }
}

async function fetchState() {
  try {
    const stateUrl = STATIC_DEMO ? "./demo/state.json" : `/api/state${store.demo ? "?demo=1" : ""}`;
    const res = await fetch(stateUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (STATIC_DEMO) freshenStaticState(data);
    store.lastSync = Date.now();
    applyState(data);
    if (STATIC_DEMO) {
      store.connected = true;
      updateConnection();
    }
    if (store.connected) stopPolling();
  } catch (error) {
    if (!store.state) {
      dom.emptyState.classList.remove("hidden");
      dom.emptyTitle.textContent = STATIC_DEMO ? "CAN'T LOAD THE STATIC DEMO" : "CAN'T REACH THE OFFICE SERVER";
      dom.emptyText.textContent = STATIC_DEMO
        ? "The demo snapshot is missing. Run the static build, then serve the dist folder again."
        : "The pixel office server is not answering. Make sure it is running, then retry.";
      dom.emptyHint.textContent = STATIC_DEMO ? "npm run build:demo" : "node server/index.mjs";
      dom.statusLed.classList.add("error");
      dom.statusText.textContent = "OFFLINE";
      dom.dbLine.textContent = error?.message || "no response";
      if (STATIC_DEMO) dom.syncLabel.textContent = "NO SNAPSHOT";
    }
  }
}

function startPolling() {
  if (store.pollTimer) return;
  store.pollTimer = setInterval(fetchState, 3000);
}

function stopPolling() {
  if (!store.pollTimer) return;
  clearInterval(store.pollTimer);
  store.pollTimer = null;
}

function updateConnection() {
  if (STATIC_DEMO) {
    dom.syncLabel.classList.remove("stale");
    dom.syncLabel.textContent = store.state ? "STATIC DEMO" : "LOADING";
    if (store.state && store.state.source?.ok === false) {
      dom.statusLed.classList.add("error");
    } else if (store.state) {
      dom.statusLed.classList.remove("error");
    }
    return;
  }
  const age = store.lastSync ? Date.now() - store.lastSync : Infinity;
  const sourceOk = store.state?.source?.ok !== false;
  const stale = age > 12000 || !sourceOk;
  dom.syncLabel.classList.toggle("stale", stale);

  if (!store.state) {
    dom.syncLabel.textContent = "CONNECTING";
  } else if (!sourceOk) {
    dom.syncLabel.textContent = "SOURCE ERROR";
  } else if (age > 12000) {
    dom.syncLabel.textContent = "RECONNECTING";
  } else {
    dom.syncLabel.textContent = `SYNCED ${ui.formatClock(store.lastSync)}`;
  }

  if (!store.demo) {
    dom.liveBadge.classList.toggle("offline", stale);
    const label = dom.liveBadge.querySelector("span");
    if (label) label.textContent = stale ? "OFFLINE" : "LIVE";
  }
  if (store.state && store.state.source?.ok === false) {
    dom.statusLed.classList.add("error");
  } else if (store.state) {
    dom.statusLed.classList.remove("error");
  }
}

function setDemo(flag) {
  if (STATIC_DEMO) {
    toast("Static GitHub Pages demo — run PIXEL OFFICE locally for live sessions.");
    return;
  }
  const next = !!flag;
  if (next === store.demo) {
    if (next) toast("You are already in the demo office.");
    return;
  }
  store.demo = next;
  const url = new URL(location.href);
  if (next) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  history.replaceState({}, "", url);
  store.roomOrder.clear();
  store.orderSeq = 0;
  store.gotState = false;
  store.attentionIds.clear();
  store.lastSourceError = null;
  closeDrawer({ clearFocus: true });
  setFocus(null, { silent: true });
  dom.searchInput.value = "";
  toast(next ? "Demo office loaded — sample sessions only." : "Back to the live office — reading opencode.db.");
  connect();
}

/* ── focus ──────────────────────────────────────────────── */

function setFocus(roomId, opts = {}) {
  const next = opts.force ? roomId || null : store.focusRoomId === roomId ? null : roomId;
  store.focusRoomId = next;
  if (store.sceneReady) scene.setFocus(next);
  panToRoom(next);
  updateStageChrome();
  if (!opts.silent) {
    ui.renderRoomList(dom.roomList, store.state?.rooms || [], {
      query: dom.searchInput.value,
      focusRoomId: store.focusRoomId,
      selectedAgentId: store.selectedAgentId,
    });
  }
}

/**
 * On narrow screens the office is wider than the stage, so bring a selected
 * room into view. `margin:auto` on the canvas keeps the left/top edge
 * reachable when it overflows; this only moves the scroll container.
 */
function panToRoom(roomId) {
  if (!roomId || !store.sceneReady) return;
  const stage = dom.stage;
  const overflow = stage.scrollWidth - stage.clientWidth;
  if (overflow <= 1) return;
  const room = scene.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const scale = dom.scene.getBoundingClientRect().width / scene.width;
  const center = (room.cx + room.cw / 2) * scale;
  const left = Math.max(0, Math.min(overflow, center - stage.clientWidth / 2));
  stage.scrollTo({
    left,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function updateStageChrome() {
  const room = store.state?.rooms?.find((r) => r.id === store.focusRoomId);
  dom.stageLabel.textContent = room ? room.name : "ALL ROOMS";
  dom.clearFocus.classList.toggle("hidden", !room);
  if (room?.accent?.main) dom.stageLabel.style.color = room.accent.main;
  else dom.stageLabel.style.color = "";
}

/* ── drawer ─────────────────────────────────────────────── */

function findAgent(id) {
  for (const room of store.state?.rooms || []) {
    for (const agent of room.agents || []) {
      if (agent.id === id) return { ...agent, roomName: room.name, accent: room.accent };
    }
  }
  return null;
}

async function openAgent(id) {
  const agent = findAgent(id);
  if (!agent) return;
  store.selectedAgentId = id;
  if (store.sceneReady) scene.setSelected(id);
  setFocus(agent.roomId || agent.id, { force: true, silent: false });
  dom.drawer.classList.add("open");
  dom.drawer.setAttribute("aria-hidden", "false");
  dom.drawerScrim.classList.add("open");
  ui.setDrawerLoading(dom.drawerBody);
  closeSidebar();

  const token = ++store.detailToken;
  try {
    const detailUrl = STATIC_DEMO
      ? `./demo/sessions/${encodeURIComponent(id)}.json`
      : `/api/session/${encodeURIComponent(id)}${store.demo ? "?demo=1" : ""}`;
    const res = await fetch(detailUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (token !== store.detailToken) return;
    if (!data.ok) throw new Error(data.error || "The session could not be opened");
    if (STATIC_DEMO) freshenStaticDetail(data);
    store.detail = data;
    ui.renderDrawer(dom.drawerBody, {
      detail: data,
      agent: findAgent(id),
      filter: store.drawerFilter,
      now: Date.now(),
    });
  } catch (error) {
    if (token !== store.detailToken) return;
    ui.setDrawerError(dom.drawerBody, error?.message || String(error));
  }
}

function closeDrawer(opts = {}) {
  store.detailToken += 1;
  store.selectedAgentId = null;
  store.detail = null;
  dom.drawer.classList.remove("open");
  dom.drawer.setAttribute("aria-hidden", "true");
  dom.drawerScrim.classList.remove("open");
  if (store.sceneReady) scene.setSelected(null);
  if (opts.clearFocus !== false) setFocus(null, { silent: false });
  else {
    ui.renderRoomList(dom.roomList, store.state?.rooms || [], {
      query: dom.searchInput.value,
      focusRoomId: store.focusRoomId,
      selectedAgentId: null,
    });
  }
}

/* ── sidebar / modal / toast ────────────────────────────── */

function openSidebar() {
  dom.sidebar.classList.add("open");
  dom.sidebarScrim.classList.add("open");
  dom.menuBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  dom.sidebar.classList.remove("open");
  dom.sidebarScrim.classList.remove("open");
  dom.menuBtn.setAttribute("aria-expanded", "false");
}

function openHelp() {
  dom.helpModal.classList.remove("hidden");
}

function closeHelp() {
  dom.helpModal.classList.add("hidden");
}

function toast(text, opts = {}) {
  dom.toast.textContent = text;
  dom.toast.classList.toggle("error", !!opts.error);
  dom.toast.classList.remove("hidden");
  clearTimeout(store.toastTimer);
  store.toastTimer = setTimeout(() => dom.toast.classList.add("hidden"), opts.ms || 3800);
}

/* ── events ─────────────────────────────────────────────── */

function bindUi() {
  dom.menuBtn.addEventListener("click", () => {
    if (dom.sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  });
  dom.sidebarScrim.addEventListener("click", closeSidebar);

  dom.helpBtn.addEventListener("click", openHelp);
  dom.helpClose.addEventListener("click", closeHelp);
  dom.helpModal.addEventListener("click", (event) => {
    if (event.target === dom.helpModal) closeHelp();
  });
  dom.helpDemo.addEventListener("click", () => {
    closeHelp();
    if (STATIC_DEMO) {
      window.open(STATIC_REPO, "_blank", "noopener");
      return;
    }
    setDemo(!store.demo);
  });

  dom.demoBtn.addEventListener("click", () => {
    if (STATIC_DEMO) {
      connect();
      return;
    }
    setDemo(!store.demo);
  });
  dom.demoBadge.addEventListener("click", () => setDemo(false));
  dom.demoBadge.title = "Back to the live office";
  dom.retryBtn.addEventListener("click", () => {
    toast("Reconnecting to the office…");
    connect();
  });

  dom.clearFocus.addEventListener("click", () => setFocus(null));
  dom.drawerClose.addEventListener("click", () => closeDrawer());
  dom.drawerScrim.addEventListener("click", () => closeDrawer());

  dom.roomList.addEventListener("click", (event) => {
    const agentBtn = event.target.closest("[data-agent-id]");
    if (agentBtn) {
      openAgent(agentBtn.dataset.agentId);
      return;
    }
    const roomBtn = event.target.closest("[data-room-id]");
    if (roomBtn) {
      closeSidebar();
      setFocus(roomBtn.dataset.roomId);
    }
  });

  dom.drawerBody.addEventListener("click", (event) => {
    const btn = event.target.closest(".d-filter");
    if (!btn) return;
    store.drawerFilter = btn.dataset.filter;
    for (const el of dom.drawerBody.querySelectorAll(".d-filter")) {
      el.classList.toggle("active", el === btn);
    }
    ui.applyDrawerFilter(dom.drawerBody.querySelector(".convo"), store.drawerFilter);
  });

  dom.searchInput.addEventListener("input", () => {
    ui.renderRoomList(dom.roomList, store.state?.rooms || [], {
      query: dom.searchInput.value,
      focusRoomId: store.focusRoomId,
      selectedAgentId: store.selectedAgentId,
    });
  });
  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (dom.searchInput.value) {
        dom.searchInput.value = "";
        ui.renderRoomList(dom.roomList, store.state?.rooms || [], {
          focusRoomId: store.focusRoomId,
          selectedAgentId: store.selectedAgentId,
        });
      } else {
        dom.searchInput.blur();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag || "");
    if (event.key === "/" && !typing) {
      event.preventDefault();
      if (window.innerWidth <= 900) openSidebar();
      dom.searchInput.focus();
      dom.searchInput.select();
      return;
    }
    if (event.key === "Escape") {
      if (!dom.helpModal.classList.contains("hidden")) {
        closeHelp();
      } else if (dom.drawer.classList.contains("open")) {
        closeDrawer();
      } else if (store.focusRoomId) {
        setFocus(null);
      } else if (dom.sidebar.classList.contains("open")) {
        closeSidebar();
      }
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeSidebar();
    if (store.focusRoomId) panToRoom(store.focusRoomId);
  });
}

boot();
