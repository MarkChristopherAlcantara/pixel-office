import { identityFor } from "./names.mjs";

const ACCENTS = {
  mint: { id: "mint", main: "#55c9a6", soft: "#a6ecd7", dark: "#246f5c" },
  amber: { id: "amber", main: "#e9a63a", soft: "#f6d79a", dark: "#7b5217" },
  coral: { id: "coral", main: "#e26d62", soft: "#f4b3ab", dark: "#7c2f2a" },
  violet: { id: "violet", main: "#917ce0", soft: "#c9bdf4", dark: "#46367c" },
  sky: { id: "sky", main: "#57a9d6", soft: "#b3dcf2", dark: "#235b7a" },
  lime: { id: "lime", main: "#a9c94e", soft: "#d9eaa2", dark: "#566b1f" },
};

const ROOMS = [
  {
    id: "demo-pixel-office",
    name: "PIXEL OFFICE",
    path: "C:/projects/pixel-office",
    accent: ACCENTS.mint,
    agents: [
      {
        id: "demo-mika", name: "Mika", title: "Landing page polish", agent: "build",
        model: "deepseek-v4.1-flash-free", provider: "opencode",
        activities: [
          { kind: "terminal", label: "Running tests", detail: "npm test -- pixel" },
          { kind: "edit", label: "Editing hero.tsx", detail: "src/sections/hero.tsx" },
          { kind: "read", label: "Reading tokens.css", detail: "src/styles/tokens.css" },
        ],
      },
      {
        id: "demo-tala", name: "Tala", title: "Sprite sheet cleanup", agent: "build",
        model: "qwen4-max-free", provider: "opencode",
        activities: [
          { kind: "edit", label: "Editing sprites.ts", detail: "src/art/sprites.ts" },
          { kind: "search", label: "Searching the code", detail: "outline" },
          { kind: "terminal", label: "Building", detail: "npm run build" },
        ],
      },
      {
        id: "demo-bea", name: "Bea", title: "Notes for the v0.2 handoff", agent: "plan",
        model: "nemotron-3.5-super-vl-free", provider: "opencode",
        idle: true,
      },
    ],
  },
  {
    id: "demo-nebula-arcade",
    name: "NEBULA ARCADE",
    path: "C:/projects/nebula-arcade",
    accent: ACCENTS.violet,
    agents: [
      {
        id: "demo-nico", name: "Nico", title: "Save states + resume", agent: "build",
        model: "deepseek-v4.1-flash-free", provider: "opencode",
        activities: [
          { kind: "terminal", label: "Running command", detail: "npm run dev -- --port 5173" },
          { kind: "read", label: "Reading save-state.ts", detail: "src/game/save-state.ts" },
          { kind: "web", label: "Fetching a page", detail: "developer.mozilla.org" },
        ],
      },
      {
        id: "demo-lia", name: "Lia", title: "Palette pass for the bosses", agent: "plan",
        model: "beam-free", provider: "opencode",
        question: true,
      },
    ],
  },
  {
    id: "demo-moonlit-docs",
    name: "MOONLIT DOCS",
    path: "C:/projects/moonlit-docs",
    accent: ACCENTS.amber,
    agents: [
      {
        id: "demo-rafa", name: "Rafa", title: "Rewrite the quickstart", agent: "build",
        model: "flint-40b-free", provider: "opencode",
        activities: [
          { kind: "write", label: "Writing quickstart.md", detail: "docs/quickstart.md" },
          { kind: "web", label: "Searching the web", detail: "markdown footnotes" },
          { kind: "read", label: "Reading config.md", detail: "docs/config.md" },
        ],
      },
      {
        id: "demo-maya", name: "Maya", title: "Fix broken links", agent: "build",
        model: "qwen4-max-free", provider: "opencode",
        idle: true,
      },
      {
        id: "demo-kiko", name: "Kiko", title: "Check API examples", agent: "general",
        model: "flint-40b-free", provider: "opencode", childOf: "demo-mika",
        idle: true, standing: true,
      },
    ],
  },
];

function makeAgent(spec, now, index, tick, room) {
  const ident = identityFor(spec.id);
  const activityList = spec.activities || [];
  let status = "working";
  let activity;
  let attention = false;
  if (spec.question) {
    status = "attention";
    attention = true;
    activity = {
      kind: "question",
      label: "Waiting for your answer",
      detail: "Should the boss sprites keep the CRT scanline effect?",
    };
  } else if (spec.idle) {
    status = "idle";
    activity = {
      kind: "idle",
      label: "At ease",
      detail: "Last: editing notes.md",
      lastAction: { kind: "edit", label: "Editing notes.md", detail: "notes.md" },
    };
  } else {
    activity = activityList[(tick + index) % Math.max(1, activityList.length)];
  }
  const busy = status !== "idle";
  const startedAt = now - (index + 2) * 2_640_000;
  const updatedAt = now - (spec.idle ? 240_000 : 2_000 + index * 900);
  return {
    id: spec.id,
    name: spec.name,
    trait: ident.trait,
    look: ident.look,
    title: spec.title,
    agent: spec.agent,
    model: spec.model,
    provider: spec.provider,
    directory: room.path,
    status,
    attention,
    busy,
    activity,
    isChild: !!spec.childOf,
    parentId: spec.childOf || null,
    startedAt,
    updatedAt,
    busySince: busy ? updatedAt : 0,
    idleSince: busy ? 0 : now - 240_000,
    ageMs: now - updatedAt,
    tokens: { input: 18000 + index * 4200, output: 900 + index * 320 },
    cost: 0,
    files: spec.idle ? 0 : 1 + (index % 5),
    additions: spec.idle ? 0 : 12 + index * 9,
    deletions: spec.idle ? 0 : 2 + index * 3,
    seat: index,
    seatKind: spec.standing || index >= 3 ? "standing" : "desk",
    roomName: room.name,
    roomId: room.id,
    accent: room.accent,
  };
}

export function demoOffice(now = Date.now()) {
  const tick = Math.floor(now / 18_000);
  const rooms = ROOMS.map((room) => {
    const agents = room.agents.map((spec, index) => makeAgent(spec, now, index, tick, room));
    return {
      ...room,
      agents,
      working: agents.filter((a) => a.status === "working").length,
      attention: agents.filter((a) => a.attention).length,
      idle: agents.filter((a) => a.status === "idle").length,
      agentCount: agents.length,
      lastActive: Math.max(...agents.map((a) => a.updatedAt)),
    };
  });
  const all = rooms.flatMap((r) => r.agents);
  return {
    ok: true,
    demo: true,
    version: "0.1.0",
    generatedAt: now,
    dbPath: "demo://opencode",
    windowMinutes: 20,
    stats: {
      rooms: rooms.length,
      agents: all.length,
      working: all.filter((a) => a.status === "working").length,
      attention: all.filter((a) => a.attention).length,
      idle: all.filter((a) => a.status === "idle").length,
      subagents: all.filter((a) => a.isChild).length,
      tokens: all.reduce((n, a) => n + a.tokens.input + a.tokens.output, 0),
    },
    rooms,
  };
}

const CONVO = [
  { kind: "prompt", text: "The hero feels flat. Can you push the pixel-art look without making it noisy?" },
  { kind: "text", text: "I'll tune the shadows and add a chunky 2px rim light, then check the contrast on the CTA." },
  { kind: "tool", name: "read", status: "completed", label: "Reading hero.tsx", detail: "src/sections/hero.tsx" },
  { kind: "tool", name: "edit", status: "completed", label: "Editing hero.tsx", detail: "src/sections/hero.tsx" },
  { kind: "tool", name: "shell", status: "completed", label: "Running tests", detail: "npm test -- hero", result: "PASS  8 tests\n  hero renders\n  contrast is AA" },
  { kind: "text", text: "Done. The hero now uses a 2px rim light, a quieter checkerboard and a fixed CTA contrast of 4.9:1." },
  { kind: "prompt", text: "Nice. Can you also make the idle animation slower?" },
  { kind: "tool", name: "edit", status: "completed", label: "Editing hero.tsx", detail: "src/sections/hero.tsx" },
  { kind: "tool", name: "shell", status: "running", label: "Running tests", detail: "npm test -- hero" },
];

export function demoDetail(sessionId) {
  const state = demoOffice(Date.now());
  for (const room of state.rooms) {
    const agent = room.agents.find((a) => a.id === sessionId);
    if (!agent) continue;
    const now = Date.now();
    const items = CONVO.map((item, index) => ({
      ...item,
      time: now - (CONVO.length - index) * 38_000,
    }));
    return {
      ok: true,
      session: {
        id: agent.id,
        name: agent.name,
        trait: agent.trait,
        look: agent.look,
        title: agent.title,
        roomName: room.name,
        accent: room.accent,
        directory: agent.directory,
        agent: agent.agent,
        model: agent.model,
        provider: agent.provider,
        created: agent.startedAt,
        updated: agent.updatedAt,
        busy: agent.busy,
        tokens: agent.tokens,
        cost: 0,
        files: agent.files,
        additions: agent.additions,
        deletions: agent.deletions,
        isChild: agent.isChild,
        parentId: agent.parentId,
      },
      items,
    };
  }
  return { ok: false, error: "Session not found in the demo office" };
}
