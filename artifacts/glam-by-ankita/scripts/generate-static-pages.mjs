import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getRouteSeo, renderRouteHtml, siteOrigin } from "./route-html.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [source, built, sitemap, robots] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "dist/index.html"), "utf8"),
  readFile(path.join(root, "public/sitemap.xml"), "utf8"),
  readFile(path.join(root, "public/robots.txt"), "utf8"),
]);
const metadata = getRouteSeo(source);
const expectedUrls = Object.keys(metadata).map((route) => siteOrigin + (route === "home" ? "/" : `/${route}`));
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (sitemapUrls.length !== expectedUrls.length || new Set(sitemapUrls).size !== sitemapUrls.length ||
    expectedUrls.some((url) => !sitemapUrls.includes(url))) {
  throw new Error(`Sitemap must list each public route exactly once: ${expectedUrls.join(", ")}`);
}
if (!robots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) {
  throw new Error("robots.txt has no matching absolute sitemap URL");
}

// Preserve the Vite-generated hashed asset references and full SPA shell.
for (const route of Object.keys(metadata)) {
  const output = route === "home" ? path.join(root, "dist/index.html") : path.join(root, "dist", route, "index.html");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderRouteHtml(built, route, metadata));
  console.log(`Generated ${path.relative(root, output)}`);
}