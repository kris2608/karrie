import { motion } from "motion/react";

export function Chest({ open, delay = 0 }: { open: boolean; delay?: number }) {
  return (
    <svg className="chest" viewBox="0 0 200 170" aria-hidden="true">
      <motion.circle
        cx="100"
        cy="80"
        r="74"
        fill="#fff1bf"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={open ? { scale: 1, opacity: 0.9 } : { scale: 0.3, opacity: 0 }}
        transition={{ delay: delay + 0.15, duration: 0.5, ease: "easeOut" }}
        style={{ originX: 0.5, originY: 0.5 }}
      />
      <path d="M30 86h140v58c0 8-6 14-14 14H44c-8 0-14-6-14-14z" fill="#e56a0a" />
      <path d="M30 86h140v52c0 8-6 14-14 14H44c-8 0-14-6-14-14z" fill="#ff8a1f" />
      <rect x="30" y="86" width="140" height="58" rx="14" fill="none" stroke="#b4500a" strokeWidth="5" />
      <rect x="56" y="86" width="14" height="72" fill="#ffd23f" stroke="#c98d08" strokeWidth="4" />
      <rect x="130" y="86" width="14" height="72" fill="#ffd23f" stroke="#c98d08" strokeWidth="4" />
      <motion.g
        style={{ originX: 0.06, originY: 1 }}
        initial={{ rotate: 0, y: 0 }}
        animate={open ? { rotate: -16, y: -18 } : { rotate: 0, y: 0 }}
        transition={{ delay, type: "spring", stiffness: 260, damping: 14 }}
      >
        <path d="M30 88V66c0-22 18-36 70-36s70 14 70 36v22z" fill="#ff9d3d" stroke="#b4500a" strokeWidth="5" strokeLinejoin="round" />
        <path d="M56 88V36M144 88V36" stroke="#ffd23f" strokeWidth="14" />
        <path d="M56 88V36M144 88V36" stroke="#c98d08" strokeWidth="4" strokeOpacity="0.5" />
        <path d="M48 52c16-10 36-14 52-14" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.45" fill="none" />
      </motion.g>
      <rect x="88" y="80" width="24" height="26" rx="6" fill="#ffd23f" stroke="#c98d08" strokeWidth="4" />
      <circle cx="100" cy="92" r="4" fill="#8a5a1a" />
    </svg>
  );
}
