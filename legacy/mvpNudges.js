/**
 * MVP nudge delivery — push-style notifications that slide in from the top
 * of the phone (no center modal takeover).
 */

import {
  getEngine,
  snapshot,
  simulatePriceDrop,
  checkFreeDeliveryMatch,
  acceptMatch,
  dismissMatch,
} from "./engineBridge.js";
import { requestNudgePermission } from "./nudges.js";
import { buildNudgeCopy } from "../src/lib/nudgeLlm.js";
import { getPersonaBundle } from "../src/data/loadDemoData.js";

/** Short beat so the swipe lands, then ONE cheeky nudge — not a second “saved” toast. */
const PRICE_DROP_DELAY_MS = 2_500;
const AUTO_HIDE_MS = 7_500;
const pendingTimers = new Map();
let notifHost = null;
let hideTimer = null;
let permissionAsked = false;

function shortName(name = "") {
  const cut = String(name).split(",")[0].trim();
  return cut.length > 40 ? `${cut.slice(0, 38)}…` : cut;
}

function priceDropAmount(match) {
  const oldP = Number(match?.old_price);
  const newP = Number(match?.price);
  if (Number.isFinite(oldP) && Number.isFinite(newP) && oldP > newP) {
    return Math.round(oldP - newP);
  }
  return null;
}

function chipFor(match) {
  if (match?.reason === "price_drop") {
    const drop = priceDropAmount(match);
    return drop != null ? `Price drop ₹${drop}` : "Price drop";
  }
  if (match?.reason === "free_delivery_gap") return "Delivery";
  if (match?.reason === "back_in_stock") return "Stock";
  return "Ping";
}

function copyFor(match) {
  const name = shortName(match.name);
  const price = Math.round(match.price || 0);
  if (match.reason === "price_drop") {
    return {
      title: "Sasta ho gaya 👀",
      body: `${name} ab ₹${price} — save kiya tha na?`,
      cta: "Add to cart",
      chip: chipFor(match),
    };
  }
  if (match.reason === "free_delivery_gap") {
    return {
      title: "Free delivery nearby",
      body: `Add ${name} (₹${price}) — gap band ho jayega.`,
      cta: "Add to cart",
      chip: chipFor(match),
    };
  }
  if (match.reason === "back_in_stock") {
    return {
      title: "Back in stock",
      body: `${name} wapas aa gaya.`,
      cta: "Add to cart",
      chip: chipFor(match),
    };
  }
  return {
    title: "Blinkit",
    body: `${name} · ₹${price}`,
    cta: "Add to cart",
    chip: chipFor(match),
  };
}

function ensureStyles() {
  if (document.getElementById("mvp-nudge-styles")) return;
  const style = document.createElement("style");
  style.id = "mvp-nudge-styles";
  style.textContent = `
    .mvp-toast-host{
      position:absolute;top:0;left:0;right:0;z-index:90;
      pointer-events:none;padding:10px 10px 0;
    }
    .mvp-toast{
      pointer-events:auto;display:flex;align-items:center;gap:10px;
      padding:10px 12px;border-radius:16px;
      background:rgba(20,20,20,.94);color:#fff;
      box-shadow:0 10px 28px rgba(0,0,0,.28);
      border:1px solid rgba(255,255,255,.08);
      transform:translateY(-120%);opacity:0;
      transition:transform .32s cubic-bezier(.2,.8,.2,1),opacity .28s ease;
    }
    .mvp-toast.show{transform:translateY(0);opacity:1}
    .mvp-toast img{
      width:40px;height:40px;border-radius:10px;object-fit:contain;
      background:#fff;flex:0 0 40px;
    }
    .mvp-toast-dot{
      width:36px;height:36px;border-radius:10px;flex:0 0 36px;
      background:#CD130A;display:grid;place-items:center;
      font-size:10px;font-weight:800;letter-spacing:.02em;
    }
    .mvp-toast-txt{min-width:0;flex:1}
    .mvp-toast-app{
      display:flex;align-items:center;gap:6px;margin-bottom:2px;
      font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
      color:rgba(255,255,255,.65);
    }
    .mvp-toast-app b{color:#CD130A;font-weight:800}
    .mvp-toast-txt span{
      display:block;font-size:12px;line-height:1.35;color:rgba(255,255,255,.9);margin-top:1px;
    }
    .mvp-toast-cta{
      flex:0 0 auto;border:none;border-radius:999px;padding:8px 12px;cursor:pointer;
      background:#CD130A;color:#fff;font:inherit;font-size:10px;font-weight:800;
      white-space:nowrap;line-height:1.2;
    }
    .mvp-toast-x{
      position:absolute;top:6px;right:8px;width:22px;height:22px;border:none;
      background:transparent;color:rgba(255,255,255,.55);font-size:16px;cursor:pointer;line-height:1;
    }
    .mvp-toast{position:relative;padding-right:28px}
  `;
  document.head.appendChild(style);
}

function phoneRoot() {
  return document.querySelector(".phone") || document.body;
}

function ensureHost() {
  ensureStyles();
  let host = phoneRoot().querySelector(".mvp-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "mvp-toast-host";
    phoneRoot().appendChild(host);
  }
  return host;
}

/** Top push notification — slides down from the top of the phone. */
export function showTopNotification({
  body,
  cta = "Add to cart",
  imageUrl = "",
  chip = "Blinkit",
  onAccept,
  onDismiss,
  sticky = false,
} = {}) {
  const host = ensureHost();
  hideTopNotification(true);

  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const el = document.createElement("div");
  el.className = "mvp-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="">` : `<div class="mvp-toast-dot">B</div>`}
    <div class="mvp-toast-txt">
      <div class="mvp-toast-app"><b>blinkit</b> · ${esc(chip)}</div>
      <span>${esc(body)}</span>
    </div>
    <button type="button" class="mvp-toast-cta" data-accept>${esc(cta)}</button>
    <button type="button" class="mvp-toast-x" aria-label="Dismiss" data-dismiss>×</button>
  `;

  const close = () => {
    onDismiss?.();
    hideTopNotification();
  };

  el.querySelector("[data-dismiss]").onclick = (e) => {
    e.stopPropagation();
    close();
  };
  el.querySelector("[data-accept]").onclick = (e) => {
    e.stopPropagation();
    onAccept?.();
    hideTopNotification();
  };
  el.onclick = () => {
    onAccept?.();
    hideTopNotification();
  };

  host.appendChild(el);
  notifHost = el;
  requestAnimationFrame(() => el.classList.add("show"));

  if (!sticky) {
    hideTimer = setTimeout(() => hideTopNotification(), AUTO_HIDE_MS);
  }
  return el;
}

export function hideTopNotification(instant = false) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  const el = notifHost;
  notifHost = null;
  if (!el) return;
  if (instant) {
    el.remove();
    return;
  }
  el.classList.remove("show");
  setTimeout(() => el.remove(), 280);
}

/** Match → top notification with Groq copy from nudge_prompt.md */
export async function showMatchTakeover(match) {
  if (!match) return;
  const snap = snapshot();
  const bundle = getPersonaBundle(snap?.personaId || "yash");
  const history = bundle.persona?.order_history || [];
  const gap = match.reason === "free_delivery_gap" ? checkFreeDeliveryMatch() : null;

  // Filmy + late_night → spiciest tier per nudge_prompt.md (morning forces cute).
  let copy;
  try {
    copy = await buildNudgeCopy(match, {
      personaName: bundle.persona?.name,
      timeWindow: "late_night",
      resolvedGoal: snap?.state?.resolved_goal,
      needs: bundle.persona?.needs,
      goals: bundle.persona?.goals,
      orderHistory: history,
      bridgeItem: history[0]?.name || "",
      ladderLevel: match.level || "L2",
      toneSetting: "filmy",
      feeGapRemaining: gap?.remaining,
    });
  } catch (err) {
    console.warn("[mvpNudges] buildNudgeCopy failed", err);
    copy = copyFor(match);
  }

  // Single in-app toast only — no follow-up “added” toast, no OS push duplicate.
  // Title from copy is unused in the toast chrome; chip carries price-drop ₹ amount.
  showTopNotification({
    body: copy.body,
    cta: "Add to cart",
    chip: chipFor(match),
    imageUrl: match.image_url || "",
    sticky: true,
    onAccept: () => {
      acceptMatch();
      hideTopNotification();
    },
    onDismiss: () => dismissMatch(),
  });
}

export function hideMatchTakeover() {
  hideTopNotification(true);
}

async function maybeAskPermission() {
  if (permissionAsked) return;
  permissionAsked = true;
  try {
    await requestNudgePermission();
  } catch {
    /* ignore */
  }
}

/** Call after each swipe from the legacy deck. */
export async function onMvpSwipe(kind, swipeResult) {
  const eng = getEngine();
  if (!eng) return;
  const card = swipeResult?.result?.card;
  const productId = card?.product_id;

  if (kind === "save" && productId) {
    await maybeAskPermission();
    // ONE notification only: cheeky LLM price-drop (no “saved” toast, no OS push).
    if (pendingTimers.has(productId)) clearTimeout(pendingTimers.get(productId));
    const timer = setTimeout(async () => {
      pendingTimers.delete(productId);
      const res = simulatePriceDrop(productId);
      const match = res?.match || eng.getState()?.pending_match;
      if (!match) return;
      await showMatchTakeover(match);
    }, PRICE_DROP_DELAY_MS);
    pendingTimers.set(productId, timer);
    return;
  }

  if (kind === "add") {
    await maybeAskPermission();
    const gap = checkFreeDeliveryMatch();
    // ONE notification: free-delivery match when in range — nothing else.
    if (gap?.match) {
      await showMatchTakeover(gap.match);
    }
  }
}

export function resetMvpNudges() {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
  hideTopNotification(true);
}
