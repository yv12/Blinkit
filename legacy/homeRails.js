/**
 * Live home rails: Top picks + Something different refresh from engine swipes + orders.
 */

import { catalog, getPersonaBundle } from "../src/data/loadDemoData.js";
import { buildHomeRails } from "../src/lib/homeRails.js";
import { onEngineChange, snapshot } from "./engineBridge.js";

function tileHtml(p) {
  return `<div class="tile" data-id="${p.product_id}">
    <div class="img"><img src="${p.image}" alt="${p.name}" loading="lazy"></div>
    <div class="n">${p.name}</div>
    <div class="p">Rs ${p.price}</div>
  </div>`;
}

function flash(el) {
  if (!el) return;
  el.classList.remove("rails-flash");
  void el.offsetWidth;
  el.classList.add("rails-flash");
}

/**
 * @param {{ topRail: HTMLElement, diffRail: HTMLElement, badge?: HTMLElement, banner?: HTMLElement }} els
 */
export function mountHomeRails(els) {
  const { topRail, diffRail, badge, banner } = els;
  let lastKey = "";

  function paint() {
    const snap = snapshot();
    const personaId = snap?.personaId || "yash";
    const { persona: basePersona } = getPersonaBundle(personaId);
    const persona = snap?.persona
      ? {
          ...basePersona,
          ...snap.persona,
          order_history: snap.persona.order_history || basePersona.order_history,
          basket_facts: snap.persona.basket_facts || snap.state?.basket_facts || null,
        }
      : basePersona;

    const rails = buildHomeRails({
      catalog,
      persona,
      state: snap?.state || null,
      topLimit: 8,
      diffLimit: 8,
    });

    const key = [
      rails.learned ? "1" : "0",
      rails.last_order_name || "",
      rails.topPicks.map((p) => p.product_id).join(","),
      rails.somethingDifferent.map((p) => p.product_id).join(","),
    ].join("|");

    topRail.innerHTML = rails.topPicks.map(tileHtml).join("");
    diffRail.innerHTML = rails.somethingDifferent.map(tileHtml).join("");

    if (badge) {
      badge.hidden = false;
      badge.textContent = rails.reason;
      badge.dataset.learned = rails.learned ? "1" : "0";
    }

    if (banner) {
      if (rails.last_order_name) {
        banner.hidden = false;
        banner.textContent = `Just ordered ${rails.last_order_name} — recommendations updated live`;
      } else {
        banner.hidden = true;
        banner.textContent = "";
      }
    }

    if (key !== lastKey && lastKey !== "") {
      flash(topRail);
      flash(diffRail);
      if (banner && !banner.hidden) flash(banner);
    }
    lastKey = key;
  }

  paint();
  return onEngineChange(() => paint());
}
