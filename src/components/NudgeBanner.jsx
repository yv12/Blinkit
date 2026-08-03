import { motion } from "framer-motion";
import { nudgeBannerCopy, reasonChip } from "../lib/matchCopy.js";

export default function NudgeBanner({ match, onOpen, onDismiss }) {
  if (!match) return null;

  return (
    <motion.div
      className="nudge-banner"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <button type="button" className="nudge-banner-main" onClick={onOpen}>
        <span className="nudge-chip">{reasonChip(match.reason)}</span>
        <p>
          {match.title && match.body
            ? `${match.title} — ${match.body}`
            : match.body || nudgeBannerCopy(match)}
        </p>
      </button>
      {onDismiss ? (
        <button
          type="button"
          className="nudge-dismiss"
          aria-label="Dismiss nudge"
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </motion.div>
  );
}
