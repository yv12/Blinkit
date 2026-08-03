import { motion } from "framer-motion";

export default function CartBadge({ count, bounceKey, badgeRef }) {
  return (
    <div className="cart-badge-wrap" ref={badgeRef} aria-label={`Cart, ${count} items`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h2l1.5 10h11L21 7H7" />
        <circle cx="10" cy="19" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none" />
      </svg>
      <motion.span
        key={bounceKey}
        className="cart-count"
        initial={{ scale: 0.6 }}
        animate={{ scale: [0.6, 1.25, 1] }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {count}
      </motion.span>
    </div>
  );
}
