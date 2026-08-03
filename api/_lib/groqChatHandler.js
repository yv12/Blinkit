/**
 * Shared Groq proxy helpers (Vite dev middleware + Vercel serverless).
 * GROQ_API_KEY never leaves the server.
 */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const PROXY_SECRET_HEADER = "x-groq-proxy-secret";

/**
 * Soft-fail payload when Groq is unavailable.
 * Frontend can render `fallback` instead of treating the call as a hard error.
 * PLACEHOLDER_* strings — replace with final copy when ready.
 *
 * Shape:
 * {
 *   ok: false,
 *   reason: "no_api_key" | "rate_limit" | "timeout" | "upstream_error" | "invalid_json" | "bad_response",
 *   fallback: {
 *     notification_title: string,
 *     notification_body: string,
 *     cta_label: string
 *   }
 * }
 */
export function groqFallbackPayload(reason) {
  return {
    ok: false,
    reason: String(reason || "upstream_error"),
    fallback: {
      notification_title: "PLACEHOLDER_TITLE",
      notification_body: "PLACEHOLDER_BODY",
      cta_label: "PLACEHOLDER_CTA",
    },
  };
}

export function readProxyEnv(env = process.env) {
  return {
    groqKey: String(env.GROQ_API_KEY || env.Gork_API_KEY || "").trim(),
    groqModel: String(env.GROQ_MODEL || "llama-3.3-70b-versatile").trim(),
    proxySecret: String(env.GROQ_PROXY_SECRET || "").trim(),
  };
}

/** @returns {{ ok: true } | { ok: false, status: number, body: object }} */
export function assertProxySecret(reqHeaders, expectedSecret) {
  if (!expectedSecret) {
    // Misconfigured server — soft-fail rather than open proxy.
    return { ok: false, status: 200, body: groqFallbackPayload("no_proxy_secret") };
  }
  const got = String(
    reqHeaders[PROXY_SECRET_HEADER] ||
      reqHeaders[PROXY_SECRET_HEADER.toUpperCase()] ||
      ""
  ).trim();
  if (got !== expectedSecret) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, reason: "unauthorized" },
    };
  }
  return { ok: true };
}

/**
 * Forward chat completion to Groq.
 * @returns {Promise<{ status: number, body: object|string, contentType?: string }>}
 */
export async function forwardGroqChat({
  groqKey,
  defaultModel,
  payload,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  if (!groqKey) {
    return { status: 200, body: groqFallbackPayload("no_api_key") };
  }

  let messages = payload?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 200, body: groqFallbackPayload("invalid_json") };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetchImpl(GROQ_CHAT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: payload.model || defaultModel,
        temperature: payload.temperature ?? 0.3,
        messages,
      }),
    });

    const bodyText = await upstream.text();

    if (upstream.status === 429) {
      return { status: 200, body: groqFallbackPayload("rate_limit") };
    }
    if (!upstream.ok) {
      return { status: 200, body: groqFallbackPayload("upstream_error") };
    }

    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return { status: 200, body: groqFallbackPayload("bad_response") };
    }

    const content = parsed?.choices?.[0]?.message?.content;
    if (!content) {
      return { status: 200, body: groqFallbackPayload("bad_response") };
    }

    return {
      status: 200,
      body: {
        ok: true,
        source: "groq",
        choices: parsed.choices,
        model: parsed.model,
        usage: parsed.usage,
      },
    };
  } catch (err) {
    const reason = err?.name === "AbortError" ? "timeout" : "upstream_error";
    return { status: 200, body: groqFallbackPayload(reason) };
  } finally {
    clearTimeout(timer);
  }
}
