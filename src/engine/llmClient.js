/**
 * Runtime LLM client via same-origin /api/groq/chat (Vite middleware or Vercel function).
 * GROQ_API_KEY stays on the server. Soft failures return `fallback` for UI copy.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const GROQ_PROXY_URL = "/api/groq/chat";
/** Must match lib/groqChatHandler.js PROXY_SECRET_HEADER */
const PROXY_SECRET_HEADER = "x-groq-proxy-secret";

export function getRuntimeLlmConfig() {
  const model =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      (import.meta.env.VITE_GROQ_MODEL || import.meta.env.VITE_GROK_MODEL)) ||
    "llama-3.3-70b-versatile";
  const forceFallback =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    String(import.meta.env.VITE_FORCE_LLM_FALLBACK || "") === "1";
  const useLlmDeck =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    String(import.meta.env.VITE_USE_LLM_DECK || "").toLowerCase() === "true";
  const proxySecret =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_GROQ_PROXY_SECRET) ||
    "";
  return {
    /** @deprecated Key never available in browser; server proxy holds it. */
    apiKey: "",
    model: String(model || "llama-3.3-70b-versatile").trim(),
    proxySecret: String(proxySecret || "").trim(),
    forceFallback,
    enabled: !forceFallback && useLlmDeck,
  };
}

export function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* continue */
  }
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON in LLM response");
  const blob = match[0].replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(blob);
}

/**
 * @returns {Promise<{ ok: true, data: any, ms: number } | { ok: false, reason: string, fallback?: object, ms: number }>}
 */
export async function llmChatJson({
  system,
  user,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  temperature = 0.3,
} = {}) {
  const started = Date.now();
  const cfg = getRuntimeLlmConfig();
  const mdl = model || cfg.model;

  if (cfg.forceFallback) {
    return { ok: false, reason: "force_fallback", ms: Date.now() - started };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (cfg.proxySecret) {
      headers[PROXY_SECRET_HEADER] = cfg.proxySecret;
    }

    const res = await fetch(GROQ_PROXY_URL, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: mdl,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const bodyText = await res.text();
    let parsed = null;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }

    if (res.status === 401) {
      return { ok: false, reason: "unauthorized", ms: Date.now() - started };
    }

    // Soft-fail envelope from our proxy (always prefer this over hard HTTP errors).
    if (parsed && parsed.ok === false) {
      return {
        ok: false,
        reason: parsed.reason || `http_${res.status}`,
        fallback: parsed.fallback || null,
        ms: Date.now() - started,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 429 ? "rate_limit" : `http_${res.status}`,
        fallback: parsed?.fallback || null,
        ms: Date.now() - started,
      };
    }

    let content = "";
    if (parsed?.choices?.[0]?.message?.content) {
      content = parsed.choices[0].message.content;
    } else if (typeof parsed?.content === "string") {
      content = parsed.content;
    } else {
      content = bodyText;
    }

    try {
      const data = extractJson(content);
      return { ok: true, data, raw: content, ms: Date.now() - started };
    } catch (parseErr) {
      return {
        ok: false,
        reason: parseErr?.message || "json_parse_error",
        raw: content,
        fallback: parsed?.fallback || null,
        ms: Date.now() - started,
      };
    }
  } catch (err) {
    const reason =
      err?.name === "AbortError" ? "timeout" : err?.message || "network_error";
    return { ok: false, reason, raw: "", ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
