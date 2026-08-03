/**
 * Cart drawer — opened from the hero cart button.
 */

import {
  getCartItems,
  onEngineChange,
  adjustCartQty,
  placeOrder,
} from "./engineBridge.js";
import { productImageUrl } from "../src/lib/productImage.js";

function ensureCartStyles() {
  if (document.getElementById("cart-sheet-styles")) return;
  const style = document.createElement("style");
  style.id = "cart-sheet-styles";
  style.textContent = `
    .cart-sheet-backdrop{
      position:absolute;inset:0;z-index:80;background:rgba(0,0,0,.35);
      opacity:0;pointer-events:none;transition:opacity .22s ease;
    }
    .cart-sheet-backdrop.show{opacity:1;pointer-events:auto}
    .cart-sheet{
      position:absolute;left:0;right:0;bottom:0;z-index:85;
      max-height:72%;background:#fff;border-radius:18px 18px 0 0;
      box-shadow:0 -8px 28px rgba(0,0,0,.18);
      transform:translateY(110%);transition:transform .28s cubic-bezier(.2,.8,.2,1);
      display:flex;flex-direction:column;pointer-events:none;
    }
    .cart-sheet.show{transform:translateY(0);pointer-events:auto}
    .cart-sheet-head{
      display:flex;align-items:center;justify-content:space-between;
      padding:14px 16px 10px;border-bottom:1px solid #eee;
    }
    .cart-sheet-head h3{font-size:15px;font-weight:800;color:#1F1F1F;margin:0}
    .cart-sheet-x{
      width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;
      background:#f3f3f3;font-size:18px;line-height:1;color:#333;
    }
    .cart-sheet-body{overflow-y:auto;padding:8px 12px 12px;flex:1;min-height:0}
    .cart-empty{
      text-align:center;padding:36px 16px;color:#6B6B6B;font-size:13px;font-weight:700;
    }
    .cart-row{
      display:flex;gap:10px;align-items:center;padding:10px 4px;
      border-bottom:1px solid #f0f0f0;
    }
    .cart-row img{
      width:52px;height:52px;object-fit:contain;border-radius:10px;background:#f7f7f7;flex:0 0 52px;
    }
    .cart-row .meta{min-width:0;flex:1}
    .cart-row .n{
      font-size:12px;font-weight:800;line-height:1.3;color:#1F1F1F;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    }
    .cart-row .p{font-size:12px;font-weight:800;color:#750000;margin-top:2px}
    .cart-row .rm{
      border:none;background:transparent;color:#CD130A;font-size:11px;font-weight:800;
      cursor:pointer;padding:6px 4px;flex:0 0 auto;
    }
    .cart-qty{
      display:inline-flex;align-items:center;gap:0;border:1px solid #CD130A;border-radius:999px;
      overflow:hidden;flex:0 0 auto;background:#fff;
    }
    .cart-qty button{
      width:28px;height:28px;border:none;background:#fff;color:#CD130A;
      font-size:16px;font-weight:800;cursor:pointer;line-height:1;
    }
    .cart-qty span{
      min-width:22px;text-align:center;font-size:12px;font-weight:800;color:#1F1F1F;
    }
    .cart-sheet-foot{
      padding:12px 16px 16px;border-top:1px solid #eee;background:#fff;
    }
    .cart-sheet-foot .total{
      display:flex;justify-content:space-between;font-size:13px;font-weight:800;margin-bottom:10px;
    }
    .cart-sheet-foot .checkout{
      width:100%;border:none;border-radius:999px;padding:12px;cursor:pointer;
      background:#CD130A;color:#fff;font:inherit;font-size:13px;font-weight:800;
    }
    .cart-sheet-foot .checkout:disabled{opacity:.45;cursor:default}
  `;
  document.head.appendChild(style);
}

function shortName(name = "") {
  const cut = String(name).split(",")[0].trim();
  return cut.length > 42 ? `${cut.slice(0, 40)}…` : cut;
}

function phoneRoot() {
  return document.querySelector(".phone") || document.body;
}

/**
 * Mount cart sheet + keep hero badge in sync.
 * @param {{ badgeBtn?: HTMLElement }} [opts]
 */
export function mountCartSheet(opts = {}) {
  ensureCartStyles();
  const phone = phoneRoot();
  let backdrop = phone.querySelector(".cart-sheet-backdrop");
  let sheet = phone.querySelector(".cart-sheet");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "cart-sheet-backdrop";
    phone.appendChild(backdrop);
  }
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.className = "cart-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Your cart");
    phone.appendChild(sheet);
  }

  const badgeBtn = opts.badgeBtn || document.querySelector("[data-cart-btn]");
  const countEl = badgeBtn?.querySelector("[data-cart-count]");

  function cartItems() {
    return getCartItems();
  }

  function paintBadge() {
    const items = cartItems();
    const n = items.reduce((s, i) => s + Math.max(1, Number(i.qty) || 1), 0);
    if (badgeBtn) {
      badgeBtn.dataset.count = String(n);
      badgeBtn.setAttribute("aria-label", n ? `Cart, ${n} items` : "Cart, empty");
    }
    if (countEl) {
      countEl.textContent = String(n);
      countEl.hidden = n === 0;
    }
  }

  function paintSheet() {
    const items = cartItems();
    const units = items.reduce((s, i) => s + Math.max(1, Number(i.qty) || 1), 0);
    const total = items.reduce((s, i) => {
      const qty = Math.max(1, Number(i.qty) || 1);
      return s + (Number(i.price) || 0) * qty;
    }, 0);
    const rows = items.length
      ? items
          .map((item) => {
            const img = productImageUrl(item, item.image_url) || "";
            const qty = Math.max(1, Number(item.qty) || 1);
            const line = Math.round((Number(item.price) || 0) * qty);
            return `<div class="cart-row" data-id="${item.product_id}">
              <img src="${img}" alt="">
              <div class="meta">
                <div class="n">${shortName(item.name)}</div>
                <div class="p">Rs ${line}${qty > 1 ? ` · ${qty} × Rs ${Math.round(item.price || 0)}` : ""}</div>
              </div>
              <div class="cart-qty" data-qid="${item.product_id}">
                <button type="button" data-dec="${item.product_id}" aria-label="Decrease">−</button>
                <span>${qty}</span>
                <button type="button" data-inc="${item.product_id}" aria-label="Increase">+</button>
              </div>
            </div>`;
          })
          .join("")
      : `<div class="cart-empty">Cart is empty — swipe up on a card to add</div>`;

    sheet.innerHTML = `
      <div class="cart-sheet-head">
        <h3>Your cart${units ? ` · ${units}` : ""}</h3>
        <button type="button" class="cart-sheet-x" data-close aria-label="Close">×</button>
      </div>
      <div class="cart-sheet-body">${rows}</div>
      <div class="cart-sheet-foot">
        <div class="total"><span>Total</span><span>Rs ${Math.round(total)}</span></div>
        <button type="button" class="checkout" data-checkout ${items.length ? "" : "disabled"}>
          ${items.length ? "Proceed to checkout" : "Add something first"}
        </button>
      </div>`;

    sheet.querySelector("[data-close]")?.addEventListener("click", close);
    sheet.querySelectorAll("[data-inc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        adjustCartQty(btn.getAttribute("data-inc"), 1).then(() => paint());
      });
    });
    sheet.querySelectorAll("[data-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        adjustCartQty(btn.getAttribute("data-dec"), -1).then(() => paint());
      });
    });
    sheet.querySelector("[data-checkout]")?.addEventListener("click", async () => {
      if (!items.length) return;
      const btn = sheet.querySelector("[data-checkout]");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Placing order…";
      }
      const result = await placeOrder({ source: "checkout" });
      close();
      if (result?.ok) {
        location.href = "./order.html?live=1";
      } else {
        location.href = "./order.html";
      }
    });
  }

  function paint() {
    paintBadge();
    if (sheet.classList.contains("show")) paintSheet();
  }

  function open() {
    paintSheet();
    backdrop.classList.add("show");
    sheet.classList.add("show");
  }

  function close() {
    backdrop.classList.remove("show");
    sheet.classList.remove("show");
  }

  badgeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sheet.classList.contains("show")) close();
    else open();
  });
  backdrop.addEventListener("click", close);

  paintBadge();
  const off = onEngineChange(() => paint());
  return { open, close, paint, destroy: off };
}
