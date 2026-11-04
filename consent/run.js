import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { buildConsent } from "./payload.js";

const USERNAME = /^(?!.*\.\.)(?!\.)[A-Za-z0-9._]{2,30}(?<!\.)$/;
const POST_ID = /^\d+$/;

export function consentForPages(pages, cfg) {
  return pages.map((page) => buildConsent(page, cfg));
}

export function consentFileName(row) {
  const username = String(row.username || "");
  const postId = String(row.postId || "");
  if (!USERNAME.test(username) || !POST_ID.test(postId)) {
    throw new Error("Nombre de consentimiento inválido");
  }
  return `${username}-${postId}.json`;
}

export function writeConsent(rows, outDir) {
  const dir = resolve(outDir, "consent");
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const row of rows) {
    const name = consentFileName(row);
    const file = resolve(dir, name);
    if (!file.startsWith(dir + sep)) throw new Error("Ruta de consentimiento fuera de la carpeta");
    writeFileSync(file, `${JSON.stringify(row, null, 2)}\n`);
    files.push(name);
  }
  const index = {
    sent: false,
    approved: rows.filter((row) => row.status === "approved").length,
    pending: rows.filter((row) => row.status === "pending").length,
    files,
  };
  writeFileSync(join(dir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
