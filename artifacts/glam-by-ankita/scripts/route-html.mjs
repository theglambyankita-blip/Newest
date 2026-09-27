// The existing pageSeo object in index.html is the single source of route metadata.
// Keep the complete HTML shell on every route so booking, authentication and SPA
// navigation continue to work; only the initial SEO and visible page differ.
export const siteOrigin = "https://www.theglambyankita.com";

function replaceOnce(html, pattern, replacement, label) {
  const matches = html.match(new RegExp(pattern.source, "g"));
  if (!matches || matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in index.html; found ${matches?.length ?? 0}`);
  }
  return html.replace(pattern, replacement);
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textFromMarkup(markup) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    "#39": "'",
    apos: "'",
    nbsp: " ",
  };
  return markup
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/gi, (entity) =>
      entities[entity.slice(1, -1).toLowerCase()] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function getVisibleFaqs(html) {
  const pattern = /<div class="faq-item">\s*<button class="faq-q"[^>]*>([\s\S]*?)<span class="faq-q-icon">[\s\S]*?<\/button>\s*<div class="faq-a">\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<\/div>/g;
  const faqs = [...html.matchAll(pattern)].map((match) => ({
    "@type": "Question",
    name: textFromMarkup(match[1]),
    acceptedAnswer: {
      "@type": "Answer",
      text: textFromMarkup(match[2]),
    },
  }));
  if (!faqs.length || faqs.some((faq) => !faq.name || !faq.acceptedAnswer.text)) {
    throw new Error("Could not extract complete visible FAQ content");
  }
  if (new Set(faqs.map((faq) => faq.name)).size !== faqs.length) {
    throw new Error("Visible FAQ questions must be unique");
  }
  return faqs;
}

export function getRouteSeo(html) {
  const pages = html.match(/const validPages = \[([^\]]+)\];/);
  const seo = html.match(/const pageSeo = \{([\s\S]*?)\n  \};/);
  if (!pages || !seo) throw new Error("Could not find validPages or pageSeo in index.html");

  const routes = [...pages[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (!routes.includes("home") || new Set(routes).size !== routes.length) {
    throw new Error("Invalid or duplicate routes in validPages");
  }
  const metadata = {};
  for (const route of routes) {
    const key = /^[a-zA-Z_$][\w$]*$/.test(route) ? route : `'${route}'`;
    const entry = seo[1].match(new RegExp(`(?:^|\\n)\\s*${key}:\\s*\\{\\s*title:\\s*'([^']+)',\\s*description:\\s*'([^']+)'\\s*\\}`, "u"));
    if (!entry) throw new Error(`Missing pageSeo metadata for ${route}`);
    metadata[route] = { title: entry[1], description: entry[2] };
  }
  return metadata;
}

export function renderRouteHtml(html, route, metadata = getRouteSeo(html)) {
  if (!metadata[route]) throw new Error(`Unknown public route: ${route}`);
  const { title, description } = metadata[route];
  const url = siteOrigin + (route === "home" ? "/" : `/${route}`);
  const servicePageRoutes = new Set([
    "bridal-makeup-melbourne",
    "glam-makeup-melbourne",
    "editorial-makeup-melbourne",
    "destination-weddings",
  ]);
  const navRoute = servicePageRoutes.has(route) ? "services" : route;

  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`, "title");
  for (const [name, value] of [
    ["description", description],
    ["twitter:title", title],
    ["twitter:description", description],
  ]) {
    html = replaceOnce(html, new RegExp(`<meta name="${name}" content="[^"]*">`), `<meta name="${name}" content="${escapeHtml(value)}">`, name);
  }
  for (const [property, value] of [
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
  ]) {
    html = replaceOnce(html, new RegExp(`<meta property="${property}" content="[^"]*">`), `<meta property="${property}" content="${escapeHtml(value)}">`, property);
  }
  for (const [rel, extra] of [
    ["canonical", ""],
    ["alternate", ' hreflang="en-AU"'],
    ["alternate", ' hreflang="x-default"'],
  ]) {
    html = replaceOnce(html, new RegExp(`<link rel="${rel}"${extra} href="[^"]*">`), `<link rel="${rel}"${extra} href="${escapeHtml(url)}">`, `${rel}${extra}`);
  }

  // Keep all .page and #root nodes in the HTML for SPA navigation and booking.
  // Set the initially visible page even for crawlers/browsers without JavaScript.
  html = replaceOnce(html, /(<div class="page) active(" id="page-home")/, "$1$2", "home active page");
  if (route !== "home") {
    html = replaceOnce(html, new RegExp(`(<div class="page)(" id="page-${route}")`), "$1 active$2", `${route} active page`);
    html = replaceOnce(html, /(<a class=")active(" href="\/" onclick="event\.preventDefault\(\);showPage\('home',this\);closeMobileNav\(\)">)/, "$1$2", "home active navigation");
    html = replaceOnce(html, new RegExp(`(<a)( href="/${navRoute}" onclick="event\\.preventDefault\\(\\);showPage\\('${navRoute}',this\\);closeMobileNav\\(\\)">)`), "$1 class=\"active\"$2", `${navRoute} active navigation`);
  } else {
    html = replaceOnce(html, /(<div class="page)(" id="page-home")/, "$1 active$2", "home active page");
  }

  // Keep FAQ structured data in sync with visible FAQ copy on home only.
  const jsonLdPattern = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
  const jsonLd = html.match(jsonLdPattern);
  if (!jsonLd) throw new Error("Could not find JSON-LD script in index.html");
  const schemas = JSON.parse(jsonLd[2]);
  if (!Array.isArray(schemas)) throw new Error("Expected JSON-LD schema array");
  let faqSchemaFound = false;
  const pageSchemas = route === "home"
    ? schemas.map((schema) => {
      if (schema["@type"] !== "FAQPage") return schema;
      faqSchemaFound = true;
      return { ...schema, mainEntity: getVisibleFaqs(html) };
    })
    : schemas.filter((schema) => schema["@type"] !== "FAQPage");
  if (route === "home" && !faqSchemaFound) {
    throw new Error("Could not find FAQPage schema to synchronize with visible FAQs");
  }
  html = replaceOnce(
    html,
    jsonLdPattern,
    (match, openTag, schemaJson, closeTag) =>
      `${openTag}${JSON.stringify(pageSchemas).replace(/</g, "\\u003c")}${closeTag}`,
    "JSON-LD script",
  );

  if (servicePageRoutes.has(route)) {
    const serviceNames = {
      "bridal-makeup-melbourne": "Bridal Makeup",
      "glam-makeup-melbourne": "Glam Makeup",
      "editorial-makeup-melbourne": "Editorial Makeup",
      "destination-weddings": "Destination Weddings",
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": `${siteOrigin}/` },
        { "@type": "ListItem", "position": 2, "name": "Services", "item": `${siteOrigin}/services` },
        { "@type": "ListItem", "position": 3, "name": serviceNames[route], "item": url },
      ],
    };
    const service = {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": serviceNames[route],
      "serviceType": serviceNames[route],
      description,
      url,
      "provider": { "@id": `${siteOrigin}/#business` },
      "areaServed": { "@type": "City", "name": "Melbourne" },
    };
    const pageSchema = [breadcrumb, service]
      .map((schema) => `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`)
      .join("\n  ");
    html = replaceOnce(html, /<\/head>/, `${pageSchema}\n</head>`, "head close");
  }

  return html;
}