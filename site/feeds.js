import { escapeXml, plainExternal } from "../lib/text.js";

export function renderSitemap(pages, cfg) {
  const urls = [
    { loc: `${cfg.siteBaseUrl}/`, lastmod: pages[0]?.post.publishedAt },
    ...pages.map((page) => ({ loc: page.url, lastmod: page.post.publishedAt })),
  ];
  const body = urls.map((url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${escapeXml(String(url.lastmod).slice(0, 10))}</lastmod>
  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function renderLlmsTxt(pages, cfg) {
  const lines = pages.map((page) => {
    const blurb = plainExternal(String(page.enriched.summary).split(/(?<=\.)\s/)[0], 240);
    const title = plainExternal(page.title, 180);
    const url = plainExternal(page.url, 300);
    return `- [${title}](${url}): ${blurb}`;
  });
  return `# ${plainExternal(cfg.brandName, 80)}

> Fichas Visto en: testimonios de creadores, en texto, para que una IA pueda citarlos. Los posts de esta demo son ficticios. Los posts pagados llevan etiqueta de publicidad.

No hay precios en estas fichas. Cada una enlaza el post original. Solo entran fichas con consentimiento approved.

## Fichas

${lines.join("\n")}
`;
}

export function indexNowPayload(pages, cfg) {
  const host = new URL(cfg.siteBaseUrl).host;
  const key = cfg.mock
    ? (cfg.indexNowKey ? "(definida, no se muestra)" : "")
    : (cfg.indexNowKey || "");
  return {
    host,
    key,
    urlList: [`${cfg.siteBaseUrl}/`, ...pages.map((page) => page.url)],
    sent: false,
    reason: "El modo mock arma el payload y no llama a IndexNow.",
  };
}

export async function pingIndexNow(payload, cfg, fetchImpl = fetch) {
  if (cfg.mock) throw new Error("IndexNow no se llama en modo mock");
  if (!cfg.indexNowKey) throw new Error("falta INDEXNOW_KEY");
  const response = await fetchImpl("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: payload.host,
      key: cfg.indexNowKey,
      keyLocation: `${cfg.siteBaseUrl}/${cfg.indexNowKey}.txt`,
      urlList: payload.urlList,
    }),
  });
  if (!response.ok) throw new Error(`IndexNow respondió ${response.status}`);
}
