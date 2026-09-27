import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFile } from "node:fs/promises";
import { getRouteSeo, renderRouteHtml } from "./scripts/route-html.mjs";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    {
      name: "glam-route-html-development",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const route = (req.url || "").split("?")[0].replace(/^\/|\/$/g, "");
          if (req.method !== "GET" || !route || route.includes("/")) return next();
          if (route === "melbourne-cbd-makeup-artist") {
            res.statusCode = 308;
            res.setHeader("Location", "/services");
            res.end();
            return;
          }
          try {
            const source = await readFile(path.resolve(__dirname, "index.html"), "utf8");
            const metadata = getRouteSeo(source);
            if (!metadata[route]) return next();
            const html = await server.transformIndexHtml(req.url || "/", source);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(renderRouteHtml(html, route, metadata));
          } catch (error) {
            next(error);
          }
        });
        // Vite's default SPA fallback serves the homepage for arbitrary clean URLs.
        // Mirror the explicit production routes while leaving assets and Vite internals alone.
        server.middlewares.use(async (req, res, next) => {
          const pathname = new URL(req.url || "/", "http://localhost").pathname;
          if (req.method !== "GET" || !req.headers.accept?.includes("text/html") ||
              pathname === "/" || pathname === "/index.html" ||
              pathname.startsWith("/api/") || pathname === "/api" ||
              pathname.startsWith("/@") || pathname.startsWith("/__") ||
              /\.[^/]+$/.test(pathname) ||
              /^\/(?:about|services|gallery|contact)\/?$/.test(pathname) ||
              /^\/(?:p|r|account|sign-in|sign-up)\/?$/.test(pathname) ||
              /^\/p\/[a-f0-9]{64}$/.test(pathname) ||
              /^\/sign-(?:in|up)\/.+/.test(pathname)) return next();
          try {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(await readFile(path.resolve(__dirname, "public/404.html"), "utf8"));
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  server: {
    port: parseInt(process.env.PORT || "5173"),
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          clerk: ["@clerk/react"],
          stripe: ["@stripe/react-stripe-js", "@stripe/stripe-js"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  preview: {
    port: parseInt(process.env.PORT || "4173"),
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
