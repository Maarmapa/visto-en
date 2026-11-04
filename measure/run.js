import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderDashboard } from "../site/render.js";
import { dashboardView } from "./dashboard.js";
import { runLiveMeasurement } from "./engines.js";
import { loadPrompts } from "./prompts.js";
import { simulateMeasurements } from "./simulate.js";

export async function measure(pages, cfg, fetchImpl = fetch) {
  const prompts = loadPrompts(cfg.promptsPath);
  if (cfg.mock || !cfg.measureLive) {
    return {
      mode: "simulado",
      prompts,
      measurements: simulateMeasurements(prompts, pages),
    };
  }
  return {
    mode: "vivo",
    prompts,
    measurements: await runLiveMeasurement(prompts, pages, cfg, fetchImpl),
  };
}

export function writeDashboard(measurements, prompts, cfg, outDir) {
  const html = renderDashboard(dashboardView(measurements, prompts), cfg);
  const file = join(outDir, "dashboard", "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return file;
}
