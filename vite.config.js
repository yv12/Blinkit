import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProxySecret,
  forwardGroqChat,
  groqFallbackPayload,
  readProxyEnv,
} from "./api/_lib/groqChatHandler.js";

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

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Local parity with Vercel /api/groq/chat */
function groqProxyPlugin(env) {
  const { groqKey, groqModel, proxySecret } = readProxyEnv(env);

  async function handleGroqChat(req, res, next) {
    const url = req.url?.split("?")[0] || "";
    if (url !== "/api/groq/chat") return next();

    const sendJson = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== "POST") {
      sendJson(405, { ok: false, reason: "method_not_allowed" });
      return;
    }

    try {
      const headers = {};
      for (const [k, v] of Object.entries(req.headers || {})) {
        headers[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
      }
      const auth = assertProxySecret(headers, proxySecret);
      if (!auth.ok) {
        sendJson(auth.status, auth.body);
        return;
      }

      const raw = await readRequestBody(req);
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(200, groqFallbackPayload("invalid_json"));
        return;
      }

      const result = await forwardGroqChat({
        groqKey,
        defaultModel: groqModel,
        payload,
      });
      sendJson(result.status, result.body);
    } catch {
      sendJson(200, groqFallbackPayload("upstream_error"));
    }
  }

  return {
    name: "groq-proxy",
    configureServer(server) {
      server.middlewares.use(handleGroqChat);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleGroqChat);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const { groqModel, proxySecret } = readProxyEnv(env);
  const useLlmNudges =
    String(env.VITE_USE_LLM_NUDGES || env.USE_LLM_NUDGES || "false").toLowerCase() === "true";
  const useLlmDeck =
    String(env.VITE_USE_LLM_DECK || env.USE_LLM_DECK || "false").toLowerCase() === "true";

  return {
    plugins: [react(), serveImgDir(), groqProxyPlugin(env)],
    assetsInclude: ["**/*.md"],
    define: {
      // Never inject GROQ_API_KEY. Proxy secret is a light abuse guard (visible in bundle).
      "import.meta.env.VITE_GROQ_MODEL": JSON.stringify(groqModel),
      "import.meta.env.VITE_GROQ_PROXY_SECRET": JSON.stringify(proxySecret),
      "import.meta.env.VITE_USE_LLM_NUDGES": JSON.stringify(useLlmNudges ? "true" : "false"),
      "import.meta.env.VITE_USE_LLM_DECK": JSON.stringify(useLlmDeck ? "true" : "false"),
    },
    server: {
      host: true,
      open: "/legacy/index.html",
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
