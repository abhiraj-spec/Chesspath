// Minimal static server for the production export in out/ (no dependencies).
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const port = Number(process.env.PORT ?? 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".webmanifest": "application/manifest+json", ".txt": "text/plain",
};
if (!existsSync(root)) {
  console.error("out/ not found. Run `npm run build` first.");
  process.exit(1);
}
createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  else if (!existsSync(file) && existsSync(file + ".html")) file = file + ".html";
  else if (!existsSync(file) && !extname(file) && existsSync(join(file, "index.html"))) {
    res.writeHead(308, { Location: url.pathname + "/" + url.search });
    res.end();
    return;
  }
  if (!existsSync(file)) {
    file = join(root, "404.html");
    res.statusCode = 404;
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const headers = { "Content-Type": type };
  if (path.startsWith("/_next/static/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
  else if (path === "/sw.js") headers["Cache-Control"] = "no-cache";
  res.writeHead(res.statusCode || 200, headers);
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`ChessPath running at http://localhost:${port}`));
