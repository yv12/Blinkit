const TABS = [
  { id: "home", label: "Home" },
  { id: "post-order", label: "Order" },
  { id: "discover", label: "Discover" },
  { id: "saved", label: "Saved" },
  { id: "cart", label: "Cart" },
];

export default function BottomNav({ screen, cartCount, savedCount, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => {
        const active = screen === tab.id;
        let badge = null;
        if (tab.id === "cart" && cartCount > 0) badge = cartCount;
        if (tab.id === "saved" && savedCount > 0) badge = savedCount;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav-item${active ? " active" : ""}`}
            onClick={() => onChange(tab.id)}
            aria-current={active ? "page" : undefined}
          >
            <span className="bottom-nav-label">{tab.label}</span>
            {badge != null ? <span className="bottom-nav-badge">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
