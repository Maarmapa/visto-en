import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichPost } from "../enrich/run.js";
import { ingest } from "../ingest/run.js";
import { loadConfig } from "../lib/config.js";
import { buildJsonLd, validateJsonLd } from "../site/jsonld.js";
import { buildPage } from "../site/page.js";
import { renderPost } from "../site/render.js";

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "la página no trae JSON-LD");
  return JSON.parse(match[1]);
}

test("el validador rechaza un objeto vacío", () => {
  const errors = validateJsonLd({});
  assert.ok(errors.length > 0);
});

test("cada ficha tiene JSON-LD con @context, @type y los campos requeridos", async () => {
  const cfg = loadConfig({ MOCK: "1" });
  const posts = await ingest(cfg);
  const types = new Set();
  for (const post of posts) {
    const enriched = await enrichPost(post, cfg);
    const page = buildPage(post, enriched, cfg);
    const errors = validateJsonLd(page.jsonld);
    assert.deepEqual(errors, [], `@${post.username}: ${errors.join(", ")}`);
    assert.equal(page.jsonld["@context"], "https://schema.org");
    const posting = page.jsonld["@graph"].find((node) => node["@type"] === "SocialMediaPosting" || node["@type"] === "VideoObject");
    types.add(posting["@type"]);
    assert.ok(posting.url);
    assert.ok(posting.datePublished || posting.uploadDate);
    assert.ok(posting.mentions.every((item) => item["@type"] === "Product" && item.name && item.brand.name));
    const person = page.jsonld["@graph"].find((node) => node["@type"] === "Person");
    assert.equal(person["@id"], posting.author["@id"]);
    assert.match(person.alternateName, /^@artista_demo_/);
    const faq = page.jsonld["@graph"].find((node) => node["@type"] === "FAQPage");
    assert.equal(faq.mainEntity.length, 3);
    const html = renderPost(page, cfg);
    assert.deepEqual(extractJsonLd(html), page.jsonld);
    const words = enriched.summary.trim().split(/\s+/).length;
    assert.ok(words >= 80 && words <= 120, `@${post.username} resumen de ${words} palabras`);
    assert.equal(enriched.summary.includes(" a por "), false);
    const names = enriched.products.map((product) => product.name);
    if (names.includes("Copic Sketch")) assert.equal(names.includes("Copic"), false);
    if (names.includes("Molotow One4All")) assert.equal(names.includes("Molotow"), false);
    if (names.includes("POSCA PC-3M")) assert.equal(names.includes("Posca"), false);
    assert.equal(enriched.faqs[0].answer.includes(".»."), false);
    assert.match(enriched.faqs[0].answer, /«.+»\./);
  }
  assert.ok(types.has("SocialMediaPosting"));
  assert.ok(types.has("VideoObject"));
});
