import { readFileSync } from "node:fs";

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parsePrompts(text) {
  const prompts = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    if (!current.id || !current.text) throw new Error("Un prompt quedó sin id o sin text");
    prompts.push(current);
    current = null;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("- ") ? line.slice(2) : line;
    const match = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) throw new Error(`Línea YAML no reconocida: ${line}`);
    const [, key, rawValue] = match;
    const value = stripQuotes(rawValue);
    if (line.startsWith("- ")) {
      flush();
      current = { id: "", text: "", after: {} };
    }
    if (!current) throw new Error(`Campo fuera de un prompt: ${line}`);
    if (key === "id" || key === "text") current[key] = value;
    else if (key.startsWith("after_")) {
      if (value) current.after[key.slice("after_".length)] = value;
    } else {
      throw new Error(`Campo YAML no soportado: ${key}`);
    }
  }
  flush();
  if (prompts.length < 10 || prompts.length > 20) {
    throw new Error(`Se esperaban 10 a 20 preguntas y hay ${prompts.length}`);
  }
  return prompts;
}

export function loadPrompts(file) {
  return parsePrompts(readFileSync(file, "utf8"));
}
