/**
 * Vercel serverless: POST /api/groq/chat
 * Secrets: GROQ_API_KEY, GROQ_MODEL, GROQ_PROXY_SECRET (server-only).
 */

import {
  assertProxySecret,
  forwardGroqChat,
  groqFallbackPayload,
  readProxyEnv,
} from "../_lib/groqChatHandler.js";

function headerMap(req) {
  const headers = req.headers || {};
  const lower = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  return lower;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, reason: "method_not_allowed" });
    return;
  }

  try {
    const { groqKey, groqModel, proxySecret } = readProxyEnv(process.env);
    const headers = headerMap(req);
    const auth = assertProxySecret(headers, proxySecret);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    let payload = req.body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        res.status(200).json(groqFallbackPayload("invalid_json"));
        return;
      }
    }
    if (!payload || typeof payload !== "object") {
      res.status(200).json(groqFallbackPayload("invalid_json"));
      return;
    }

    const result = await forwardGroqChat({
      groqKey,
      defaultModel: groqModel,
      payload,
    });

    res.status(result.status).json(result.body);
  } catch {
    res.status(200).json(groqFallbackPayload("upstream_error"));
  }
}
