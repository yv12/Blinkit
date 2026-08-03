/**
 * Runtime LLM client (Groq-compatible chat API).
 * Timeout >5s or any failure → caller serves frozen fallback.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function getRuntimeLlmConfig() {
  const key =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      (import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GORK_API_KEY)) ||
    "";
  const model =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      (import.meta.env.VITE_GROQ_MODEL || import.meta.env.VITE_GROK_MODEL)) ||
    "llama-3.3-70b-versatile";
  const forceFallback =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    String(import.meta.env.VITE_FORCE_LLM_FALLBACK || "") === "1";
  // Live deck LLM is opt-in — key alone must not hit Groq on every page load (breaks MVP).
  const useLlmDeck =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    String(import.meta.env.VITE_USE_LLM_DECK || "").toLowerCase() === "true";
  return {
    apiKey: String(key || "").trim(),
    model: String(model || "llama-3.3-70b-versatile").trim(),
    forceFallback,
    enabled: !!String(key || "").trim() && !forceFallback && useLlmDeck,
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
 * @returns {Promise<{ ok: true, data: any, ms: number } | { ok: false, reason: string, ms: number }>}
 */
export async function llmChatJson({
  system,
  user,
  model,
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  temperature = 0.3,
} = {}) {
  const started = Date.now();
  const cfg = getRuntimeLlmConfig();
  const key = apiKey || cfg.apiKey;
  const mdl = model || cfg.model;

  if (cfg.forceFallback) {
    return { ok: false, reason: "force_fallback", ms: Date.now() - started };
  }
  if (!key) {
    return { ok: false, reason: "no_api_key", ms: Date.now() - started };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
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
    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 429 ? "rate_limit" : `http_${res.status}`,
        ms: Date.now() - started,
      };
    }
    let content = "";
    try {
      const parsed = JSON.parse(bodyText);
      content = parsed?.choices?.[0]?.message?.content || "";
    } catch {
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
