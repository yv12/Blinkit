/**
 * Swipe UI bound to the real recommendation engine (via engineBridge).
 * Continuous swipes with soft hand extension; card thumbs + preload for speed.
 */

import {
  initEngine,
  swipe as engineSwipe,
  snapshot,
  onEngineChange,
  extendHand,
  nextHandFromSwipes,
  peekUpcomingImages,
  SWIPE_SESSION_CAP,
} from "./engineBridge.js";
import { onMvpSwipe } from "./mvpNudges.js";

const LIGHTS_SVG = `
<svg class="lights" viewBox="0 0 280 26" aria-hidden="true">
  <path d="M0 3 Q46 17 92 6 Q138 17 184 6 Q230 17 280 3" fill="none" stroke="#A95C68" stroke-width="1"/>
  <g fill="#FBE7A8" opacity=".35"><circle cx="24" cy="11" r="6"/><circle cx="68" cy="13" r="6"/><circle cx="115" cy="12" r="6"/><circle cx="161" cy="12" r="6"/><circle cx="208" cy="13" r="6"/><circle cx="254" cy="10" r="6"/></g>
  <g fill="#F2C94C"><circle cx="24" cy="11" r="3"/><circle cx="68" cy="13" r="3"/><circle cx="115" cy="12" r="3"/><circle cx="161" cy="12" r="3"/><circle cx="208" cy="13" r="3"/><circle cx="254" cy="10" r="3"/></g>
</svg>`;

const ROSE_L = `
<svg class="rose-stem l" viewBox="0 0 26 190" aria-hidden="true">
  <path d="M13 190 Q7 140 13 92 Q19 52 13 26" fill="none" stroke="#6B8F3A" stroke-width="1.2"/>
  <path d="M13 118 Q3 114 5 105 Q13 107 13 118Z" fill="#6B8F3A"/>
  <circle cx="13" cy="20" r="8" fill="#DE3163"/><circle cx="13" cy="20" r="4.5" fill="#750000"/>
</svg>`;

const ROSE_R = `
<svg class="rose-stem r" viewBox="0 0 26 190" aria-hidden="true">
  <path d="M13 190 Q19 140 13 92 Q7 52 13 26" fill="none" stroke="#6B8F3A" stroke-width="1.2"/>
  <path d="M13 118 Q23 114 21 105 Q13 107 13 118Z" fill="#6B8F3A"/>
  <circle cx="13" cy="20" r="8" fill="#DE3163"/><circle cx="13" cy="20" r="4.5" fill="#750000"/>
</svg>`;

const CANDLE = `
<svg class="candle" viewBox="0 0 20 46" aria-hidden="true">
  <circle cx="10" cy="7" r="7" fill="#FBE7A8" opacity=".4"/><ellipse cx="10" cy="7" rx="2.4" ry="5" fill="#F2C94C"/>
  <rect x="7" y="13" width="6" height="25" rx="2" fill="#FFF0F0" stroke="#A95C68" stroke-width=".6"/>
  <path d="M3 38h14l-2 6H5z" fill="#A95C68"/>
</svg>`;

const preloaded = new Set();

function preloadImages(urls = []) {
  for (const u of urls) {
    if (!u || preloaded.has(u)) continue;
    preloaded.add(u);
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  }
}

function ensureSwipeCoachStyles() {
  if (document.getElementById("swipe-coach-styles")) return;
  const style = document.createElement("style");
  style.id = "swipe-coach-styles";
  style.textContent = `
    .crush:has([data-stack][data-demo="1"]){overflow:visible}
    .stack[data-demo="1"]{overflow:visible;z-index:2}
    .stack[data-demo="1"] .back1{transition:transform .35s ease;transform:scale(.98) translateY(2px)}
    .stack[data-demo="1"] .back2{transition:transform .35s ease;transform:scale(.96) translateY(4px)}
    .card{overflow:hidden;will-change:transform}
    .card .swipe-stamp{
      position:absolute;z-index:3;padding:5px 9px;border-radius:8px;
      font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;
      border:2.5px solid currentColor;opacity:0;pointer-events:none;
      transition:opacity .14s ease;
      background:rgba(0,0,0,.28);
    }
    .card .swipe-stamp.skip{top:14px;left:12px;color:#fff;transform:rotate(-14deg)}
    .card .swipe-stamp.later{top:14px;right:12px;color:#F2C94C;transform:rotate(14deg)}
    .card .swipe-stamp.want{top:12px;left:50%;transform:translateX(-50%);color:#7CFFB2}
    .card[data-hint="left"] .swipe-stamp.skip,
    .card[data-hint="right"] .swipe-stamp.later,
    .card[data-hint="up"] .swipe-stamp.want{opacity:1}
    .card.swipe-demo-live{
      transition:transform .4s cubic-bezier(.2,.8,.2,1) !important;
    }
    @media (prefers-reduced-motion:reduce){
      .card.swipe-demo-live{transition:none !important}
    }
  `;
  document.head.appendChild(style);
}

/**
 * @param {HTMLElement} root
 * @param {{ personaId?: string, mode?: string, title?: string, onAfterAction?: Function }} opts
 */
export async function mountEngineSwipe(root, opts = {}) {
  const {
    personaId = "yash",
    mode = "cart",
    title = "What should we try?",
    onAfterAction,
  } = opts;

  const addAria = mode === "order" ? "Add to this order" : "Want it now";
  const addLbl = mode === "order" ? "Add to order" : "Want it now";

  ensureSwipeCoachStyles();

  root.setAttribute("aria-label", "Product discovery cards — swipe left skip, right later, up add");
  root.innerHTML = `
    ${LIGHTS_SVG}
    <div class="crush-in">
      <div class="crush-head">
        <h2>${title}</h2>
      </div>
      <div class="stack" data-stack>
        ${ROSE_L}${ROSE_R}
        <div class="back2"></div>
        <div class="back1"></div>
        <article class="card" data-card tabindex="0" aria-live="polite"
          aria-roledescription="swipeable product card"
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp">
          <div class="swipe-stamp skip">Skip</div>
          <div class="swipe-stamp later">Later</div>
          <div class="swipe-stamp want">Want</div>
          <div class="card-main">
            <img class="pimg" data-pimg alt="" width="112" height="140" decoding="async" fetchpriority="high" data-fallback="">
            <div class="card-copy">
              <h3 class="pname" data-pname></h3>
              <p class="bio" data-bio></p>
              <div class="prices"><span class="price" data-price></span><span class="mrp" data-mrp></span></div>
            </div>
          </div>
        </article>
      </div>
      <div class="actions" data-actions>
        ${CANDLE}
        <div class="act">
          <button class="btn-skip" data-skip aria-label="Not interested">
            <svg viewBox="0 0 24 24" fill="none" stroke="#CD130A" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button><div class="lbl">Skip</div>
        </div>
        <div class="act">
          <button class="btn-save" data-add aria-label="${addAria}">
            <svg viewBox="0 0 24 24" fill="#FFFFFF"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>
          </button><div class="lbl">${addLbl}</div>
        </div>
        <div class="act">
          <button class="btn-add" data-save aria-label="Save for later">
            <svg viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 21s-8-5.2-8-10.4A4.6 4.6 0 0112 7a4.6 4.6 0 018 3.6C20 15.8 12 21 12 21z"/></svg>
          </button><div class="lbl">Later</div>
        </div>
        ${CANDLE}
      </div>
      <div class="toast" data-toast role="status"></div>
    </div>`;

  const toast = root.querySelector("[data-toast]");
  const stack = root.querySelector("[data-stack]");
  const actions = root.querySelector("[data-actions]");
  const stackPlayHtml = stack.innerHTML;
  let card = root.querySelector("[data-card]");
  let played = 0;
  let animBusy = false;
  let extending = false;
  let coachTimers = [];
  /** Keeps looping until any swipe / button / drag. */
  let coachActive = true;

  await initEngine(personaId, "morning");
  preloadImages(peekUpcomingImages(5));

  function setDragHint(dx, dy) {
    if (!card) return;
    if (dy < -40 && Math.abs(dy) > Math.abs(dx)) card.dataset.hint = "up";
    else if (dx > 40) card.dataset.hint = "right";
    else if (dx < -40) card.dataset.hint = "left";
    else delete card.dataset.hint;
  }

  function clearCoachTimers() {
    for (const t of coachTimers) clearTimeout(t);
    coachTimers = [];
  }

  function poseCard(x, y, rot, hint) {
    card = root.querySelector("[data-card]") || card;
    if (!card || !coachActive || animBusy) return;
    card.classList.add("swipe-demo-live");
    card.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`;
    if (hint) card.dataset.hint = hint;
    else delete card.dataset.hint;
  }

  function endCoach() {
    if (!coachActive && coachTimers.length === 0) return;
    coachActive = false;
    clearCoachTimers();
    if (stack) stack.dataset.demo = "0";
    card = root.querySelector("[data-card]") || card;
    if (card) {
      card.classList.remove("swipe-demo-live");
      card.style.transform = "";
      delete card.dataset.hint;
    }
  }

  /** Card-only coach: left / right / up — loops until the customer swipes. */
  function playSwipeDemo() {
    card = root.querySelector("[data-card]") || card;
    if (!coachActive || !card || animBusy || extending) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      // Still show stamps briefly without motion, then keep soft pulsing via loop of stamps only
    }
    clearCoachTimers();
    if (stack) stack.dataset.demo = "1";

    const beat = (ms, fn) => {
      const id = setTimeout(() => {
        if (!coachActive) return;
        fn();
      }, ms);
      coachTimers.push(id);
    };

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (reduce) {
      // Stamp-only loop when motion is reduced
      poseCard(0, 0, 0, "left");
      beat(700, () => poseCard(0, 0, 0, "right"));
      beat(1400, () => poseCard(0, 0, 0, "up"));
      beat(2100, () => poseCard(0, 0, 0, null));
      beat(2500, () => {
        if (coachActive) playSwipeDemo();
      });
      return;
    }

    // Skip ← → Later → Want ↑ — repeat forever until interaction
    poseCard(0, 0, 0, null);
    beat(280, () => poseCard(-52, 10, -11, "left"));
    beat(900, () => poseCard(0, 0, 0, null));
    beat(1180, () => poseCard(52, 10, 11, "right"));
    beat(1800, () => poseCard(0, 0, 0, null));
    beat(2080, () => poseCard(0, -44, 0, "up"));
    beat(2680, () => poseCard(0, 0, 0, null));
    beat(3100, () => {
      if (coachActive && !animBusy) playSwipeDemo();
    });
  }

  function swipeThresholds() {
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 700;
    return {
      x: Math.max(64, w * 0.22),
      y: Math.max(72, h * 0.12),
    };
  }

  function setScrollLock(on) {
    const scroller = root.closest(".scroll") || document.querySelector(".scroll");
    if (!scroller) return;
    scroller.classList.toggle("swipe-dragging", !!on);
  }

  function resolveSwipe(dx, dy) {
    const { x: thrX, y: thrY } = swipeThresholds();
    if (dy < -thrY && Math.abs(dy) >= Math.abs(dx)) return act("add", "up");
    if (dx > thrX) return act("save", "right");
    if (dx < -thrX) return act("skip", "left");
    if (card) card.style.transform = "";
  }

  let cardTouchAbort = null;

  function bindCardChrome() {
    card = root.querySelector("[data-card]");
    if (!card) return;

    cardTouchAbort?.abort();
    cardTouchAbort = new AbortController();
    const { signal } = cardTouchAbort;

    card.addEventListener(
      "touchstart",
      (e) => {
        endCoach();
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        dragging = true;
        setScrollLock(true);
        card.style.transition = "none";
      },
      { passive: true, signal },
    );
    // passive:false so preventDefault can block native scroll / pull-to-refresh
    card.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
        setDragHint(dx, dy);
      },
      { passive: false, signal },
    );
    card.addEventListener(
      "touchend",
      (e) => {
        if (!dragging) return;
        dragging = false;
        setScrollLock(false);
        card.style.transition = "";
        delete card.dataset.hint;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        resolveSwipe(dx, dy);
      },
      { signal },
    );
    card.addEventListener(
      "touchcancel",
      () => {
        dragging = false;
        setScrollLock(false);
        if (card) {
          card.style.transition = "";
          card.style.transform = "";
          delete card.dataset.hint;
        }
      },
      { signal },
    );
    // Desktop drag (mouse) — same affordance as touch
    card.addEventListener(
      "mousedown",
      (e) => {
        if (e.button !== 0) return;
        endCoach();
        sx = e.clientX;
        sy = e.clientY;
        dragging = true;
        card.style.transition = "none";
        e.preventDefault();
      },
      { signal },
    );
    card.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "ArrowLeft") act("skip", "left");
        if (e.key === "ArrowRight") act("save", "right");
        if (e.key === "ArrowUp") act("add", "up");
      },
      { signal },
    );
  }

  // Window mouse listeners once
  window.addEventListener("mousemove", (e) => {
    if (!dragging || !card) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    setDragHint(dx, dy);
  });
  window.addEventListener("mouseup", (e) => {
    if (!dragging || !card) return;
    dragging = false;
    card.style.transition = "";
    delete card.dataset.hint;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    resolveSwipe(dx, dy);
  });

  function render() {
    const snap = snapshot();
    if (!snap) return;
    const c = snap.current;

    if (!c) {
      maybeExtendOrFinish();
      return;
    }
    const img = root.querySelector("[data-pimg]");
    const full = c.image_full || c.image || c.image_url || "";
    img.onerror = null;
    img.dataset.fallback = "";
    if (full && img.getAttribute("src") !== full) {
      img.src = full;
    }
    img.alt = c.name;
    img.decoding = "async";
    img.fetchPriority = "high";
    root.querySelector("[data-pname]").textContent = c.name;
    // Tinder tagline — never fall back to the long shopping "bridge"
    root.querySelector("[data-bio]").textContent = c.bio || "New aisle, who dis?";
    root.querySelector("[data-price]").textContent = "Rs " + Math.round(c.price);
    root.querySelector("[data-mrp]").textContent = "Rs " + (c.mrp || Math.round(c.price * 1.2));
    preloadImages(peekUpcomingImages(5));
  }

  function say(msg) {
    toast.textContent = msg;
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 1600);
  }

  function showMatchClose() {
    actions.style.display = "none";
    stack.innerHTML = `
      <div class="done match-close">
        <p class="match-close-line">Did you find the product you lust about?</p>
        <small>Your lefts &amp; rights already taught the brain. Tap below for the next hand.</small>
        <button type="button" class="match-close-cta" data-next-hand>
          Keep swiping — smarter picks
        </button>
      </div>`;
    stack.querySelector("[data-next-hand]")?.addEventListener("click", async () => {
      const btn = stack.querySelector("[data-next-hand]");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Reading your swipes…";
      }
      extending = true;
      try {
        await nextHandFromSwipes();
        const snap = snapshot();
        if (!snap?.current) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Try again";
          }
          return;
        }
        stack.innerHTML = stackPlayHtml;
        bindCardChrome();
        actions.style.display = "";
        preloadImages(peekUpcomingImages(5));
        render();
      } finally {
        extending = false;
      }
    });
  }

  function finish(_msg) {
    showMatchClose();
  }

  async function maybeExtendOrFinish() {
    if (extending) return;
    if (played >= SWIPE_SESSION_CAP) {
      showMatchClose();
      return;
    }
    extending = true;
    try {
      // Prefer LLM-informed rebuild once the first hand is done
      await extendHand({ forceLlm: played >= 3 });
      const snap = snapshot();
      if (!snap?.current) {
        showMatchClose();
        return;
      }
      preloadImages(peekUpcomingImages(5));
      render();
    } finally {
      extending = false;
    }
  }

  function act(kind, dir) {
    if (animBusy || extending || !snapshot()?.current) return;
    endCoach();
    animBusy = true;
    const result = engineSwipe(kind);
    say(result.toast || "");
    played += 1;

    const tx =
      dir === "left"
        ? "translateX(-130%) rotate(-9deg)"
        : dir === "right"
          ? "translateX(130%) rotate(9deg)"
          : "translateY(-130%)";
    card.style.transform = tx;
    card.style.opacity = "0";

    setTimeout(async () => {
      try {
        await onMvpSwipe(kind, result);
      } catch (err) {
        console.warn("[mvpNudges]", err);
      }
      onAfterAction?.(result, kind);
      if (played >= SWIPE_SESSION_CAP) {
        finish("Session limit reached — brain needs a breather.");
        animBusy = false;
        return;
      }
      const snap = snapshot();
      if (result.finished || !snap?.current || (snap.deck?.remaining ?? 0) <= 0) {
        await maybeExtendOrFinish();
      } else {
        render();
      }
      card.style.transition = "none";
      card.style.transform = "";
      card.style.opacity = "0";
      requestAnimationFrame(() => {
        card.style.transition = "";
        card.style.opacity = "1";
        animBusy = false;
      });
    }, 220);
  }

  root.querySelector("[data-skip]").onclick = () => act("skip", "left");
  root.querySelector("[data-add]").onclick = () => act("add", "up");
  root.querySelector("[data-save]").onclick = () => act("save", "right");

  let sx = 0;
  let sy = 0;
  let dragging = false;
  bindCardChrome();

  onEngineChange(() => {
    if (!animBusy && !extending) render();
  });
  render();
  // First paint: teach that this is a swipe deck, not a static Blinkit banner
  requestAnimationFrame(() => {
    setTimeout(playSwipeDemo, 280);
  });
  return { render, act, finish };
}
