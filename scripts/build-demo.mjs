import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OfficeService } from "../server/service.mjs";
import { demoDetail } from "../server/demo.mjs";

/**
 * Builds a static demo of PIXEL OFFICE for GitHub Pages.
 *
 * The live app needs a Node server to read opencode's SQLite database. This
 * build snapshots the demo fixtures instead: one state file plus one detail
 * file per session, with timestamps that the frontend shifts to "now" when
 * the page loads so the demo always feels fresh.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB = path.join(ROOT, "web");
const DIST = path.join(ROOT, "dist");
const buildNow = Date.now();

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(WEB, DIST, { recursive: true });

// Replay the last 20 minutes of the demo office so the activity feed has history.
const service = new OfficeService();
const steps = 20;
const stepMs = 60_000;
for (let i = steps; i >= 0; i--) {
  service.refresh(buildNow - i * stepMs, true);
}
const state = service.getSnapshot(true);

const demoDir = path.join(DIST, "demo");
const sessionDir = path.join(demoDir, "sessions");
fs.mkdirSync(sessionDir, { recursive: true });
fs.writeFileSync(path.join(demoDir, "state.json"), JSON.stringify(state));

let sessions = 0;
for (const room of state.rooms) {
  for (const agent of room.agents) {
    const detail = demoDetail(agent.id);
    detail.generatedAt = buildNow;
    fs.writeFileSync(
      path.join(sessionDir, `${encodeURIComponent(agent.id)}.json`),
      JSON.stringify(detail)
    );
    sessions += 1;
  }
}

fs.writeFileSync(
  path.join(DIST, "static-config.js"),
  `window.PIXEL_OFFICE_STATIC = true;\nwindow.PIXEL_OFFICE_BUILT_AT = ${buildNow};\n`
);

const indexPath = path.join(DIST, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const marker = '<script type="module" src="js/main.js"></script>';
if (!html.includes(marker)) {
  throw new Error("Could not find the main.js script tag in web/index.html");
}
html = html.replace(marker, `<script src="static-config.js"></script>\n  ${marker}`);
fs.writeFileSync(indexPath, html);

// GitHub Pages runs Jekyll by default; this keeps every folder as-is.
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

const bytes = fs
  .readdirSync(DIST, { recursive: true })
  .reduce((total, entry) => {
    const file = path.join(DIST, entry);
    return fs.statSync(file).isFile() ? total + fs.statSync(file).size : total;
  }, 0);

console.log(
  `static demo → dist/ · ${state.rooms.length} rooms · ${sessions} sessions · ` +
    `${state.feed.length} feed events · ${(bytes / 1024).toFixed(0)} KiB`
);
