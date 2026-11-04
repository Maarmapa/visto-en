export const ENGINES = ["chatgpt", "perplexity", "google_ai_overview"];

export const ENGINE_LABELS = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  google_ai_overview: "Google AI Overview",
};

function assertLive(cfg) {
  if (cfg.mock) throw new Error("Medición en vivo no se llama en modo mock");
  if (!cfg.measureLive) throw new Error("falta MEASURE_LIVE");
}

export function classifyCitation(text, cfg, pages) {
  const haystack = String(text).toLowerCase();
  const host = new URL(cfg.siteBaseUrl).host.toLowerCase();
  const pageHit = pages.find((page) => haystack.includes(page.url.toLowerCase()));
  const creatorHit = pages.find((page) => {
    const username = page.post.username.toLowerCase();
    return haystack.includes(`@${username}`) || haystack.includes(username);
  });
  return {
    citesDomain: pageHit || haystack.includes(host) ? 1 : 0,
    citesPage: pageHit ? 1 : 0,
    citesCreator: creatorHit ? 1 : 0,
    citedUrl: pageHit ? pageHit.url : "",
    citedCreator: creatorHit ? creatorHit.post.username : "",
  };
}

export async function queryEngine(engine, prompt, cfg, fetchImpl = fetch) {
  assertLive(cfg);
  if (engine === "perplexity") {
    if (!cfg.perplexityApiKey) throw new Error("falta PERPLEXITY_API_KEY");
    const response = await fetchImpl("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.perplexityModel || "sonar",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Perplexity respondió ${response.status}`);
    const body = await response.json();
    return body.choices?.[0]?.message?.content || "";
  }
  if (engine === "chatgpt") {
    if (!cfg.openaiApiKey) throw new Error("falta OPENAI_API_KEY");
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.openaiModel || "gpt-4.1",
        tools: [{ type: "web_search" }],
        input: prompt,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI respondió ${response.status}`);
    const body = await response.json();
    return body.output_text || "";
  }
  if (engine === "google_ai_overview") {
    throw new Error("Google AI Overview no tiene una API oficial de citas en este MVP");
  }
  throw new Error(`Motor desconocido: ${engine}`);
}

export async function runLiveMeasurement(prompts, pages, cfg, fetchImpl = fetch) {
  assertLive(cfg);
  const rows = [];
  for (const prompt of prompts) {
    for (const engine of ["chatgpt", "perplexity"]) {
      const answer = await queryEngine(engine, prompt.text, cfg, fetchImpl);
      const citation = classifyCitation(answer, cfg, pages);
      rows.push({
        phase: "after",
        promptId: prompt.id,
        promptText: prompt.text,
        engine,
        simulated: 0,
        ...citation,
      });
    }
  }
  return rows;
}
