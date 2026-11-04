import { ENGINES } from "./engines.js";

export function simulateMeasurements(prompts, pages) {
  const byUser = Object.create(null);
  for (const page of pages) byUser[page.post.username] = page;
  const rows = [];
  for (const phase of ["before", "after"]) {
    for (const prompt of prompts) {
      for (const engine of ENGINES) {
        const username = phase === "after" ? prompt.after[engine] : "";
        const page = username ? byUser[username] : undefined;
        if (username && !page) {
          throw new Error(`El prompt ${prompt.id} cita a @${username}, que no tiene ficha`);
        }
        const hit = Boolean(page);
        rows.push({
          phase,
          promptId: prompt.id,
          promptText: prompt.text,
          engine,
          citesDomain: hit ? 1 : 0,
          citesPage: hit ? 1 : 0,
          citesCreator: hit ? 1 : 0,
          citedUrl: hit ? page.url : "",
          citedCreator: hit ? page.post.username : "",
          simulated: 1,
        });
      }
    }
  }
  return rows;
}
