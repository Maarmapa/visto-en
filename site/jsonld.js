import { isVideoPost } from "../ingest/normalize.js";

function hasType(node, type) {
  if (!node || node["@type"] == null) return false;
  const value = node["@type"];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

export function validateJsonLd(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["la raíz tiene que ser un objeto"];
  }
  const context = data["@context"];
  if (context !== "https://schema.org" && context !== "http://schema.org") {
    errors.push("falta @context de schema.org");
  }
  if (!Array.isArray(data["@graph"]) || data["@graph"].length === 0) {
    errors.push("falta @graph");
    return errors;
  }
  const nodes = data["@graph"];
  const posting = nodes.find((node) => hasType(node, "SocialMediaPosting") || hasType(node, "VideoObject"));
  if (!posting) {
    errors.push("falta SocialMediaPosting o VideoObject");
  } else {
    if (!posting["@type"]) errors.push("el post no tiene @type");
    if (!posting.url) errors.push("el post no tiene url");
    if (!posting.datePublished && !posting.uploadDate) errors.push("el post no tiene fecha");
    if (!posting.author) errors.push("el post no tiene author");
    const mentions = Array.isArray(posting.mentions) ? posting.mentions : [];
    const products = mentions.filter((item) => hasType(item, "Product") && item.name);
    if (products.length === 0) errors.push("mentions no incluye un Product con name");
  }
  const person = nodes.find((node) => hasType(node, "Person") && node.name);
  if (!person) errors.push("falta Person con name");
  const faq = nodes.find((node) => hasType(node, "FAQPage"));
  if (!faq) {
    errors.push("falta FAQPage");
  } else {
    const questions = Array.isArray(faq.mainEntity) ? faq.mainEntity : [];
    if (questions.length < 1) errors.push("FAQPage sin mainEntity");
    for (const question of questions) {
      if (!hasType(question, "Question") || !question.name) errors.push("Question incompleta");
      const answer = question.acceptedAnswer;
      if (!answer || !hasType(answer, "Answer") || !answer.text) errors.push("Answer incompleta");
    }
  }
  return errors;
}

function isoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toISOString();
}

export function buildJsonLd(post, enriched, pageUrl, cfg) {
  const personId = `${pageUrl}#creador`;
  const title = pageTitle(post, enriched);
  const video = isVideoPost(post);
  const published = isoDate(post.publishedAt);
  const person = {
    "@type": "Person",
    "@id": personId,
    name: post.displayName,
    alternateName: `@${post.username}`,
    url: `https://www.instagram.com/${post.username}/`,
  };
  const products = enriched.products.map((product, index) => ({
    "@type": "Product",
    "@id": `${pageUrl}#producto-${index + 1}`,
    name: product.name,
    brand: { "@type": "Brand", name: product.brand },
  }));
  const posting = {
    "@type": video ? "VideoObject" : "SocialMediaPosting",
    "@id": `${pageUrl}#post`,
    name: title,
    headline: title,
    description: cfg.ingestMock ? `Datos ficticios de la demo. ${enriched.summary}` : enriched.summary,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    inLanguage: "es",
    datePublished: published,
    author: { "@id": personId },
    creator: { "@id": personId },
    publisher: {
      "@type": "Organization",
      name: cfg.brandName,
      url: cfg.siteBaseUrl,
    },
    mentions: products,
    isBasedOn: post.permalink,
  };
  if (video) {
    posting.uploadDate = published;
    posting.thumbnailUrl = `${cfg.siteBaseUrl}/favicon.svg`;
    posting.embedUrl = post.permalink;
  }
  if (post.isPaid) {
    posting.sponsor = { "@type": "Organization", name: cfg.brandName };
  }
  const faq = {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: enriched.faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  const data = {
    "@context": "https://schema.org",
    "@graph": [posting, person, faq],
  };
  const errors = validateJsonLd(data);
  if (errors.length) throw new Error(`JSON-LD inválido: ${errors.join("; ")}`);
  return data;
}

export function pageTitle(post, enriched) {
  const product = enriched.products.map((item) => item.name).join(" y ");
  return `Visto en Instagram: @${post.username} usa ${product}`;
}
