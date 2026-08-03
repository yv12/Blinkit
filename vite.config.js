import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Serve / copy build-time OFF images from ./img → /img */
function serveImgDir() {
  const dir = path.resolve("img");
  return {
    name: "serve-img-dir",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/img/")) return next();
        const name = decodeURIComponent(req.url.slice("/img/".length).split("?")[0]);
        const file = path.join(dir, path.basename(name));
        if (!file.startsWith(dir) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(dir)) return;
      const out = path.resolve("dist/img");
      fs.mkdirSync(out, { recursive: true });
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".jpg") && !f.endsWith(".jpeg") && !f.endsWith(".png")) continue;
        fs.copyFileSync(path.join(dir, f), path.join(out, f));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const groqKey = (env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || env.Gork_API_KEY || "").trim();
  const groqModel = (env.VITE_GROQ_MODEL || env.GROQ_MODEL || "llama-3.3-70b-versatile").trim();
  const useLlmNudges = String(env.VITE_USE_LLM_NUDGES || env.USE_LLM_NUDGES || "false").toLowerCase() === "true";
  const useLlmDeck = String(env.VITE_USE_LLM_DECK || env.USE_LLM_DECK || "false").toLowerCase() === "true";

  return {
    plugins: [react(), serveImgDir()],
    assetsInclude: ["**/*.md"],
    define: {
      "import.meta.env.VITE_GROQ_API_KEY": JSON.stringify(groqKey),
      "import.meta.env.VITE_GROQ_MODEL": JSON.stringify(groqModel),
      "import.meta.env.VITE_USE_LLM_NUDGES": JSON.stringify(useLlmNudges ? "true" : "false"),
      "import.meta.env.VITE_USE_LLM_DECK": JSON.stringify(useLlmDeck ? "true" : "false"),
    },
    // Primary UI: legacy/order.html (engine-backed). React demo at /app.html.
    server: {
      open: "/legacy/order.html",
      watch: {
        ignored: [
          "**/images/**",
          "**/img/**",
          "**/public/images/**",
          "**/*.jpg",
          "**/*.jpeg",
          "**/*.png",
          "**/*.webp",
        ],
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          order: path.resolve(__dirname, "legacy/order.html"),
          home: path.resolve(__dirname, "legacy/index.html"),
          app: path.resolve(__dirname, "app.html"),
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.js"],
    },
  };
});


