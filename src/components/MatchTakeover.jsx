import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ConfettiBurst from "./ConfettiBurst.jsx";
import {
  matchBodyCopy,
  matchHeadline,
  matchSubhead,
  reasonChip,
} from "../lib/matchCopy.js";

function initials(name = "?") {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function MatchTakeover({ match, personaName, onAccept, onClose }) {
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (match) setBurstKey((k) => k + 1);
  }, [match?.product_id, match?.reason]);

  if (!match) return null;

  return (
    <motion.div
      className="match-takeover"
      role="dialog"
      aria-label="It's a Match"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <ConfettiBurst active burstKey={burstKey} />

      <button type="button" className="match-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <motion.div
        className="match-card"
        initial={{ scale: 0.86, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
      >
        <p className="match-kicker">{reasonChip(match.reason)}</p>
        <h2 className="match-title">{match.title || matchHeadline(match.reason)}</h2>
        <p className="match-sub">{match.body || matchSubhead(match.reason)}</p>

        <div className="match-faces">
          <div className="match-avatar persona">
            <span>{initials(personaName)}</span>
            <small>{personaName}</small>
          </div>
          <div className="match-heart" aria-hidden="true">
            ♥
          </div>
          <div className="match-avatar product">
            <img src={match.image_url} alt="" />
            <small>₹{Math.round(match.price)}</small>
          </div>
        </div>

        <div className="match-product">
          <img src={match.image_url} alt="" />
          <div>
            <strong>{match.name}</strong>
            <p>{match.body || matchBodyCopy(match)}</p>
          </div>
        </div>

        <button type="button" className="match-cta" onClick={onAccept}>
          {match.cta || "Add to cart"}
        </button>
        <button type="button" className="match-skip" onClick={onClose}>
          Maybe later
        </button>
      </motion.div>
    </motion.div>
  );
}
