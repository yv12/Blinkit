import { AnimatePresence, motion } from "framer-motion";

const PARTICLES = [
  { x: -70, y: -90, delay: 0, rotate: -20 },
  { x: 10, y: -110, delay: 0.02, rotate: 8 },
  { x: 80, y: -85, delay: 0.04, rotate: 24 },
  { x: -40, y: -40, delay: 0.05, rotate: -12 },
  { x: 55, y: -35, delay: 0.06, rotate: 16 },
  { x: -10, y: -60, delay: 0.03, rotate: 0 },
];

export default function HeartBurst({ active, burstKey }) {
  return (
    <div className="heart-burst" aria-hidden="true">
      <AnimatePresence>
        {active ? (
          <motion.div key={burstKey} style={{ position: "absolute", inset: 0 }}>
            {PARTICLES.map((p, i) => (
              <motion.span
                key={i}
                className="heart-particle"
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: p.x,
                  y: p.y,
                  scale: [0.4, 1.2, 0.8],
                  rotate: p.rotate,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.38, delay: p.delay, ease: "easeOut" }}
              >
                ♥
              </motion.span>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
