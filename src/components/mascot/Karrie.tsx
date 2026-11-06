import { motion, type TargetAndTransition, type Transition } from "motion/react";
import { useId, type Ref } from "react";

export type Mood = "idle" | "greeting" | "searching" | "happy" | "celebrating" | "surprised" | "complete";

type KarrieProps = {
  mood?: Mood;
  beat?: number;
  enter?: "roll" | "pop" | "none";
  className?: string;
  basketRef?: Ref<SVGRectElement>;
};

const INK = "#2b3640";
const ORANGE = "#ff8a1f";
const ORANGE_SHADE = "#e56a0a";
const ORANGE_LINE = "#b4500a";
const TEAL = "#16bfb2";
const TEAL_LINE = "#0b6e68";
const CORAL = "#ff6b5e";
const CORAL_LINE = "#b8433a";

const ROLL = 0.9;

const BASKET = "M70 84H212Q226 84 223 98L210 168Q207 180 194 180H92Q79 180 76 168L62 98Q59 84 70 84Z";

const bodyMotion: Record<Mood, { animate: TargetAndTransition; transition: Transition }> = {
  idle: { animate: { y: 0, rotate: 0, scaleX: 1, scaleY: 1 }, transition: { duration: 0.2 } },
  greeting: { animate: { rotate: [0, -5, 4, -2, 0] }, transition: { duration: 0.9, ease: "easeInOut" } },
  searching: { animate: { rotate: -2, y: 0 }, transition: { type: "spring", stiffness: 200, damping: 18 } },
  happy: {
    animate: { y: [0, -16, 0, -4, 0], scaleY: [1, 1.06, 0.92, 1.02, 1], scaleX: [1, 0.96, 1.06, 0.99, 1] },
    transition: { duration: 0.55, ease: "easeOut" },
  },
  celebrating: {
    animate: { y: [0, -26, 0, -12, 0], rotate: [0, -6, 6, -3, 0], scaleY: [1, 1.05, 0.9, 1.03, 1] },
    transition: { duration: 0.8, ease: "easeOut" },
  },
  surprised: { animate: { y: [0, -8, 0], scale: [1, 1.07, 1] }, transition: { duration: 0.35, ease: "easeOut" } },
  complete: {
    animate: { y: [0, -18, 0], rotate: [0, -3, 0] },
    transition: { duration: 0.6, ease: "easeOut", repeat: Infinity, repeatDelay: 2.4 },
  },
};

const hops: Mood[] = ["happy", "celebrating", "complete"];

export function Karrie({ mood = "idle", beat = 0, enter = "none", className, basketRef }: KarrieProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clip = `k-basket-${uid}`;
  const rolling = enter === "roll";
  const startDelay = rolling ? ROLL : 0;
  const body = bodyMotion[mood];
  const closedEyes = mood === "happy" || mood === "celebrating";

  return (
    <motion.svg
      className={className ? `karrie ${className}` : "karrie"}
      viewBox="0 0 260 230"
      aria-hidden="true"
      initial={rolling ? { x: -320 } : enter === "pop" ? { scale: 0.6, opacity: 0 } : false}
      animate={{ x: 0, scale: 1, opacity: 1 }}
      transition={rolling ? { duration: ROLL, ease: [0.22, 1, 0.36, 1] } : { type: "spring", stiffness: 300, damping: 20 }}
    >
      <defs>
        <clipPath id={clip}>
          <path d={BASKET} />
        </clipPath>
      </defs>

      <motion.ellipse
        key={`shadow-${mood}-${beat}`}
        cx="142"
        cy="218"
        rx="80"
        ry="8"
        fill="rgba(120, 72, 20, 0.16)"
        style={{ originX: 0.5, originY: 0.5 }}
        animate={hops.includes(mood) ? { scaleX: [1, 0.78, 1, 0.94, 1] } : { scaleX: 1 }}
        transition={{ ...body.transition, delay: startDelay }}
      />

      <motion.g
        key={`body-${mood}-${beat}`}
        style={{ originX: 0.5, originY: 1 }}
        animate={body.animate}
        transition={{ ...body.transition, delay: startDelay }}
      >
        <g className="k-breath">
          <Groceries />
          {mood === "searching" && <ExplorerHat />}

          <rect x="46" y="58" width="14" height="50" rx="7" fill={CORAL} stroke={CORAL_LINE} strokeWidth="4" />
          <rect x="20" y="46" width="54" height="18" rx="9" fill={CORAL} stroke={CORAL_LINE} strokeWidth="4" />
          <rect x="26" y="49" width="30" height="5" rx="2.5" fill="#fff" opacity="0.4" />

          <path d={BASKET} fill={ORANGE_SHADE} />
          <g clipPath={`url(#${clip})`}>
            <path d={BASKET} fill={ORANGE} transform="translate(-5 -8)" />
            {[0, 1, 2].map((row) =>
              [0, 1].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={80 + col * 20}
                  y={100 + row * 24}
                  width="14"
                  height="17"
                  rx="4"
                  fill={ORANGE_SHADE}
                  opacity="0.55"
                />
              )),
            )}
            <ellipse cx="120" cy="96" rx="52" ry="7" fill="#fff" opacity="0.28" />
          </g>
          <path d={BASKET} fill="none" stroke={ORANGE_LINE} strokeWidth="4.5" strokeLinejoin="round" />
          <rect x="54" y="76" width="176" height="17" rx="8.5" fill="#ff9d3d" stroke={ORANGE_LINE} strokeWidth="4.5" />
          <rect x="66" y="79" width="70" height="4" rx="2" fill="#fff" opacity="0.45" />
          <rect ref={basketRef} x="80" y="70" width="130" height="28" fill="transparent" />

          <Face mood={mood} closedEyes={closedEyes} />
          <Arm mood={mood} delay={startDelay} />
        </g>

        <motion.g
          style={{ originX: 0.5, originY: 0.5 }}
          initial={rolling ? { rotate: -720 } : false}
          animate={{ rotate: 0 }}
          transition={{ duration: ROLL, ease: [0.22, 1, 0.36, 1] }}
        >
          <Wheel cx={104} />
        </motion.g>
        <motion.g
          style={{ originX: 0.5, originY: 0.5 }}
          initial={rolling ? { rotate: -720 } : false}
          animate={{ rotate: 0 }}
          transition={{ duration: ROLL, ease: [0.22, 1, 0.36, 1] }}
        >
          <Wheel cx={184} />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
}

function Wheel({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy="196" r="19" fill={TEAL} stroke={TEAL_LINE} strokeWidth="4.5" />
      <circle cx={cx} cy="196" r="7.5" fill="#e6f7f5" stroke={TEAL_LINE} strokeWidth="3.5" />
      <circle cx={cx} cy="184" r="3" fill="#fff" opacity="0.85" />
    </g>
  );
}

function Groceries() {
  return (
    <g className="k-groceries">
      <path d="M68 90C60 72 70 56 86 58C90 46 108 46 112 60C122 60 124 76 116 90Z" fill="#6cc94f" stroke="#3a8a2c" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M84 64Q92 74 90 88M102 60Q104 72 100 88" fill="none" stroke="#3a8a2c" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M120 44L134 30L148 44V90H120Z" fill="#f4f7fb" stroke="#6a7a8a" strokeWidth="3.5" strokeLinejoin="round" />
      <rect x="120" y="58" width="28" height="16" fill="#4aa8e0" />
      <path d="M120 44H148" stroke="#6a7a8a" strokeWidth="3" />
      <g transform="rotate(32 172 64)">
        <rect x="160" y="22" width="24" height="76" rx="12" fill="#f0b15a" stroke="#a8692a" strokeWidth="3.5" />
        <path d="M166 38l12 6M166 54l12 6M166 70l12 6" stroke="#c9843e" strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d="M190 84C192 64 206 54 224 58C220 62 214 70 212 86Z" fill="#ffe14a" stroke="#b8901a" strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="104" cy="78" r="14" fill="#ef4b3b" stroke="#a52a20" strokeWidth="3.5" />
      <path d="M104 64q2 -6 6 -8" stroke="#5b3a22" strokeWidth="3" strokeLinecap="round" fill="none" />
      <ellipse cx="99" cy="74" rx="4" ry="5" fill="#fff" opacity="0.45" />
    </g>
  );
}

function ExplorerHat() {
  return (
    <g>
      <path d="M96 72C100 36 122 22 150 22C180 22 200 38 204 72Z" fill="#f6d68a" stroke="#a87a2a" strokeWidth="4" strokeLinejoin="round" />
      <rect x="98" y="56" width="104" height="10" fill="#c98a3a" />
      <ellipse cx="150" cy="72" rx="74" ry="11" fill="#f2c46b" stroke="#a87a2a" strokeWidth="4" />
      <ellipse cx="128" cy="38" rx="14" ry="5" fill="#fff" opacity="0.4" transform="rotate(-18 128 38)" />
    </g>
  );
}

function Face({ mood, closedEyes }: { mood: Mood; closedEyes: boolean }) {
  const browLift = mood === "surprised" ? -7 : mood === "searching" ? -12 : 0;
  return (
    <g>
      <motion.g animate={{ y: browLift }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
        <path d="M132 100q12 -8 24 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <path d="M174 100q12 -8 24 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      </motion.g>
      {mood === "searching" ? (
        <Binoculars />
      ) : closedEyes ? (
        <g>
          <path d="M132 126q12 -13 24 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M174 126q12 -13 24 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </g>
      ) : (
        <g className="k-blink">
          <ellipse cx="144" cy="122" rx="15" ry="17" fill="#fff" stroke={INK} strokeWidth="4" />
          <ellipse cx="186" cy="122" rx="15" ry="17" fill="#fff" stroke={INK} strokeWidth="4" />
          <circle cx="146" cy="125" r={mood === "surprised" ? 6 : 8} fill={INK} />
          <circle cx="188" cy="125" r={mood === "surprised" ? 6 : 8} fill={INK} />
          <circle cx="143" cy="121" r="3" fill="#fff" />
          <circle cx="185" cy="121" r="3" fill="#fff" />
        </g>
      )}
      <ellipse cx="128" cy="146" rx="9" ry="6" fill="#ff9e94" opacity="0.85" />
      <ellipse cx="204" cy="146" rx="9" ry="6" fill="#ff9e94" opacity="0.85" />
      <Mouth mood={mood} />
    </g>
  );
}

const LENSES = [144, 188];

function Binoculars() {
  return (
    <motion.g
      style={{ originX: 0.5, originY: 0.5 }}
      animate={{ x: [0, -6, 6, 0], rotate: [0, -4, 4, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }}
    >
      <g transform="translate(166 106) scale(1.2) translate(-166 -113)">
        <rect x="158" y="100" width="16" height="22" rx="5" fill="#0f7f77" stroke={INK} strokeWidth="4" />
        {LENSES.map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="121" r="25" fill="#0b6e68" stroke={INK} strokeWidth="4" />
            <circle cx={cx} cy="113" r="25" fill="#22b3a7" stroke={INK} strokeWidth="4" />
            <path d={`M${cx - 18} 102a22 22 0 0 1 18 -11`} fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
            <circle cx={cx} cy="114" r="16" fill="#d8f3ff" stroke="#0b5650" strokeWidth="3.5" />
          </g>
        ))}
        <motion.g
          animate={{ x: [0, -5, 5, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }}
        >
          {LENSES.map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="115" r="9.5" fill={INK} />
              <circle cx={cx - 3.5} cy="111" r="3.5" fill="#fff" />
            </g>
          ))}
        </motion.g>
        {LENSES.map((cx) => (
          <ellipse key={cx} cx={cx + 7} cy="107" rx="4" ry="2.6" fill="#fff" opacity="0.8" transform={`rotate(-35 ${cx + 7} 107)`} />
        ))}
      </g>
    </motion.g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === "surprised") {
    return <ellipse cx="166" cy="155" rx="7" ry="9" fill="#8a2b2b" stroke={INK} strokeWidth="4" />;
  }
  if (mood === "idle" || mood === "searching") {
    return <path d="M150 146q16 14 32 0" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />;
  }
  const big = mood === "celebrating" || mood === "complete";
  const d = big ? "M144 142q22 6 44 0q-3 26 -22 26q-19 0 -22 -26z" : "M148 144q18 4 36 0q-2 20 -18 20q-16 0 -18 -20z";
  return (
    <g>
      <path d={d} fill="#8a2b2b" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="166" cy={big ? 161 : 158} rx={big ? 10 : 8} ry="5" fill="#ff7a7a" />
    </g>
  );
}

function Arm({ mood, delay }: { mood: Mood; delay: number }) {
  if (mood === "idle" || mood === "surprised") return null;
  const waving = mood === "greeting";
  const searching = mood === "searching";
  return (
    <motion.g
      style={{ originX: 0, originY: 1 }}
      initial={{ rotate: 0 }}
      animate={waving ? { rotate: [0, -22, 8, -18, 4, 0] } : { rotate: 0 }}
      transition={waving ? { duration: 1.1, delay: delay + 0.1, ease: "easeInOut" } : { duration: 0.2 }}
    >
      <path d={searching ? "M214 142Q240 138 224 124" : "M214 134Q234 128 238 108"} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      {(mood === "happy" || mood === "complete") && (
        <g>
          <path d="M238 104V86" stroke="#8a5a32" strokeWidth="4" strokeLinecap="round" />
          <circle cx="238" cy="70" r="18" fill="#3cc46b" stroke="#1f7a40" strokeWidth="4" />
          <path d="M229 70l6 7 12 -14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {mood === "celebrating" && (
        <g>
          <path
            d="M238 50l6 13 14 1-11 9 4 14-13-8-13 8 4-14-11-9 14-1z"
            fill="#ffd23f"
            stroke="#b88a0a"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M218 46l-6-6M258 46l6-6M238 40v-8" stroke="#ffd23f" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}
      <circle cx={searching ? 221 : 238} cy={searching ? 122 : 106} r="8.5" fill="#fff" stroke={INK} strokeWidth="3.5" />
    </motion.g>
  );
}
