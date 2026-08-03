function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21s-6.7-4.35-9.33-8.1C.8 10.2 1.2 6.8 4.1 5.2c1.9-1.05 4.2-.55 5.55 1.05L12 8.3l2.35-2.05c1.35-1.6 3.65-2.1 5.55-1.05 2.9 1.6 3.3 5 1.43 7.7C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h2l1.5 10h11L21 7H7" />
      <circle cx="10" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ActionButtons({ disabled, onSkip, onSave, onAdd }) {
  return (
    <div>
      <div className="actions">
        <button
          type="button"
          className="action-btn skip"
          aria-label="Skip"
          disabled={disabled}
          onClick={onSkip}
        >
          <IconX />
        </button>
        <button
          type="button"
          className="action-btn save"
          aria-label="Save"
          disabled={disabled}
          onClick={onSave}
        >
          <IconHeart />
        </button>
        <button
          type="button"
          className="action-btn add"
          aria-label="Add to cart"
          disabled={disabled}
          onClick={onAdd}
        >
          <IconCart />
        </button>
      </div>
      <div className="action-labels">
        <span>Skip</span>
        <span>Save</span>
        <span>Add</span>
      </div>
    </div>
  );
}
