import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOME = os.homedir();

function firstExisting(candidates) {
  return candidates.filter(Boolean);
}

/**
 * Where opencode keeps its local state. Desktop v2 (and recent CLI builds)
 * use a single SQLite database. We only ever open it read-only.
 */
export function resolveDbPath() {
  if (process.env.PIXEL_OFFICE_DB) return process.env.PIXEL_OFFICE_DB;
  if (process.env.OPENCODE_DB) return process.env.OPENCODE_DB;

  const dataHome = process.env.XDG_DATA_HOME || path.join(HOME, ".local", "share");
  const candidates = firstExisting([
    path.join(dataHome, "opencode", "opencode.db"),
    path.join(HOME, ".local", "share", "opencode", "opencode.db"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "opencode", "opencode.db"),
    path.join(HOME, "AppData", "Local", "opencode", "opencode.db"),
    path.join(HOME, ".opencode", "opencode.db"),
  ]);
  return candidates[0];
}

export const config = {
  port: Number(process.env.PIXEL_OFFICE_PORT || process.env.PORT || 4777),
  host: process.env.PIXEL_OFFICE_HOST || "127.0.0.1",
  dbPath: resolveDbPath(),
  /** Sessions updated within this window are shown in the office. */
  windowMinutes: Number(process.env.PIXEL_OFFICE_WINDOW_MINUTES || 20),
  /** How often the database is read. */
  pollMs: Math.max(500, Number(process.env.PIXEL_OFFICE_POLL_MS || 1500)),
  maxRooms: 9,
  maxAgentsPerRoom: 6,
  detailMessages: 80,
  demo: /^(1|true|yes)$/i.test(process.env.PIXEL_OFFICE_DEMO || ""),
  version: "0.1.0",
};

export const WEB_ROOT = fileURLToPath(new URL("../web", import.meta.url));
