import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config, WEB_ROOT } from "./config.mjs";
import { OfficeService } from "./service.mjs";
import { closeDb } from "./office.mjs";

const realService = new OfficeService();
const demoService = new OfficeService();
const sseClients = new Set();
let lastBroadcast = 0;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function wantsDemo(url) {
  const param = url.searchParams.get("demo");
  if (param === null) return config.demo;
  return /^(1|true|yes)$/i.test(param);
}

function serviceFor(demo) {
  return demo ? demoService : realService;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function safeFilePath(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return null;
  }
  const file = path.resolve(WEB_ROOT, "." + rel);
  const root = path.resolve(WEB_ROOT) + path.sep;
  if (file !== path.resolve(WEB_ROOT, "index.html") && !file.startsWith(root)) return null;
  return file;
}

function serveStatic(req, res, pathname) {
  const file = safeFilePath(pathname);
  if (!file) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Length": stat.size,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }
  const pathname = url.pathname;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end("Method not allowed");
  }

  if (pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      version: config.version,
      dbPath: config.dbPath,
      demo: config.demo,
      uptime: process.uptime(),
      clients: sseClients.size,
    });
  }

  if (pathname === "/api/state") {
    const demo = wantsDemo(url);
    const service = serviceFor(demo);
    const snapshot = service.getSnapshot(demo);
    return json(res, 200, snapshot);
  }

  if (pathname === "/api/events") {
    const demo = wantsDemo(url);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const client = { res, demo };
    sseClients.add(client);
    req.on("close", () => sseClients.delete(client));
    const service = serviceFor(demo);
    sseSend(res, "hello", { ok: true, demo, version: config.version });
    sseSend(res, "state", service.getSnapshot(demo));
    return;
  }

  if (pathname.startsWith("/api/session/")) {
    const demo = wantsDemo(url);
    let id = pathname.slice("/api/session/".length);
    try { id = decodeURIComponent(id); } catch { /* keep raw */ }
    if (!id) return json(res, 400, { ok: false, error: "Missing session id" });
    const detail = serviceFor(demo).getDetail(id, demo);
    if (!detail) return json(res, 404, { ok: false, error: "Session not found" });
    return json(res, 200, detail);
  }

  if (pathname.startsWith("/api/")) {
    return json(res, 404, { ok: false, error: "Unknown API route" });
  }

  return serveStatic(req, res, pathname);
});

function broadcast() {
  const now = Date.now();
  realService.refresh(now);
  if (sseClients.size > 0 || demoService.snapshot) {
    demoService.refresh(now, true);
  }
  lastBroadcast = now;

  for (const client of sseClients) {
    const service = client.demo ? demoService : realService;
    try {
      sseSend(client.res, "state", service.snapshot);
    } catch {
      sseClients.delete(client);
    }
  }
}

function start(port, attempt = 0) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 10 && !process.env.PIXEL_OFFICE_PORT) {
      console.log(`  port ${port} is busy, trying ${port + 1}…`);
      start(port + 1, attempt + 1);
      return;
    }
    console.error(`Could not start PIXEL OFFICE: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, config.host, () => {
    const url = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${port}`;
    console.log("");
    console.log("  ██ PIXEL OFFICE ─────────────────────────────────────");
    console.log(`  ▸ office     ${url}`);
    console.log(`  ▸ opencode   ${config.dbPath}`);
    console.log(`  ▸ mode       ${config.demo ? "demo" : "live (read-only)"} · polling ${config.pollMs}ms`);
    console.log("  ████████████████████████████████████████████████████");
    console.log("");
    if (config.host === "0.0.0.0") {
      console.log("  ! bound to 0.0.0.0 — anyone on this network can read the office");
    }
  });
}

realService.refresh(Date.now());
if (config.demo) demoService.refresh(Date.now());
setInterval(broadcast, config.pollMs).unref?.();
start(config.port);

function shutdown() {
  console.log("\nClosing PIXEL OFFICE…");
  for (const client of sseClients) {
    try { client.res.end(); } catch { /* noop */ }
  }
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
