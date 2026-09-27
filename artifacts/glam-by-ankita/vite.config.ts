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
