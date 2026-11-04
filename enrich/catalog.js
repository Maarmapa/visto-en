export const CATALOG = [
  { id: "posca-pc-3m", name: "POSCA PC-3M", brand: "Posca", pattern: /posca\s*pc-?3m/i },
  { id: "molotow-one4all", name: "Molotow One4All", brand: "Molotow", pattern: /molotow\s*one4all|one4all/i },
  { id: "copic-sketch", name: "Copic Sketch", brand: "Copic", pattern: /copic\s*sketch/i },
  { id: "angelus-leather", name: "Angelus Acrylic Leather Paint", brand: "Angelus", pattern: /angelus/i },
  { id: "posca", name: "Posca", brand: "Posca", pattern: /posca/i, generic: true },
  { id: "molotow", name: "Molotow", brand: "Molotow", pattern: /molotow/i, generic: true },
  { id: "copic", name: "Copic", brand: "Copic", pattern: /copic/i, generic: true },
];

export function matchProducts(caption) {
  const found = [];
  const claimedBrands = new Set();
  for (const item of CATALOG) {
    const match = caption.match(item.pattern);
    if (!match) continue;
    if (item.generic && claimedBrands.has(item.brand)) continue;
    found.push({ id: item.id, name: item.name, brand: item.brand, index: match.index });
    claimedBrands.add(item.brand);
  }
  found.sort((a, b) => a.index - b.index);
  return found.map(({ id, name, brand }) => ({ id, name, brand }));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producto";
}

export function acceptModelProduct(product, caption) {
  const name = String(product?.name || "").trim();
  if (!name) return null;
  const text = String(caption || "");
  const exact = CATALOG.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const byPattern = exact || CATALOG.find((item) => item.pattern.test(name));
  if (byPattern) {
    if (!byPattern.pattern.test(text)) return null;
    return { id: byPattern.id, name: byPattern.name, brand: byPattern.brand };
  }
  if (text.toLowerCase().includes(name.toLowerCase())) {
    return { id: slug(name), name, brand: String(product.brand || name).trim() || name };
  }
  return null;
}
