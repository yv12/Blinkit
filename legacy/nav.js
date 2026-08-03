/* Shared bottom nav: Home · Order again · Category · Print · Track order */

const ITEMS = [
  {
    id: "home",
    href: "./index.html",
    label: "Home",
    svg: '<path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/>'
  },
  {
    id: "order-again",
    href: "./order-again.html",
    label: "Order again",
    svg: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  },
  {
    id: "category",
    href: "./category.html",
    label: "Category",
    svg: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>'
  },
  {
    id: "print",
    href: "./print.html",
    label: "Print",
    svg: '<path d="M7 8V4h10v4"/><rect x="5" y="8" width="14" height="8" rx="1"/><path d="M7 16h10v4H7z"/>'
  },
  {
    id: "track",
    href: "./order.html",
    label: "Track order",
    svg: '<path d="M4 17h12l3-6H8l-1-3H4"/><circle cx="9" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/>'
  }
];


export function renderNav(activeId) {
  return `<nav class="nav">${ITEMS.map(item => {
    const on = item.id === activeId ? " on" : "";
    const cur = item.id === activeId ? ' aria-current="page"' : "";
    return `<a class="${on.trim()}" href="${item.href}"${cur}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.svg}</svg>${item.label}</a>`;
  }).join("")}</nav>`;
}

export function mountNav(host, activeId) {
  if (!host) return;
  host.outerHTML = renderNav(activeId);
}
