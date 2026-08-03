/* ============================================================
   swipe.js — shared swipe block (markup + gestures + keyboard)
   Mount into an existing .crush root that already has the structure
   from index.html (stack / card / actions / toast).
   ============================================================ */

import { DAILY_LIMIT, nextCard, applySwipe, applySwipeOrder } from "./recommend.js";

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

/**
 * @param {HTMLElement} root  .crush element
 * @param {object} opts  state, catalog, onAfterAction, mode: "cart"|"order", title?
 */
export function mountSwipe(root, opts) {
  const {
    state,
    catalog,
    onAfterAction,
    mode = "cart",
    title = "What should we try?"
  } = opts;

  const addAria = mode === "order" ? "Add to this order" : "Want it now";
  const addLbl = mode === "order" ? "Add to order" : "Want it now";

  root.setAttribute("aria-label", "Product discovery cards");
  root.innerHTML = `
    ${LIGHTS_SVG}
    <div class="crush-in">
      <div class="crush-head">
        <h2>${title}</h2>
        <span class="left" data-left></span>
      </div>
      <div class="stack" data-stack>
        ${ROSE_L}${ROSE_R}
        <div class="back2"></div>
        <div class="back1"></div>
        <article class="card" data-card tabindex="0" aria-live="polite">
          <div class="row"><span class="badge">New pick</span><span class="cat" data-cat></span></div>
          <div class="card-main">
            <img class="pimg" data-pimg alt="" width="64" height="64">
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
            <svg viewBox="0 0 24 24" fill="none" stroke="#A95C68" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button><div class="lbl">Skip</div>
        </div>
        <div class="act">
          <button class="btn-save" data-add aria-label="${addAria}">
            <svg viewBox="0 0 24 24" fill="#FF8A8A"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>
          </button><div class="lbl" style="color:var(--maroon)">${addLbl}</div>
        </div>
        <div class="act">
          <button class="btn-add" data-save aria-label="Save for later">
            <svg viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-8-5.2-8-10.4A4.6 4.6 0 0112 7a4.6 4.6 0 018 3.6C20 15.8 12 21 12 21z"/></svg>
          </button><div class="lbl">Later</div>
        </div>
        ${CANDLE}
      </div>
      <div class="toast" data-toast role="status"></div>
    </div>`;

  const card = root.querySelector("[data-card]");
  const toast = root.querySelector("[data-toast]");
  const stack = root.querySelector("[data-stack]");
  const actions = root.querySelector("[data-actions]");
  const apply = mode === "order" ? applySwipeOrder : applySwipe;
  let busy = false;

  function render() {
    const c = state.current;
    if (!c) return;
    const img = root.querySelector("[data-pimg]");
    img.src = c.image || "";
    img.alt = c.name;
    root.querySelector("[data-pname]").textContent = c.name;
    root.querySelector("[data-bio]").textContent = c.bio;
    root.querySelector("[data-cat]").textContent = c.cat;
    root.querySelector("[data-price]").textContent = "Rs " + c.price;
    root.querySelector("[data-mrp]").textContent = "Rs " + c.mrp;
    root.querySelector("[data-left]").textContent =
      Math.max(0, DAILY_LIMIT - state.played) + " left today";
  }

  function say(msg) {
    toast.textContent = msg;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 1600);
  }

  function finish() {
    stack.innerHTML = '<div class="done"><p>That\'s all for today.</p><small>Come back tomorrow.</small></div>';
    actions.style.display = "none";
  }

  function act(kind, dir) {
    if (busy || !state.current) return;
    busy = true;
    const result = apply(state, kind);
    say(result.toast);

    const tx =
      dir === "left" ? "translateX(-130%) rotate(-9deg)" :
      dir === "right" ? "translateX(130%) rotate(9deg)" :
      "translateY(-130%)";
    card.style.transform = tx;
    card.style.opacity = "0";

    setTimeout(() => {
      onAfterAction?.(result, kind);
      if (result.finished) {
        finish();
        busy = false;
        return;
      }
      nextCard(state, catalog);
      render();
      card.style.transition = "none";
      card.style.transform = "";
      card.style.opacity = "0";
      requestAnimationFrame(() => {
        card.style.transition = "";
        card.style.opacity = "1";
        busy = false;
      });
    }, 220);
  }

  root.querySelector("[data-skip]").onclick = () => act("skip", "left");
  /* Middle = Want it now (add); right = Later (save) */
  root.querySelector("[data-add]").onclick = () => act("add", "up");
  root.querySelector("[data-save]").onclick = () => act("save", "right");

  let sx = 0, sy = 0, dragging = false;
  card.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    dragging = true;
    card.style.transition = "none";
  }, { passive: true });
  card.addEventListener("touchmove", e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
  }, { passive: true });
  card.addEventListener("touchend", e => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "";
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (dy < -90) return act("add", "up");
    if (dx > 90) return act("save", "right");
    if (dx < -90) return act("skip", "left");
    card.style.transform = "";
  });

  card.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") act("skip", "left");
    if (e.key === "ArrowRight") act("save", "right");
    if (e.key === "ArrowUp") act("add", "up");
  });

  if (!state.current) nextCard(state, catalog);
  render();

  return { render, act, finish };
}
