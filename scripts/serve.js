import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../lib/config.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function resolveInside(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  const candidate = resolve(root, relative);
  const base = resolve(root);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) return null;
  return candidate;
}

function fileToServe(root, urlPath) {
  const candidate = resolveInside(root, urlPath);
  if (!candidate) return { status: 403 };
  let target = candidate;
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = join(target, "index.html");
  }
  if (!existsSync(target) && !extname(candidate)) {
    const withIndex = join(candidate, "index.html");
    if (existsSync(withIndex)) target = withIndex;
  }
  if (!existsSync(target) || !statSync(target).isFile()) return { status: 404 };
  const realRoot = realpathSync(root);
  const realFile = realpathSync(target);
  if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${sep}`)) return { status: 403 };
  return { status: 200, file: realFile };
}

export function createStaticServer(outDir) {
  const root = resolve(outDir);
  return createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    let located;
    try {
      located = fileToServe(root, request.url || "/");
    } catch {
      located = { status: 400 };
    }
    if (located.status !== 200) {
      const message = located.status === 404 ? "No está en out/.\n" : "No se puede servir ese path.\n";
      response.writeHead(located.status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : message);
      return;
    }
    const type = TYPES[extname(located.file)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(located.file).pipe(response);
  });
}

function isMain() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  const cfg = loadConfig();
  if (!existsSync(join(cfg.outDir, "index.html"))) {
    console.error("No está out/index.html. Corre primero: make demo");
    process.exitCode = 1;
  } else {
    const server = createStaticServer(cfg.outDir);
    server.listen(cfg.port, "127.0.0.1", () => {
      console.log(`Sirviendo ${cfg.outDir} en http://127.0.0.1:${cfg.port}/`);
    });
  }
}
