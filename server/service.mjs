import { config } from "./config.mjs";
import { readOffice, readSessionDetail } from "./office.mjs";
import { demoOffice, demoDetail } from "./demo.mjs";

const TONE_BY_STATUS = {
  working: "work",
  attention: "alert",
  idle: "idle",
};

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function emptySnapshot(error) {
  return {
    ok: false,
    demo: false,
    version: config.version,
    generatedAt: Date.now(),
    dbPath: config.dbPath,
    windowMinutes: config.windowMinutes,
    stats: { rooms: 0, agents: 0, working: 0, attention: 0, idle: 0, subagents: 0, tokens: 0 },
    rooms: [],
    feed: [],
    source: { ok: false, error },
  };
}

export class OfficeService {
  constructor() {
    this.feed = [];
    this.nextEventId = 1;
    this.prevAgents = new Map();
    this.identities = new Map();
    this.snapshot = null;
    this.booted = false;
    this.lastEventByAgent = new Map();
    this.lastRefreshError = null;
  }

  addEvent(agent, text, tone, roomName, now = Date.now()) {
    const event = {
      id: this.nextEventId++,
      time: now,
      name: agent?.name || "Office",
      room: roomName || agent?.roomName || "",
      text,
      tone: tone || "info",
    };
    this.feed.unshift(event);
    if (this.feed.length > 60) this.feed.length = 60;
    return event;
  }

  diff(data, now) {
    const current = new Map();
    for (const room of data.rooms) {
      for (const agent of room.agents) {
        current.set(agent.id, { agent: { ...agent, roomId: room.id, roomName: room.name }, roomName: room.name });
      }
    }

    if (!this.booted) {
      this.booted = true;
      this.addEvent(null, `Office opened — watching ${data.rooms.length} room${data.rooms.length === 1 ? "" : "s"}`, "info", "", now);
      const working = [...current.values()].filter((x) => x.agent.status === "working").slice(0, 3);
      const attention = [...current.values()].filter((x) => x.agent.attention).slice(0, 2);
      for (const item of [...attention, ...working]) {
        const a = item.agent;
        const text = a.attention
          ? `${a.name} needs a hand`
          : `${a.name} is ${lowerFirst(a.activity.label)}`;
        this.addEvent(a, text, a.attention ? "alert" : "work", item.roomName, now);
      }
      this.prevAgents = current;
      return;
    }

    let emitted = 0;
    for (const [id, item] of current) {
      const { agent, roomName } = item;
      const before = this.prevAgents.get(id);
      if (!before) {
        if (emitted < 5) {
          this.addEvent(agent, `${agent.name} walked into ${roomName}`, "arrive", roomName, now);
          emitted++;
        }
        continue;
      }
      const prev = before.agent;
      if (prev.status !== agent.status) {
        if (agent.status === "attention") {
          const text = agent.activity.kind === "question"
            ? `${agent.name} is waiting for your answer`
            : `${agent.name} needs a hand — ${lowerFirst(agent.activity.label)}`;
          this.addEvent(agent, text, "alert", roomName, now);
        } else if (agent.status === "working") {
          this.addEvent(agent, `${agent.name} started working`, "work", roomName, now);
        } else {
          this.addEvent(agent, `${agent.name} finished a turn`, "done", roomName, now);
        }
        emitted++;
      } else if (agent.status === "working" && prev.activity?.kind !== agent.activity.kind) {
        const last = this.lastEventByAgent.get(id) || 0;
        if (now - last > 10_000 && emitted < 4) {
          this.lastEventByAgent.set(id, now);
          this.addEvent(agent, `${agent.name} is ${lowerFirst(agent.activity.label)}`, TONE_BY_STATUS.working, roomName, now);
          emitted++;
        }
      }
    }

    for (const [id, item] of this.prevAgents) {
      if (!current.has(id)) {
        if (emitted < 6) {
          this.addEvent(item.agent, `${item.agent.name} left the office`, "idle", item.roomName, now);
          emitted++;
        }
        this.lastEventByAgent.delete(id);
      }
    }

    this.prevAgents = current;
  }

  refresh(now = Date.now(), forceDemo = false) {
    const demo = forceDemo || config.demo;
    if (demo) {
      const data = demoOffice(now);
      this.diff(data, now);
      data.feed = this.feed.slice(0, 50);
      data.source = { ok: true, error: null };
      this.snapshot = data;
      return data;
    }

    try {
      const data = readOffice(now);
      this.identities = data._identities || new Map();
      delete data._identities;
      this.diff(data, now);
      data.feed = this.feed.slice(0, 50);
      data.source = { ok: true, error: null };
      this.lastRefreshError = null;
      this.snapshot = data;
      return data;
    } catch (error) {
      this.lastRefreshError = error?.message || String(error);
      if (this.snapshot) {
        this.snapshot = {
          ...this.snapshot,
          ok: false,
          generatedAt: now,
          source: { ok: false, error: this.lastRefreshError },
          feed: this.feed.slice(0, 50),
        };
      } else {
        this.snapshot = { ...emptySnapshot(this.lastRefreshError), feed: this.feed.slice(0, 50) };
      }
      if (this.feed[0]?.text !== `Read error: ${this.lastRefreshError}`) {
        this.addEvent(null, `Read error: ${this.lastRefreshError}`, "alert", "", now);
      }
      return this.snapshot;
    }
  }

  getSnapshot(demo = false) {
    if (!this.snapshot || !!this.snapshot.demo !== !!demo) {
      return this.refresh(Date.now(), demo);
    }
    return this.snapshot;
  }

  getDetail(sessionId, demo = false) {
    try {
      if (demo || config.demo) return demoDetail(sessionId);
      return readSessionDetail(sessionId, this.identities);
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }
}
