import { motion } from "framer-motion";

/**
 * Simulated lock-screen push — demo delivery when app is "closed".
 */
export default function LockScreenNudge({ nudge, onOpen, onDismiss }) {
  if (!nudge) return null;
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      className="lockscreen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Lock screen notification"
    >
      <div className="lockscreen-status">
        <span>{time}</span>
        <span className="lockscreen-dots">••••</span>
      </div>
      <p className="lockscreen-date">
        {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </p>

      <button type="button" className="lockscreen-notif" onClick={onOpen}>
        <span className="lockscreen-icon" aria-hidden>
          b
        </span>
        <span className="lockscreen-copy">
          <span className="lockscreen-app">
            blinkit <span className="lockscreen-now">now</span>
          </span>
          <strong className="lockscreen-title">{nudge.title || "It's a Match!"}</strong>
          <span className="lockscreen-body">{nudge.body}</span>
        </span>
      </button>

      <button type="button" className="lockscreen-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </motion.div>
  );
}
