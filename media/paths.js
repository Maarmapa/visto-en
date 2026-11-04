import { resolve, sep, basename } from "node:path";

export function insideDir(root, target) {
  const base = resolve(root);
  const abs = resolve(target);
  return abs === base || abs.startsWith(`${base}${sep}`);
}

export function safeBasename(name) {
  const file = basename(String(name || ""));
  if (!file || file !== String(name) || file === "." || file === ".." || !/^[A-Za-z0-9._-]+$/.test(file)) {
    return "";
  }
  return file;
}
