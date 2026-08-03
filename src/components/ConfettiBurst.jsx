import { useMemo } from "react";
import { motion } from "framer-motion";

const COLORS = ["#F7C948", "#3DBE62", "#FF4D6D", "#F4FFF7", "#7CFFB2", "#FFB020"];

function pieceStyle(i, total) {
  const angle = (i / total) * Math.PI * 2;
  const dist = 90 + (i % 5) * 28;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist - 40,
    rotate: (i * 47) % 360,
    color: COLORS[i % COLORS.length],
    delay: (i % 8) * 0.015,
    size: 6 + (i % 4) * 3,
  };
}

export default function ConfettiBurst({ active, burstKey }) {
  const pieces = useMemo(
    () => Array.from({ length: 28 }, (_, i) => pieceStyle(i, 28)),
    [],
  );

  if (!active) return null;

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={`${burstKey}-${i}`}
          className="confetti-piece"
          style={{
            background: p.color,
            width: p.size,
            height: p.size * 0.55,
          }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: p.x,
            y: p.y + 80,
            scale: 1,
            rotate: p.rotate,
          }}
          transition={{ duration: 0.55, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
