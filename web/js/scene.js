/**
 * The living floor. Rooms are projects, characters are opencode sessions.
 * The canvas keeps its own runtime per agent so movement survives the 1.5s
 * state snapshots coming from the server.
 */
import { drawUiText, uiTextSize } from "./pixel-font.js";
import { drawCharacter } from "./sprites.js";
import {
  phaseFor,
  drawOfficeRoom,
  drawLounge,
  drawLoungeFX,
  drawLoungeBall,
  drawLoungeCouchFront,
  drawMonitorScreen,
  drawDeskFront,
  roomDoor,
  loungeDoor,
  loungeSpots,
} from "./art.js";

const ROOM_W = 404;
const ROOM_H = 238;
const GAP = 14;
const MARGIN_X = 16;
const MARGIN_TOP = 14;
const LOUNGE_GAP = 18;
const LOUNGE_FRAME_H = 194;
const WIDTH = MARGIN_X * 2 + ROOM_W * 3 + GAP * 2;
const LOUNGE_MS = 2 * 60 * 1000;
const FADE_SECONDS = 0.26;
const DESK_SCALE = 1.46;
const STAND_SCALE = 1.08;
const WALK_SCALE = 1.32;
const LOUNGE_SCALE = 1.2;
const BUBBLE_FONT = 16;

const SMALL_TALK = [
  "Coffee?",
  "Ship it?",
  "One more test.",
  "The tests are green.",
  "Who touched the CSS?",
  "Merge conflict again.",
  "Just one more refactor.",
  "Lunch soon?",
  "It works on my machine.",
  "Pixel perfect.",
  "No warnings, nice.",
  "Semver is a lie.",
];

const STATUS_LABEL = {
  working: "WORKING",
  attention: "NEEDS YOU",
  idle: "AT EASE",
};

function hashString(value) {
  let h = 2166136261 >>> 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function short(text, max) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

export class OfficeScene {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.cb = callbacks;
    this.width = WIDTH;
    this.height = 480;
    this.rooms = [];
    this.roomById = new Map();
    this.lounge = null;
    this.agents = new Map();
    this.roomSig = "";
    this.floorCanvas = document.createElement("canvas");
    this.floorSig = "";
    this.focusRoomId = null;
    this.selectedAgentId = null;
    this.hoveredId = null;
    this.pointer = { x: 0, y: 0, inside: false };
    this.hitAgents = [];
    this.hitRooms = [];
    this.lastFrame = performance.now();
    this.time = this.lastFrame;
    this.lastChatAt = 0;
    this.chatSeq = 0;
    this.resizeCanvas();
    this.bindPointer();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    // Some windows throttle requestAnimationFrame while the page stays
    // "visible". A slow fallback tick keeps the floor alive there and lets a
    // hidden review pane fade characters in.
    this.hiddenTimer = setInterval(() => {
      const now = performance.now();
      if (now - this.lastFrame < 200) return;
      const dt = Math.min(0.2, Math.max(0.05, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.time = now;
      this.update(dt, now);
      this.render(now);
    }, 220);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.hiddenTimer);
    this.unbindPointer?.();
  }

  resizeCanvas() {
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
  }

  setFocus(roomId) {
    this.focusRoomId = roomId || null;
  }

  setSelected(agentId) {
    this.selectedAgentId = agentId || null;
  }

  setState(data, opts = {}) {
    this.focusRoomId = opts.focusRoomId || null;
    this.selectedAgentId = opts.selectedAgentId || null;
    const incoming = Array.isArray(data?.rooms) ? data.rooms : [];
    const sig = incoming.map((r) => r.id).join("|");
    if (sig !== this.roomSig) {
      this.rebuildLayout(incoming);
      this.roomSig = sig;
    } else {
      this.rooms.forEach((room, i) => {
        const src = incoming[i];
        room.name = src.name;
        room.path = src.path;
        room.accent = src.accent || room.accent;
        room.agentCount = src.agents?.length || 0;
        room.working = src.working || 0;
        room.attention = src.attention || 0;
        room.index = i;
      });
    }

    const seen = new Set();
    for (const room of incoming) {
      for (const agent of room.agents || []) {
        seen.add(agent.id);
        let rt = this.agents.get(agent.id);
        if (!rt) {
          rt = this.createRuntime(agent, this.roomById.get(room.id) || room);
          this.agents.set(agent.id, rt);
        } else {
          rt.agent = agent;
          rt.look = agent.look || rt.look;
          rt.name = agent.name;
          rt.roomId = room.id;
          rt.seat = agent.seat ?? rt.seat;
          rt.seatKind = agent.seatKind || (rt.seat < 3 ? "desk" : "standing");
          if (rt.removing) {
            rt.removing = false;
            rt.nextChatAt = this.time + 8000;
            this.fadeTo(rt, 1);
          }
        }
        this.steerRuntime(rt, agent);
      }
    }

    for (const [id, rt] of this.agents) {
      if (seen.has(id)) continue;
      if (!rt.removing) {
        rt.removing = true;
        this.releaseSpot(rt);
        this.fadeTo(rt, 0, () => this.agents.delete(id));
      }
    }

    // Paint one frame immediately so a freshly opened (or hidden) tab is not blank.
    if (this.rooms.length) this.render(this.time);
  }

  rebuildLayout(incoming) {
    const rows = Math.max(1, Math.ceil(incoming.length / 3));
    const rooms = incoming.map((src, index) => {
      const row = Math.floor(index / 3);
      const countInRow = Math.min(3, incoming.length - row * 3) || 1;
      const offset = ((3 - countInRow) * (ROOM_W + GAP)) / 2;
      const x = MARGIN_X + offset + (index % 3) * (ROOM_W + GAP);
      const y = MARGIN_TOP + row * (ROOM_H + GAP);
      return {
        id: src.id,
        name: src.name,
        path: src.path,
        accent: src.accent,
        agentCount: src.agents?.length || 0,
        working: src.working || 0,
        attention: src.attention || 0,
        kind: src.kind || "office",
        index,
        x,
        y,
        w: ROOM_W,
        h: ROOM_H,
        cx: x + 3,
        cy: y + 3,
        cw: 398,
        ch: 232,
        motes: this.makeMotes(x + 3, y + 3, 7, src.id),
      };
    });

    this.rooms = rooms;
    this.roomById = new Map(rooms.map((r) => [r.id, r]));
    const loungeY = MARGIN_TOP + rows * ROOM_H + (rows - 1) * GAP + LOUNGE_GAP;
    this.lounge = {
      id: "lounge",
      name: "BREAK ROOM",
      accent: { id: "mint", main: "#5ad4b2", soft: "#a6ecd7", dark: "#123b33" },
      index: 99,
      x: 10,
      y: loungeY,
      w: 1252,
      h: LOUNGE_FRAME_H,
      cx: 13,
      cy: loungeY + 3,
      cw: 1246,
      ch: 188,
    };
    this.height = loungeY + LOUNGE_FRAME_H + 16;
    this.resizeCanvas();
    this.floorSig = "";

    // Keep runtimes anchored to their new geometry after a room added/removed.
    for (const rt of this.agents.values()) {
      if (rt.location === "room") {
        if (rt.mode === "desk") this.settleAtDesk(rt, false);
        else this.walkDeskPath(rt);
      } else if (rt.location === "lounge") {
        if (rt.mode === "lounge") this.settleInLounge(rt, false);
        else this.walkLoungePath(rt);
      }
    }
  }

  makeMotes(x, y, count, seed) {
    const h = hashString(seed);
    return Array.from({ length: count }, (_, i) => ({
      x: x + 24 + ((h >>> (i * 3)) % 350),
      y: y + 30 + ((h >>> (i * 5 + 2)) % 150),
      phase: ((h >>> i) % 100) / 12,
      amp: 3 + ((h >>> i) % 5),
      speed: 0.4 + ((h >>> (i + 4)) % 7) / 10,
    }));
  }

  createRuntime(agent, room) {
    const door = roomDoor(room);
    const rt = {
      id: agent.id,
      agent,
      roomId: room.id,
      seat: agent.seat ?? 0,
      seatKind: agent.seatKind || "standing",
      name: agent.name,
      look: agent.look,
      x: door.x,
      y: door.y,
      alpha: 0,
      fadeDir: 0,
      fadeCb: null,
      path: [],
      speed: 52,
      facing: 1,
      location: "room",
      mode: "walk",
      intent: "desk",
      loungeSpot: null,
      scale: WALK_SCALE,
      removing: false,
      nextChatAt: this.time + 12000 + (hashString(agent.id) % 22000),
      chatUntil: 0,
      chatText: "",
      chatCount: 0,
    };
    this.fadeTo(rt, 1);
    this.walkDeskPath(rt);
    return rt;
  }

  steerRuntime(rt, agent) {
    if (rt.removing) return;
    const idleFor = agent.idleSince ? Date.now() - agent.idleSince : 0;
    const wantsLounge = agent.status === "idle" && idleFor > LOUNGE_MS;
    const desired = wantsLounge ? "lounge" : "desk";
    if (desired === rt.intent) {
      // Retry a lounge visit that found every seat taken.
      if (desired === "lounge" && rt.location === "room" && rt.mode === "desk" && !rt.moving) {
        this.goLounge(rt);
      }
      return;
    }
    if (desired === "desk") this.goDesk(rt);
    else this.goLounge(rt);
  }

  goLounge(rt) {
    if (rt.removing || rt.fadeDir) return;
    if (rt.intent === "lounge" && rt.location === "lounge") return;
    const spot = this.pickSpot(rt);
    if (!spot) {
      rt.intent = "desk";
      return;
    }
    rt.intent = "lounge";
    rt.loungeSpot = spot.index;
    if (rt.location === "room") {
      const room = this.roomById.get(rt.roomId);
      if (!room) return;
      const door = roomDoor(room);
      const lane = room.cy + (rt.seatKind === "desk" ? 220 : 200);
      this.walk(rt, this.smoothPoints(rt.x, rt.y, [
        { x: rt.x, y: lane },
        { x: door.x + 4, y: lane },
        { x: door.x, y: door.y },
      ]), 60, () => {
        this.fadeTo(rt, 0, () => {
          rt.location = "lounge";
          const ld = loungeDoor(this.lounge);
          rt.x = ld.x;
          rt.y = ld.y;
          rt.facing = 1;
          this.fadeTo(rt, 1);
          this.walkLoungePath(rt);
        });
      });
    } else {
      this.walkLoungePath(rt);
    }
  }

  goDesk(rt) {
    if (rt.removing || rt.fadeDir) return;
    rt.intent = "desk";
    this.releaseSpot(rt);
    if (rt.location === "lounge") {
      const ld = loungeDoor(this.lounge);
      this.walk(rt, [{ x: ld.x, y: ld.y }], 92, () => {
        this.fadeTo(rt, 0, () => {
          const room = this.roomById.get(rt.roomId);
          if (!room || rt.removing) {
            this.fadeTo(rt, 0, () => this.agents.delete(rt.id));
            return;
          }
          rt.location = "room";
          const door = roomDoor(room);
          rt.x = door.x;
          rt.y = door.y;
          rt.facing = 1;
          this.fadeTo(rt, 1);
          this.walkDeskPath(rt);
        });
      });
    } else {
      this.walkDeskPath(rt);
    }
  }

  deskSeat(rt) {
    const room = this.roomById.get(rt.roomId);
    if (!room) return null;
    if (rt.seatKind === "desk" || rt.seat < 3) {
      const x = room.cx + [74, 198, 322][clamp(rt.seat, 0, 2)];
      return { x, y: room.cy + 230, scale: DESK_SCALE, kind: "desk", room };
    }
    const slots = [96, 206, 316];
    const x = room.cx + slots[clamp(rt.seat - 3, 0, 2)];
    return { x, y: room.cy + 196, scale: STAND_SCALE, kind: "standing", room };
  }

  walkDeskPath(rt) {
    const seat = this.deskSeat(rt);
    if (!seat) return;
    const room = seat.room;
    const lane = room.cy + (seat.kind === "desk" ? 220 : 200);
    const fromX = rt.x;
    const fromY = rt.y;
    // If already near the seat, just settle.
    if (Math.abs(fromX - seat.x) < 3 && Math.abs(fromY - seat.y) < 3) {
      this.settleAtDesk(rt);
      return;
    }
    const points = [
      { x: fromX, y: lane },
      { x: seat.x, y: lane },
      { x: seat.x, y: seat.y },
    ];
    rt.mode = "walk";
    this.walk(rt, this.smoothPoints(fromX, fromY, points), 52, () => this.settleAtDesk(rt));
  }

  smoothPoints(x, y, points) {
    return points.filter((p, i) => {
      if (i === 0 && Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2) return false;
      return true;
    });
  }

  settleAtDesk(rt, snap = true) {
    const seat = this.deskSeat(rt);
    if (!seat) return;
    if (snap) {
      rt.x = seat.x;
      rt.y = seat.y;
    }
    rt.scale = seat.scale;
    rt.mode = "desk";
    rt.path = [];
    rt.facing = 1;
    rt.alpha = Math.max(rt.alpha, 0);
  }

  walkLoungePath(rt) {
    if (!this.lounge) return;
    const spot = loungeSpots(this.lounge)[rt.loungeSpot];
    if (!spot) {
      rt.loungeSpot = null;
      rt.intent = "desk";
      return;
    }
    const ld = loungeDoor(this.lounge);
    const lane = this.lounge.cy + 184;
    const points = [{ x: ld.x + 12, y: lane }, { x: spot.x, y: lane }, { x: spot.x, y: spot.y }];
    if (Math.abs(rt.x - spot.x) < 3 && Math.abs(rt.y - spot.y) < 3) {
      this.settleInLounge(rt);
      return;
    }
    rt.mode = "walk";
    this.walk(rt, this.smoothPoints(rt.x, rt.y, points), 76, () => this.settleInLounge(rt));
  }

  settleInLounge(rt, snap = true) {
    const spots = this.lounge ? loungeSpots(this.lounge) : [];
    const spot = spots[rt.loungeSpot];
    if (!spot) return;
    if (snap) {
      rt.x = spot.x;
      rt.y = spot.y;
    }
    rt.scale = LOUNGE_SCALE;
    rt.mode = "lounge";
    rt.facing = spot.face;
    rt.path = [];
    rt.nextChatAt = Math.max(rt.nextChatAt, this.time + 4000);
  }

  walk(rt, points, speed, done) {
    rt.path = points.map((p) => ({ x: p.x, y: p.y }));
    rt.speed = speed;
    rt.done = done || null;
    rt.moving = rt.path.length > 0;
    rt.scale = rt.location === "lounge" ? LOUNGE_SCALE : WALK_SCALE;
    if (!rt.moving && done) done();
  }

  fadeTo(rt, target, cb) {
    const t = clamp(target, 0, 1);
    rt.fadeCb = cb || null;
    if (Math.abs(rt.alpha - t) < 0.01) {
      rt.alpha = t;
      rt.fadeDir = 0;
      const fn = rt.fadeCb;
      rt.fadeCb = null;
      if (fn) fn();
      return;
    }
    rt.fadeTarget = t;
    rt.fadeDir = t > rt.alpha ? 1 : -1;
  }

  pickSpot(rt) {
    const spots = this.lounge ? loungeSpots(this.lounge) : [];
    if (!spots.length) return null;
    const taken = new Set();
    for (const other of this.agents.values()) {
      if (other === rt) continue;
      if (other.loungeSpot != null && (other.location === "lounge" || other.intent === "lounge")) {
        taken.add(other.loungeSpot);
      }
    }
    const pingTaken = taken.has(0) || taken.has(1);
    let order;
    if (pingTaken) {
      order = [taken.has(0) ? 1 : 0, 4, 2, 3, 5];
    } else {
      const base = [2, 3, 4, 5, 0, 1];
      const shift = hashString(rt.id) % base.length;
      order = base.slice(shift).concat(base.slice(0, shift));
    }
    for (const index of order) {
      if (!taken.has(index) && index < spots.length) return { ...spots[index], index };
    }
    return null;
  }

  releaseSpot(rt) {
    rt.loungeSpot = null;
  }

  update(dt, now) {
    for (const rt of this.agents.values()) this.updateRuntime(rt, dt, now);
  }

  updateRuntime(rt, dt, now) {
    if (rt.fadeDir) {
      rt.alpha += rt.fadeDir * (dt / FADE_SECONDS);
      if (rt.alpha >= 1) {
        rt.alpha = 1;
        rt.fadeDir = 0;
      } else if (rt.alpha <= 0) {
        rt.alpha = 0;
        rt.fadeDir = 0;
      }
      if (rt.fadeDir === 0) {
        const fn = rt.fadeCb;
        rt.fadeCb = null;
        if (fn) fn();
      }
    }

    if (rt.path.length) {
      const to = rt.path[0];
      const dx = to.x - rt.x;
      const dy = to.y - rt.y;
      const distance = Math.hypot(dx, dy);
      const step = rt.speed * dt;
      if (Math.abs(dx) > 0.8) rt.facing = dx > 0 ? 1 : -1;
      if (distance <= step || distance < 0.4) {
        rt.x = to.x;
        rt.y = to.y;
        rt.path.shift();
        if (!rt.path.length) {
          const done = rt.done;
          rt.done = null;
          rt.moving = false;
          if (done) done();
        }
      } else {
        rt.x += (dx / distance) * step;
        rt.y += (dy / distance) * step;
      }
    }

    if (
      rt.mode === "lounge" &&
      !rt.path.length &&
      !rt.fadeDir &&
      rt.agent?.status === "idle" &&
      now > rt.nextChatAt &&
      now - this.lastChatAt > 6000
    ) {
      this.chatSeq += 1;
      rt.chatText = SMALL_TALK[(hashString(rt.id) + this.chatSeq) % SMALL_TALK.length];
      rt.chatUntil = now + 3400;
      rt.nextChatAt = now + 20000 + ((hashString(`${rt.id}:${this.chatSeq}`) >>> 3) % 24000);
      this.lastChatAt = now;
    }
  }

  ensureFloor(phase, now) {
    const minute = Math.floor(now / 60000);
    const rooms = this.rooms.map((r) => `${r.id}:${r.name}:${r.agentCount}:${r.accent?.id}:${r.index}`).join(";");
    const sig = `${phase}|${minute}|${rooms}|${this.width}x${this.height}`;
    if (sig === this.floorSig) return;
    this.floorSig = sig;
    const canvas = this.floorCanvas;
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.width, this.height);
    // Dim tiled corridor behind the floor plan.
    ctx.fillStyle = "#070c15";
    ctx.fillRect(0, 0, this.width, this.height);
    for (let y = 0; y < this.height; y += 32) {
      for (let x = 0; x < this.width; x += 32) {
        ctx.fillStyle = (x / 32 + y / 32) % 2 === 0 ? "#08101b" : "#070d17";
        ctx.fillRect(x, y, 32, 32);
      }
    }
    ctx.fillStyle = "#0b1524";
    for (let x = 0; x < this.width; x += 32) ctx.fillRect(x, 0, 1, this.height);
    for (let y = 0; y < this.height; y += 32) ctx.fillRect(0, y, this.width, 1);
    for (const room of this.rooms) drawOfficeRoom(ctx, room, phase);
    if (this.lounge) drawLounge(ctx, this.lounge, phase);
  }

  loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time = now;
    this.update(dt, now);
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  render(now) {
    const ctx = this.ctx;
    const phase = phaseFor(new Date());
    this.ensureFloor(phase, Date.now());
    if (this.canvas.height !== this.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      ctx.imageSmoothingEnabled = false;
    }
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#070c15";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.drawImage(this.floorCanvas, 0, 0);

    this.hitAgents = [];
    this.hitRooms = [];
    const byRoom = new Map();
    const loungeAgents = [];
    for (const rt of this.agents.values()) {
      if (rt.alpha <= 0.01) continue;
      if (rt.location === "lounge") loungeAgents.push(rt);
      else {
        if (!byRoom.has(rt.roomId)) byRoom.set(rt.roomId, []);
        byRoom.get(rt.roomId).push(rt);
      }
    }

    ctx.globalAlpha = 1;
    for (const room of this.rooms) {
      this.hitRooms.push({ id: room.id, x: room.x, y: room.y, w: room.w, h: room.h });
      this.drawDust(room, now);
      const roomAgents = byRoom.get(room.id) || [];
      for (let seat = 0; seat < 3; seat++) {
        const atDesk = roomAgents.find((rt) => rt.seatKind === "desk" && rt.seat === seat);
        const data = atDesk?.agent || null;
        drawMonitorScreen(ctx, room, seat, data, now);
      }
      this.drawRoomAgents(room, roomAgents, now);
      const roomBubbles = [];
      for (const rt of roomAgents) this.drawBubbleFor(rt, now, room, roomBubbles);
      if (this.focusRoomId && room.id !== this.focusRoomId) this.dim(room);
    }

    if (this.lounge) {
      drawLoungeFX(ctx, this.lounge, now, phase);
      const ping = loungeAgents.some((rt) => rt.mode === "lounge" && (rt.loungeSpot === 0 || rt.loungeSpot === 1));
      drawLoungeBall(ctx, this.lounge, now, ping);
      loungeAgents.sort((a, b) => a.y - b.y);
      const couchSitters = loungeAgents.filter(
        (rt) => rt.mode === "lounge" && (rt.loungeSpot === 2 || rt.loungeSpot === 3)
      );
      if (couchSitters.length) {
        for (const rt of couchSitters) this.drawAgent(ctx, rt, now);
        drawLoungeCouchFront(ctx, this.lounge);
        for (const rt of loungeAgents) if (!couchSitters.includes(rt)) this.drawAgent(ctx, rt, now);
      } else {
        for (const rt of loungeAgents) this.drawAgent(ctx, rt, now);
      }
      const loungeBubbles = [];
      for (const rt of loungeAgents) this.drawBubbleFor(rt, now, this.lounge, loungeBubbles);
      if (this.focusRoomId) this.dim(this.lounge);
      this.hitRooms.push({ id: null, x: this.lounge.x, y: this.lounge.y, w: this.lounge.w, h: this.lounge.h });
    }

    if (this.focusRoomId) this.outlineFocus();

    this.hoveredId = this.pickHovered();
    if (this.hoveredId) {
      const rt = this.agents.get(this.hoveredId);
      if (rt) {
        this.drawMarker(rt, now, "#f2b24c");
        this.drawTooltip(rt);
      }
    }
    for (const rt of this.agents.values()) {
      if (rt.id === this.selectedAgentId && rt.id !== this.hoveredId && rt.alpha > 0.3) {
        this.drawMarker(rt, now, "#5ad4b2");
      }
    }
    this.canvas.style.cursor = this.hoveredId ? "pointer" : "default";
  }

  drawDust(room, now) {
    const ctx = this.ctx;
    const prev = ctx.globalAlpha;
    ctx.fillStyle = "#ffe6b0";
    for (const mote of room.motes) {
      const y = room.cy + 40 + ((mote.y + now * 0.006 * mote.speed) % 150);
      const x = room.cx + ((mote.x + Math.sin(now / 2200 + mote.phase) * mote.amp * 4 + 398) % 398);
      ctx.globalAlpha = 0.16 + (Math.sin(now / 900 + mote.phase) + 1) * 0.05;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    ctx.globalAlpha = prev;
  }

  drawRoomAgents(room, list, now) {
    const ctx = this.ctx;
    const seated = [];
    const walking = [];
    for (const rt of list) {
      if (rt.mode === "desk") seated.push(rt);
      else walking.push(rt);
    }
    walking.sort((a, b) => a.y - b.y);
    for (const rt of walking) this.drawAgent(ctx, rt, now);
    for (let seat = 0; seat < 3; seat++) {
      const rt = seated.find((a) => a.seat === seat);
      if (!rt) continue;
      this.drawAgent(ctx, rt, now);
      drawDeskFront(ctx, room, seat, room.accent);
    }
  }

  drawAgent(ctx, rt, now) {
    const status = rt.agent?.status || "idle";
    let pose = "stand";
    if (rt.mode === "walk") pose = "walk";
    else if (rt.mode === "desk") {
      if (status === "attention") pose = "raise";
      else if (status === "working") pose = "type";
      else pose = hashString(rt.id) % 3 === 0 ? "coffee" : "type";
    } else if (rt.mode === "lounge") {
      const spot = this.lounge ? loungeSpots(this.lounge)[rt.loungeSpot] : null;
      pose = spot?.pose || "stand";
      if (pose === "sit" && hashString(rt.id) % 4 === 0) pose = "coffee";
    }
    const frame = Math.floor(now / (pose === "walk" ? 150 : 240));
    const blink = ((now + hashString(rt.id) * 31) % 5400) < 130;
    drawCharacter(ctx, rt.x, rt.y, rt.look, {
      pose,
      frame,
      scale: rt.scale,
      face: rt.facing,
      alpha: rt.alpha,
      sub: !!rt.agent?.isChild,
      blink,
    });
    const w = 28 * rt.scale;
    const h = 58 * rt.scale;
    this.hitAgents.push({ id: rt.id, x: rt.x - w / 2, y: rt.y - h, w, h });
  }

  drawBubbleFor(rt, now, bounds, placed = []) {
    if (rt.alpha < 0.4 || rt.mode === "walk") return;
    const status = rt.agent?.status || "idle";
    let text = "";
    let tone = "work";
    if (status === "attention") {
      text = rt.agent?.activity?.kind === "question" ? "NEEDS YOUR ANSWER" : "NEEDS A HAND";
      tone = "alert";
    } else if (status === "working" && rt.mode === "desk") {
      text = rt.agent?.activity?.label || "Working";
      tone = "work";
    } else if (now < rt.chatUntil) {
      text = rt.chatText;
      tone = "chat";
    }
    if (!text) return;
    const clipped = short(text, 24).toUpperCase();
    const size = uiTextSize(clipped, { font: BUBBLE_FONT });
    const ctx = this.ctx;
    const w = size.width + 18;
    const h = 25;
    const area = bounds || this.lounge;
    if (!area) return;
    const x = Math.round(clamp(rt.x - w / 2, area.cx + 4, area.cx + area.cw - w - 4));
    let y = Math.round(rt.y - 56 * rt.scale - h - 4);
    // Desk bubbles can collide when neighbors are busy. Lift the later one
    // into the empty wallpaper and keep a stem down to the speaker.
    for (let guard = 0; guard < 3; guard++) {
      const hit = placed.find(
        (p) => x < p.x + p.w + 4 && x + w + 4 > p.x && y < p.y + p.h + 4 && y + h + 4 > p.y
      );
      if (!hit) break;
      y = Math.round(hit.y - h - 4);
    }
    y = Math.max(area.cy + 4, y);
    placed.push({ x, y, w, h });
    const accent = tone === "alert" ? "#ef7464" : tone === "chat" ? "#9b87e8" : (this.roomById.get(rt.roomId)?.accent?.main || "#5ad4b2");
    ctx.save();
    ctx.globalAlpha = rt.alpha;
    ctx.fillStyle = "rgba(4,7,13,0.35)";
    ctx.fillRect(x + 2, y + 2, w, h);
    ctx.fillStyle = "#0c1626";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = "#273852";
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
    // tail / leader line down to the speaker
    const headY = rt.y - 58 * rt.scale + 2;
    const tailX = Math.round(clamp(rt.x, x + 8, x + w - 8));
    const stem = Math.max(3, Math.round(headY - (y + h)));
    ctx.fillStyle = "#0c1626";
    ctx.fillRect(tailX - 1, y + h, 3, stem);
    ctx.fillStyle = accent;
    ctx.fillRect(tailX, y + h, 1, Math.max(1, stem - 1));
    drawUiText(ctx, clipped, x + 9, y + 6, {
      color: tone === "alert" ? "#ffd9d3" : "#d9e3ea",
      font: BUBBLE_FONT,
      maxChars: 24,
    });
    ctx.restore();
    if (tone === "alert") {
      const blink = Math.floor(now / 420) % 2 === 0;
      if (blink) {
        ctx.fillStyle = "#ef7464";
        ctx.fillRect(x + w - 12, y - 12, 13, 13);
        drawUiText(ctx, "!", x + w - 8, y - 12, { color: "#1a0d0c", font: 15 });
      }
    }
  }

  drawMarker(rt, now, color) {
    const ctx = this.ctx;
    const b = 58 * rt.scale;
    const w = 30 * rt.scale;
    const x = rt.x;
    const y = rt.y;
    const pulse = Math.floor(now / 380) % 2;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    const len = 4;
    // corner brackets
    ctx.fillRect(x - w / 2 - 2, y - b, len, 1);
    ctx.fillRect(x - w / 2 - 2, y - b, 1, len);
    ctx.fillRect(x + w / 2 + 1 - len, y - b, len, 1);
    ctx.fillRect(x + w / 2 + 2, y - b, 1, len);
    ctx.fillRect(x - w / 2 - 2, y + 1, len, 1);
    ctx.fillRect(x - w / 2 - 2, y + 2 - len, 1, len);
    ctx.fillRect(x + w / 2 + 1 - len, y + 1, len, 1);
    ctx.fillRect(x + w / 2 + 2, y + 2 - len, 1, len);
    // floating caret
    const bob = pulse ? 0 : 1;
    ctx.fillRect(Math.round(x) - 2, Math.round(y - b - 9 - bob), 5, 3);
    ctx.fillRect(Math.round(x) - 1, Math.round(y - b - 6 - bob), 3, 2);
    ctx.fillRect(Math.round(x), Math.round(y - b - 4 - bob), 1, 1);
    ctx.restore();
  }

  dim(bounds) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(3,6,13,0.58)";
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  outlineFocus() {
    const room = this.roomById.get(this.focusRoomId);
    if (!room) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = room.accent?.main || "#5ad4b2";
    ctx.lineWidth = 1;
    ctx.strokeRect(room.x + 0.5, room.y + 0.5, room.w - 1, room.h - 1);
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(room.x - 2.5, room.y - 2.5, room.w + 5, room.h + 5);
    ctx.restore();
  }

  drawTooltip(rt) {
    const ctx = this.ctx;
    const status = rt.agent?.status || "idle";
    const activity = rt.agent?.activity || {};
    const lines = [
      { text: rt.name, color: "#f3ead7", font: 18 },
      { text: `${STATUS_LABEL[status] || ""}${this.roomById.get(rt.roomId) ? " · " + this.roomById.get(rt.roomId).name : ""}`, color: status === "attention" ? "#ef7464" : status === "working" ? "#5ad4b2" : "#8f9db7", font: 16 },
      { text: short(activity.label || "At ease", 34), color: "#c6bfae", font: 16 },
    ];
    if (activity.detail) lines.push({ text: short(activity.detail, 40), color: "#71809b", font: 15 });
    lines.push({ text: "CLICK TO OPEN FILE", color: "#7c8aa4", font: 14 });

    let width = 0;
    for (const line of lines) width = Math.max(width, uiTextSize(line.text, { font: line.font }).width);
    const lineHeight = 19;
    const w = width + 22;
    const h = 13 + lines.length * lineHeight + 4;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (this.pointer.x / rect.width) * this.width;
    const mouseY = (this.pointer.y / rect.height) * this.height;
    const x = Math.round(clamp(mouseX + 14, 4, this.width - w - 4));
    const y = Math.round(clamp(mouseY - h - 10, 4, this.height - h - 4));
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x + 3, y + 3, w, h);
    ctx.fillStyle = "#0b1424";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#f2b24c";
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = "#33465f";
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
    let ty = y + 10;
    for (const line of lines) {
      drawUiText(ctx, line.text.toUpperCase(), x + 10, ty, { color: line.color, font: line.font });
      ty += lineHeight;
    }
    ctx.restore();
  }

  pickHovered() {
    if (!this.pointer.inside) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (this.pointer.x / rect.width) * this.width;
    const y = (this.pointer.y / rect.height) * this.height;
    for (let i = this.hitAgents.length - 1; i >= 0; i--) {
      const b = this.hitAgents[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }

  hitRoom() {
    const rect = this.canvas.getBoundingClientRect();
    const x = (this.pointer.x / rect.width) * this.width;
    const y = (this.pointer.y / rect.height) * this.height;
    for (const b of this.hitRooms) {
      if (b.id && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }

  bindPointer() {
    this.onMove = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.pointer.inside = true;
    };
    this.onLeave = () => {
      this.pointer.inside = false;
    };
    this.onClick = (event) => {
      this.onMove(event);
      const id = this.pickHovered();
      if (id) {
        this.cb.onAgentClick?.(id);
        return;
      }
      const roomId = this.hitRoom();
      if (roomId) {
        this.cb.onRoomClick?.(roomId);
        return;
      }
      this.cb.onBackgroundClick?.();
    };
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.canvas.addEventListener("click", this.onClick);
    this.unbindPointer = () => {
      this.canvas.removeEventListener("pointermove", this.onMove);
      this.canvas.removeEventListener("pointerleave", this.onLeave);
      this.canvas.removeEventListener("click", this.onClick);
    };
  }
}
