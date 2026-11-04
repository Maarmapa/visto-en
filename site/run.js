import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { insideDir } from "../media/paths.js";
import { indexNowPayload, renderLlmsTxt, renderSitemap } from "./feeds.js";
import { faviconSvg, renderIndex, renderPost } from "./render.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function copyPageImage(page, cfg, outDir) {
  const image = page.enriched?.image;
  if (!image?.file || !image.absPath || !existsSync(image.absPath)) return;
  if (!insideDir(cfg.mediaDir, image.absPath)) return;
  const file = basename(image.file);
  if (!file || file !== image.file) return;
  const dest = join(outDir, "media", file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(image.absPath, dest);
}

function write(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

export function writeSite(pages, cfg, outDir, options = {}) {
  mkdirSync(join(outDir, "assets"), { recursive: true });
  copyFileSync(join(HERE, "styles.css"), join(outDir, "assets", "visto.css"));
  write(join(outDir, "favicon.svg"), faviconSvg());
  write(join(outDir, "index.html"), renderIndex(pages, cfg, options));
  for (const page of pages) {
    write(join(outDir, page.file), renderPost(page, cfg));
    copyPageImage(page, cfg, outDir);
  }
  write(join(outDir, "sitemap.xml"), renderSitemap(pages, cfg));
  write(join(outDir, "llms.txt"), renderLlmsTxt(pages, cfg));
  const indexnow = indexNowPayload(pages, cfg);
  write(join(outDir, "indexnow.json"), `${JSON.stringify(indexnow, null, 2)}\n`);
  return indexnow;
}
