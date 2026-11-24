import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Preview the static demo under the same subpath GitHub Pages uses.
 *   npm run build:demo
 *   npm run preview:demo
 *   open http://127.0.0.1:4780/pixel-office/
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");
const BASE = "/pixel-office/";
const PORT = Number(process.env.PIXEL_OFFICE_PREVIEW_PORT || 4780);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/") {
      res.writeHead(302, { Location: BASE });
      return res.end();
    }
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }

    let rel = decodeURIComponent(url.pathname.slice(BASE.length));
    if (!rel || rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.stat(file, (statError, stat) => {
      if (statError || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`static demo preview → http://127.0.0.1:${PORT}${BASE}`);
  });
