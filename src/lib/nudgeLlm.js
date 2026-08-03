/**
 * Nudge copy: static lookup from /nudges.json by default.
 * LLM path kept behind USE_LLM_NUDGES (VITE_USE_LLM_NUDGES=true to enable).
 */

import { llmChatJson } from "../engine/llmClient.js";
import { matchSubhead, nudgeBannerCopy } from "./matchCopy.js";
import nudgePromptUrl from "../../Docs/nudge_prompt.md?url";
import nudgesTable from "../../nudges.json";

/** Flip via .env: VITE_USE_LLM_NUDGES=true */
export const USE_LLM_NUDGES =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  String(import.meta.env.VITE_USE_LLM_NUDGES || "").toLowerCase() === "true";

const BANNED = [
  /sex/i,
  /sexy/i,
  /nude/i,
  /hot\s*night/i,
  /bedroom/i,
  /horny/i,
  /thirst/i,
  /booty/i,
  /make\s*out/i,
  /kiss\s*me/i,
];

let cachedSystemPrompt = null;

/** Load ENTIRE nudge_prompt.md at runtime — never paraphrase. */
export async function loadNudgeSystemPrompt() {
  if (cachedSystemPrompt != null) return cachedSystemPrompt;
  const res = await fetch(nudgePromptUrl);
  if (!res.ok) {
    throw new Error(`Failed to load nudge_prompt.md (${res.status})`);
  }
  cachedSystemPrompt = await res.text();
  return cachedSystemPrompt;
}

function wordCount(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function hasBannedWords(text) {
  const t = String(text || "");
  return BANNED.some((re) => re.test(t));
}

/** Kept for tests / defaults only — never applied to successful LLM / static copy. */
export function validateNudgeCopy(copy) {
  if (!copy || typeof copy !== "object") return { ok: false, reason: "no_json" };
  const title = String(copy.title || copy.notification_title || "").trim();
  const body = String(copy.body || copy.notification_body || "").trim();
  if (!title || !body) return { ok: false, reason: "empty" };
  if (wordCount(title) > 6) return { ok: false, reason: "title_long" };
  if (wordCount(body) > 15) return { ok: false, reason: "body_long" };
  if (hasBannedWords(`${title} ${body}`)) return { ok: false, reason: "banned" };
  return { ok: true, title, body };
}

export function defaultNudgeCopy(match) {
  const title = matchSubhead(match?.reason).split(" ").slice(0, 6).join(" ") || "Blinkit bol raha";
  let body = nudgeBannerCopy(match);
  const words = body.split(/\s+/);
  if (words.length > 15) body = words.slice(0, 15).join(" ");
  return { title, body, cta: "Abhi mangao", source: "default" };
}

/**
 * Lookup pre-written copy from nudges.json.
 * Missing id → _default with {product_name} substituted. No rewrite/soften.
 */
export function lookupStaticNudge(match) {
  const id = match?.product_id || match?.id;
  const name = match?.name || "yeh product";
  const entry = (id && nudgesTable[id]) || nudgesTable._default;
  if (!entry) return null;

  const title = String(entry.title || "");
  const body = String(entry.body || "").replaceAll("{product_name}", name);
  const cta = String(entry.cta || "Dekho");

  return {
    title,
    body,
    cta,
    source: id && nudgesTable[id] ? "static" : "static_default",
  };
}

function mapTrigger(reason) {
  switch (reason) {
    case "price_drop":
      return "price_drop";
    case "back_in_stock":
      return "restock";
    case "free_delivery_gap":
      return "fee_gap";
    case "saved_reminder":
      return "saved_reminder";
    case "cross_sell":
      return "cross_sell";
    case "post_delivery":
    case "post_order":
      return "post_order";
    default:
      return "saved_reminder";
  }
}

function mapTimeSlot(timeWindow) {
  if (timeWindow === "morning") return "morning";
  if (timeWindow === "late_night") return "late_night";
  return "day";
}

function productAttributes(match) {
  const attrs = [];
  for (const t of [...(match?.need_tags || []), ...(match?.goal_tags || []), match?.shared_tag].filter(Boolean)) {
    attrs.push(String(t));
  }
  if (match?.bio && attrs.length < 2) attrs.push(String(match.bio).slice(0, 40));
  return [...new Set(attrs)].slice(0, 6);
}

function buildOffer(match, trigger, extras = {}) {
  if (trigger === "price_drop") {
    if (match?.old_price != null && match?.price != null) {
      return `now ₹${Math.round(match.price)} (was ₹${Math.round(match.old_price)})`;
    }
    if (match?.price != null) return `now ₹${Math.round(match.price)}`;
    return "price drop";
  }
  if (trigger === "restock") return "back in stock";
  if (trigger === "fee_gap" && extras.feeGapRemaining != null) {
    return `₹${Math.ceil(extras.feeGapRemaining)} to free delivery`;
  }
  return "";
}

export function buildNudgeUserPayload(match, opts = {}) {
  const trigger = mapTrigger(opts.trigger || match?.reason);
  const history = (opts.basketHistory || opts.orderHistory || [])
    .map((h) => (typeof h === "string" ? h : h?.name))
    .filter(Boolean);

  return {
    product: {
      name: match?.name || "",
      category: match?.category || match?.top_category || "",
      attributes: productAttributes(match),
      price: Number(match?.price) || 0,
      offer: buildOffer(match, trigger, opts),
    },
    customer: {
      persona_tags: opts.personaTags ||
        [
          ...(opts.resolvedGoal ? [opts.resolvedGoal] : []),
          ...(opts.needs || []),
          ...(opts.goals || []),
        ].filter(Boolean),
      basket_history: history.slice(0, 8),
      bridge_item: opts.bridgeItem || history[0] || "",
      ladder_level: match?.level || opts.ladderLevel || "L2",
      tone_setting: opts.toneSetting || "filmy",
    },
    trigger,
    context: {
      time_slot: mapTimeSlot(opts.timeWindow),
      darkstore_stat: opts.darkstoreStat || "",
    },
  };
}

/** LLM path — only when USE_LLM_NUDGES is true. */
async function buildNudgeCopyViaLlm(match, opts = {}) {
  const fallback = defaultNudgeCopy(match);

  let system;
  try {
    system = await loadNudgeSystemPrompt();
  } catch (err) {
    console.error("[nudgeLlm] failed to load nudge_prompt.md", err);
    return fallback;
  }

  const userPayload = buildNudgeUserPayload(match, opts);
  const user = JSON.stringify(userPayload, null, 2);

  console.log("[nudgeLlm] === FULL SYSTEM PROMPT (nudge_prompt.md) ===\n", system);
  console.log("[nudgeLlm] === USER JSON ===\n", user);

  const result = await llmChatJson({
    system,
    user,
    temperature: 0.9,
    timeoutMs: 8000,
  });

  console.log("[nudgeLlm] === RAW LLM RESPONSE ===\n", result.raw ?? result.reason);
  console.log("[nudgeLlm] === PARSED DATA ===\n", result.data);

  if (!result.ok) {
    console.warn("[nudgeLlm] LLM failed, using fallback/default copy:", result.reason);
    const fb = result.fallback;
    if (fb?.notification_title && fb?.notification_body) {
      return {
        title: String(fb.notification_title),
        body: String(fb.notification_body),
        cta: String(fb.cta_label || "Abhi mangao").trim() || "Abhi mangao",
        source: "api_fallback",
      };
    }
    return fallback;
  }

  const title = String(result.data?.notification_title || "").trim();
  const body = String(result.data?.notification_body || "").trim();
  const cta = String(result.data?.cta_label || "").trim() || "Abhi mangao";

  if (!title || !body) {
    console.warn("[nudgeLlm] missing notification_title/body, using default");
    return fallback;
  }

  return {
    title,
    body,
    cta,
    tone_used: result.data?.tone_used || "",
    rejected_reason: result.data?.rejected_reason || "",
    source: "llm",
  };
}

/**
 * Build nudge copy. Default: nudges.json lookup.
 * Set VITE_USE_LLM_NUDGES=true to use Groq + nudge_prompt.md again.
 */
export async function buildNudgeCopy(match, opts = {}) {
  if (USE_LLM_NUDGES) {
    return buildNudgeCopyViaLlm(match, opts);
  }

  const staticCopy = lookupStaticNudge(match);
  if (staticCopy?.title && staticCopy?.body) {
    console.log("[nudgeLlm] static nudges.json", match?.product_id, staticCopy.source);
    return staticCopy;
  }

  return defaultNudgeCopy(match);
}
