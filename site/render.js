import { mediaLabel, sourceLabel } from "../ingest/normalize.js";
import { escapeHtml, formatDate, joinAnd, jsonForScript } from "../lib/text.js";
import { metaModelsLine, syntheticImageLabel } from "../media/run.js";

function metaDescription(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 157);
  const boundary = cut.lastIndexOf(" ");
  const base = cut.slice(0, boundary > 40 ? boundary : 157).replace(/[,:;]+$/g, "");
  return `${base}…`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1b1914"/>
  <path d="M7 8h5.2L16 18.2 19.8 8H25L17.4 25h-2.8L7 8z" fill="#f3efe4"/>
</svg>
`;

export function faviconSvg() {
  return FAVICON;
}

function initials(name) {
  const parts = String(name).split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "VD";
}

function shell({ title, description, canonical, jsonld, body, robots = "index,follow" }) {
  const ld = jsonld
    ? `<script type="application/ld+json">${jsonForScript(jsonld)}</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/visto.css">
  ${ld}
</head>
<body>
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <header class="site-header">
    <a class="mark" href="/">Visto <span>en</span></a>
    <nav class="header-links" aria-label="Secciones">
      <a href="/">Fichas</a>
      <a href="/dashboard/">Medición (simulada)</a>
    </nav>
  </header>
  <div class="wrap" id="contenido">
    ${body}
  </div>
  <footer class="site-footer">Tienda Demo · datos ficticios de la demo · nada se publicó fuera de esta carpeta</footer>
</body>
</html>
`;
}

export function textSourceLine(enriched) {
  if (enriched.textSource === "llm" && enriched.modelName) {
    const source = enriched.transcriptUsed ? "del caption y de la transcripción" : "del caption";
    return `Texto generado con ${enriched.modelName} a partir ${source}`;
  }
  return "Plantilla determinista, sin modelo";
}

function relationshipLine(post) {
  if (post.isPaid) {
    return `<p class="ad-label">Publicidad · colaboración pagada con Tienda Demo</p>`;
  }
  return `<p class="ad-note">No consta como colaboración pagada.</p>`;
}

function robotsFor(cfg) {
  return cfg.mock || cfg.ingestMock ? "noindex,nofollow" : "index,follow";
}

function chips(products) {
  return `<ul class="chips">${products.map((product) => `<li>${escapeHtml(product.name)}</li>`).join("")}</ul>`;
}

function embed(post, image, fictional) {
  const caption = post.caption.length > 220 ? `${post.caption.slice(0, 217)}…` : post.caption;
  const link = fictional ? "Abrir el post original (permalink ficticio)" : "Abrir el post original";
  const stage = image?.file
    ? `<div class="embed-stage has-image">
      <img src="/media/${escapeHtml(image.file)}" alt="${escapeHtml(image.alt)}">
    </div>`
    : `<div class="embed-stage">
      <p><strong>${escapeHtml(mediaLabel(post))}</strong><br>Sin foto real. Este recuadro simula el embed.</p>
    </div>`;
  const label = image?.model
    ? `<figcaption class="synthetic-label">${escapeHtml(syntheticImageLabel(image.model))}</figcaption>`
    : "";
  return `<figure class="embed">
    <div class="embed-top">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(post.displayName))}</span>
      <span><strong>${escapeHtml(post.displayName)}</strong><span class="handle">@${escapeHtml(post.username)}</span></span>
    </div>
    ${stage}
    ${label}
    <p class="embed-caption">${escapeHtml(caption)}</p>
    <a class="embed-link" href="${escapeHtml(post.permalink)}">${link}</a>
    <p class="embed-note">Este recuadro simula el embed. El HTML de oEmbed no se inserta en esta ficha.</p>
  </figure>`;
}

export function renderPost(page, cfg) {
  const { post, enriched } = page;
  const faqs = enriched.faqs.map((faq) => `<details>
      <summary>${escapeHtml(faq.question)}</summary>
      <p>${escapeHtml(faq.answer)}</p>
    </details>`).join("");
  const body = `<article class="article">
      <p class="kicker">${escapeHtml(mediaLabel(post))} · ${escapeHtml(formatDate(post.publishedAt))}</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="text-source">${escapeHtml(textSourceLine(enriched))}</p>
      <p class="models">${escapeHtml(metaModelsLine(enriched))}</p>
      ${relationshipLine(post)}
      ${embed(post, enriched.image, cfg.mock || cfg.ingestMock)}
      <p class="summary">${escapeHtml(enriched.summary)}</p>
      <blockquote>
        <p>${escapeHtml(enriched.quote)}</p>
        <footer>— ${escapeHtml(post.displayName)}, @${escapeHtml(post.username)}</footer>
      </blockquote>
      <section>
        <h2>Productos mencionados</h2>
        ${chips(enriched.products)}
      </section>
      <section>
        <h2>Preguntas frecuentes</h2>
        ${faqs}
      </section>
      <footer class="attribution">
        <p>Contenido destacado por Tienda Demo, que vende estos productos.</p>
        <p>Testimonio de @${escapeHtml(post.username)}. Tienda Demo publica esta ficha para poder citar el post, con el enlace al original.</p>
        <p>Origen de la ingesta: ${escapeHtml(sourceLabel(post.source))}. ${escapeHtml(textSourceLine(enriched))}. El creador de la demo no recibió un WhatsApp: el payload quedó en la carpeta de consentimiento, sin enviar.</p>
      </footer>
    </article>`;
  return shell({
    title: `${page.title} · ${cfg.brandName}`,
    description: metaDescription(enriched.summary),
    canonical: page.url,
    jsonld: page.jsonld,
    robots: robotsFor(cfg),
    body,
  });
}

function heldNote(held) {
  const count = Number(held) || 0;
  if (!count) return "";
  const label = count === 1 ? "1 ficha no se publica" : `${count} fichas no se publican`;
  return `<p class="banner">${label}: el consentimiento simulado sigue pendiente.</p>`;
}

export function renderIndex(pages, cfg, options = {}) {
  const cards = pages.map((page) => {
    const products = joinAnd(page.enriched.products.map((product) => product.name));
    const badge = page.post.isPaid ? `<p class="ad-label">Publicidad</p>` : "";
    return `<a class="card" href="${escapeHtml(page.path)}">
      <p class="kicker">@${escapeHtml(page.post.username)} · ${escapeHtml(mediaLabel(page.post))}</p>
      <h2>${escapeHtml(page.post.displayName)}</h2>
      ${badge}
      <p>${escapeHtml(products)}</p>
      <p class="meta">${escapeHtml(formatDate(page.post.publishedAt))} · ${escapeHtml(sourceLabel(page.post.source))}</p>
      <p class="models">${escapeHtml(metaModelsLine(page.enriched))}</p>
    </a>`;
  }).join("");
  const body = `<header class="article">
      <p class="eyebrow">${escapeHtml(cfg.brandName)} · arte y graffiti</p>
      <h1>Visto en</h1>
      <p class="lede">Posts de creadores pasados a páginas que una IA puede leer: texto, cita, preguntas y datos estructurados. En esta demo los creadores, los posts y la tienda son ficticios.</p>
      ${heldNote(options.held)}
    </header>
    <section class="cards" aria-label="Fichas">${cards}</section>`;
  return shell({
    title: `Visto en · ${cfg.brandName}`,
    description: "Fichas citables de posts ficticios donde creadores mencionan a Tienda Demo.",
    canonical: `${cfg.siteBaseUrl}/`,
    robots: robotsFor(cfg),
    body,
  });
}

export function renderDashboard(view, cfg) {
  const measured = view.engines.filter((engine) => !engine.unmeasured);
  const counts = [];
  for (const engine of measured) counts.push(engine.before, engine.after);
  const max = Math.max(1, ...counts);
  const engineRows = view.engines.map((engine) => {
    if (engine.unmeasured) {
      return `<tr>
      <td>${escapeHtml(engine.label)}</td>
      <td colspan="2">${escapeHtml(engine.note)}</td>
    </tr>`;
    }
    return `<tr>
      <td>${escapeHtml(engine.label)}</td>
      <td>${engine.before}</td>
      <td>${engine.after}</td>
    </tr>`;
  }).join("");
  const promptRows = view.prompts.map((prompt) => `<tr>
      <td>${escapeHtml(prompt.id)}</td>
      <td>${escapeHtml(prompt.text)}</td>
      <td>${escapeHtml(prompt.citedBy || "—")}</td>
    </tr>`).join("");
  const body = `<article class="article">
      <p class="eyebrow">Medición simulada</p>
      <h1>Antes y después</h1>
      <p class="banner">Valores escritos a mano para la demo, en fixtures/prompts.yaml. No se consultó ChatGPT, Perplexity ni Google. Google AI Overview no se mide: no hay API oficial. Cuando un motor simulado “cita”, la fila marca a la vez el dominio, la página y al creador.</p>
      <section class="compare" aria-label="Citas al dominio">
        <article class="stat-card">
          <h2>Antes (simulado)</h2>
          <p class="stat">${view.before.domain}</p>
          <p>citas al dominio, de ${view.slots} consultas simuladas</p>
        </article>
        <article class="stat-card after">
          <h2>Después (simulado)</h2>
          <p class="stat">${view.after.domain}</p>
          <p>citas al dominio, de ${view.slots} consultas simuladas</p>
        </article>
      </section>
      <h2>Por motor</h2>
      <p class="meta">Citas al dominio, simuladas. La barra gris es el antes y la verde, el después. El orden de los motores está escrito a mano: no es un resultado.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Motor</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody>${engineRows}</tbody>
        </table>
      </div>
      ${measured.map((engine) => `<p class="meta">${escapeHtml(engine.label)} · antes ${engine.before}, después ${engine.after}</p>
        <div class="bar before"><span style="width:${Math.round((engine.before / max) * 100)}%"></span></div>
        <div class="bar"><span style="width:${Math.round((engine.after / max) * 100)}%"></span></div>`).join("")}
      <h2>Qué marca la simulación</h2>
      <ul>
        <li>Citas al dominio: ${view.after.domain} después, ${view.before.domain} antes.</li>
        <li>Citas a una ficha: ${view.after.page} después, ${view.before.page} antes.</li>
        <li>Citas al creador: ${view.after.creator} después, ${view.before.creator} antes.</li>
      </ul>
      <details>
        <summary>Ver las ${view.prompts.length} preguntas</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Id</th><th>Pregunta</th><th>Después, citado por</th></tr></thead>
            <tbody>${promptRows}</tbody>
          </table>
        </div>
      </details>
    </article>`;
  return shell({
    title: `Medición · ${cfg.brandName}`,
    description: "Dashboard simulado de citas antes y después de publicar las fichas Visto en.",
    canonical: `${cfg.siteBaseUrl}/dashboard/`,
    robots: "noindex,nofollow",
    body,
  });
}
