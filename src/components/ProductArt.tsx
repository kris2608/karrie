import { useId, type ReactNode } from "react";
import { ART, type ArtKind, type ArtSpec } from "./art";
import { outline, shade, tint } from "./color";

type Shine = { cx: number; cy: number; rx: number; ry: number; rot?: number };
type Layer = { shape: ReactNode; color: string; flat?: boolean; shine?: Shine[] };
type Art = { layers: Layer[]; marks?: ReactNode };
type Draw = (spec: ArtSpec) => Art;

const BROWN = "#8a5a32";
const LEAF = "#4cb84a";

const L = (shape: ReactNode, color: string, options: Omit<Layer, "shape" | "color"> = {}): Layer => ({ shape, color, ...options });
const line = (d: string, color: string, width = 3) => (
  <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
);
const dot = (cx: number, cy: number, r: number, color: string, opacity = 1) => (
  <circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} fill={color} opacity={opacity} />
);

const apple: Draw = ({ color, accent = LEAF }) => ({
  layers: [
    L(<rect x="60" y="26" width="7" height="20" rx="3.5" />, BROWN, { flat: true }),
    L(
      <path d="M64 46c-6-6-18-8-27-2-12 8-14 26-8 42 6 16 18 24 27 22 4-1 6-3 8-3s4 2 8 3c9 2 21-6 27-22 6-16 4-34-8-42-9-6-21-4-27 2z" />,
      color,
      { shine: [{ cx: 44, cy: 62, rx: 7, ry: 12, rot: -25 }] },
    ),
    L(<path d="M68 36c6-12 22-14 28-6-6 10-20 12-28 6z" />, accent),
  ],
  marks: line("M70 34q12-2 22-2", shade(accent, 0.35), 2),
});

/** Pear shape with a thin stem — not the round apple silhouette. */
const pear: Draw = ({ color, accent = LEAF }) => ({
  layers: [
    L(<rect x="61" y="18" width="6" height="18" rx="3" />, BROWN, { flat: true }),
    L(
      <path d="M64 32c-20 6-32 22-30 42 2 22 16 38 30 38s28-16 30-38c2-20-10-36-30-42z" />,
      color,
      { shine: [{ cx: 48, cy: 68, rx: 8, ry: 16, rot: -18 }] },
    ),
    L(<path d="M68 28c5-10 18-12 24-6-5 8-16 10-24 6z" />, accent),
  ],
});

/** Bell pepper with a green crown. */
const pepper: Draw = ({ color, accent = "#2f8f46" }) => ({
  layers: [
    L(
      <path d="M64 34c-18 2-28 18-26 40 2 20 14 36 26 36s24-16 26-36c2-22-8-38-26-40z" />,
      color,
      { shine: [{ cx: 48, cy: 62, rx: 7, ry: 14, rot: -22 }] },
    ),
    L(<path d="M52 30c4-10 12-14 20-10 2 8-2 14-8 16 6 0 12 2 16 8-8 2-14 0-18-4-2 6-8 10-14 8 2-6 4-12 4-18z" />, accent, { flat: true }),
  ],
  marks: line("M64 48v36", shade(color, 0.22), 3),
});

/** Fuzzy brown kiwi with a green cut face. */
const kiwiFruit: Draw = ({ color = "#8dbe45", accent = "#c06a32" }) => ({
  layers: [
    L(<ellipse cx="64" cy="70" rx="38" ry="30" />, accent, { shine: [{ cx: 48, cy: 58, rx: 8, ry: 10, rot: -25 }] }),
    L(<ellipse cx="64" cy="70" rx="26" ry="20" />, color, { flat: true }),
  ],
  marks: (
    <g>
      <ellipse cx="64" cy="70" rx="8" ry="6" fill="#f4efe4" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return dot(64 + Math.cos(rad) * 16, 70 + Math.sin(rad) * 12, 2.2, "#5b4636");
      })}
    </g>
  ),
});

/** Lumpy potato with eyes. */
const potato: Draw = ({ color = "#e2b15a", accent = "#c48a3a" }) => ({
  layers: [
    L(
      <path d="M28 72c4-22 22-36 42-34 22 2 34 20 32 40-2 22-20 34-40 32-20-2-36-16-34-38z" />,
      color,
      { shine: [{ cx: 48, cy: 58, rx: 10, ry: 8, rot: -20 }] },
    ),
  ],
  marks: (
    <g>
      {[[44, 62], [70, 54], [82, 76], [56, 86]].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          {dot(cx, cy, 3.2, accent)}
          {dot(cx - 1, cy - 1, 1.2, shade(accent, 0.35))}
        </g>
      ))}
    </g>
  ),
});

/** A few small potatoes in a pile. */
const babyPotatoes: Draw = ({ color = "#e2b15a", accent = "#c48a3a" }) => ({
  layers: [
    L(<ellipse cx="46" cy="78" rx="18" ry="14" />, shade(color, 0.08), { shine: [{ cx: 40, cy: 72, rx: 5, ry: 4 }] }),
    L(<ellipse cx="78" cy="74" rx="20" ry="15" />, color, { shine: [{ cx: 70, cy: 66, rx: 5, ry: 4 }] }),
    L(<ellipse cx="64" cy="54" rx="16" ry="13" />, tint(color, 0.12), { shine: [{ cx: 58, cy: 48, rx: 4, ry: 3 }] }),
  ],
  marks: <g>{[[42, 76], [74, 70], [66, 52]].map(([cx, cy]) => dot(cx, cy, 2.4, accent))}</g>,
});

/** Two long green beans. */
const greenBeans: Draw = ({ color = "#3cbf6e", accent = "#1f8a45" }) => ({
  layers: [
    L(
      <path d="M24 78c18-28 42-40 68-36 8 1 12 8 8 14-20 4-42 14-58 34-4 5-12 2-18-12z" />,
      color,
      { shine: [{ cx: 56, cy: 58, rx: 14, ry: 4, rot: -28 }] },
    ),
    L(
      <path d="M30 92c22-24 50-34 72-24 6 3 6 10 0 14-24-2-46 6-60 24-4 5-14 2-12-14z" />,
      tint(color, 0.1),
      { shine: [{ cx: 70, cy: 72, rx: 12, ry: 3.5, rot: -20 }] },
    ),
  ],
  marks: line("M40 70q20-8 40 0M48 86q22-6 38 4", accent, 2.5),
});

/** Bulb of garlic. */
const garlic: Draw = ({ color = "#f4efe4", accent = "#d9c7b0" }) => ({
  layers: [
    L(<path d="M64 28c-4 8-6 14-4 20" />, accent, { flat: true }),
    L(
      <path d="M64 48c-22 2-34 20-30 40 4 18 20 28 30 28s26-10 30-28c4-20-8-38-30-40z" />,
      color,
      { shine: [{ cx: 50, cy: 70, rx: 8, ry: 14, rot: -15 }] },
    ),
  ],
  marks: line("M64 58v40M50 66q8 20 0 36M78 66q-8 20 0 36", accent, 2.5),
});

/** Purple eggplant with green top. */
const eggplant: Draw = ({ color = "#6b3a8a", accent = LEAF }) => ({
  layers: [
    L(
      <path d="M64 40c-16 4-26 24-24 48 2 22 14 34 24 34s22-12 24-34c2-24-8-44-24-48z" />,
      color,
      { shine: [{ cx: 50, cy: 70, rx: 7, ry: 16, rot: -18 }] },
    ),
    L(<path d="M52 34c6-12 18-16 28-8-4 8-14 12-24 10 2 6-2 12-8 14 0-6 0-12 4-16z" />, accent, { flat: true }),
    L(<rect x="61" y="22" width="6" height="14" rx="3" />, BROWN, { flat: true }),
  ],
});

const tomato: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(<ellipse cx="64" cy="74" rx="38" ry="32" />, color, { shine: [{ cx: 46, cy: 62, rx: 8, ry: 11, rot: -30 }] }),
    L(
      <path d="M64 52c-4-7-15-8-20-3 6 2 10 4 12 6-7 0-13 4-13 9 7-2 13-4 17-4 1 4-1 9 2 12 3-3 4-8 4-12 4 0 10 2 17 4 0-5-6-9-13-9 2-2 6-4 12-6-5-5-16-4-18 3z" />,
      accent,
      { flat: true },
    ),
  ],
  marks: line("M64 46v-8", shade(accent, 0.4), 4),
});

const orange: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(<rect x="61" y="30" width="6" height="12" rx="3" />, BROWN, { flat: true }),
    L(<circle cx="64" cy="72" r="34" />, color, { shine: [{ cx: 48, cy: 58, rx: 8, ry: 12, rot: -30 }] }),
    L(<path d="M68 40c4-10 18-14 26-8-6 8-18 12-26 8z" />, accent),
  ],
  marks: (
    <g opacity="0.45">
      {[
        [56, 80],
        [74, 70],
        [66, 92],
        [84, 86],
        [48, 94],
        [80, 56],
      ].map(([cx, cy]) => dot(cx, cy, 1.8, shade(color, 0.3)))}
    </g>
  ),
});

const citrus: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(<ellipse cx="64" cy="72" rx="36" ry="30" />, color, { shine: [{ cx: 48, cy: 60, rx: 8, ry: 10, rot: -30 }] }),
    L(<path d="M70 44c4-9 16-12 22-7-5 7-15 10-22 7z" />, accent),
  ],
  marks: (
    <g opacity="0.45">
      {[
        [58, 82],
        [76, 72],
        [70, 92],
        [86, 84],
      ].map(([cx, cy]) => dot(cx, cy, 1.8, shade(color, 0.3)))}
    </g>
  ),
});

const fruit: Draw = ({ color, accent = LEAF }) => ({
  layers: [
    L(<rect x="61" y="30" width="6" height="16" rx="3" />, BROWN, { flat: true }),
    L(<path d="M64 42c18 0 30 18 30 36 0 18-14 30-30 30S34 96 34 78c0-18 12-36 30-36z" />, color, {
      shine: [{ cx: 50, cy: 66, rx: 7, ry: 11, rot: -20 }],
    }),
    L(<path d="M67 38c6-10 20-12 26-6-6 9-18 11-26 6z" />, accent),
  ],
});

const strawberry: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(
      <path d="M64 110c-18-8-36-28-36-48 0-14 12-22 24-20 4 1 8 3 12 3s8-2 12-3c12-2 24 6 24 20 0 20-18 40-36 48z" />,
      color,
      { shine: [{ cx: 46, cy: 58, rx: 6, ry: 10, rot: -25 }] },
    ),
    L(
      <path d="M40 44c7 3 14 3 17-1-4-6-2-12 7-16 9 4 11 10 7 16 3 4 10 4 17 1-3 9-14 11-24 7-10 4-21 2-24-7z" />,
      accent,
      { flat: true },
    ),
  ],
  marks: (
    <g>
      {[
        [48, 62],
        [64, 60],
        [80, 62],
        [54, 76],
        [72, 76],
        [62, 90],
        [44, 72],
        [84, 74],
      ].map(([cx, cy]) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="2" ry="3" fill="#ffe680" />
      ))}
    </g>
  ),
});

const grapes: Draw = ({ color, accent = "#3aaa4a" }) => {
  const berries = [
    [52, 54],
    [76, 54],
    [40, 74],
    [64, 74],
    [88, 74],
    [52, 94],
    [76, 94],
  ];
  return {
    layers: [
      L(<rect x="61" y="26" width="6" height="18" rx="3" />, BROWN, { flat: true }),
      L(
        <>
          {berries.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="13" />
          ))}
        </>,
        color,
      ),
      L(<path d="M68 36c6-10 20-12 28-4-6 8-18 10-28 4z" />, accent),
    ],
    marks: <g>{berries.map(([cx, cy]) => dot(cx - 4, cy - 4, 2.6, "#fff", 0.55))}</g>,
  };
};

const mushrooms: Draw = ({ color, accent = "#d9c7b0" }) => ({
  layers: [
    L(
      <>
        <rect x="40" y="72" width="16" height="30" rx="7" />
        <rect x="72" y="62" width="16" height="36" rx="7" />
      </>,
      tint(accent, 0.3),
    ),
    L(
      <>
        <path d="M24 78c0-18 12-30 24-30s24 12 24 30z" />
        <path d="M56 66c0-16 12-28 24-28s26 12 26 28z" />
      </>,
      shade(color, 0.12),
      { shine: [{ cx: 72, cy: 48, rx: 10, ry: 4, rot: -10 }] },
    ),
  ],
});

const banana: Draw = ({ color }) => ({
  layers: [
    L(
      <path d="M30 52c8 18 30 30 52 26 14-2 24-10 28-22 1-4-3-5-5-2-10 10-24 14-38 10-14-4-26-12-32-20-3-3-6-1-5 8z" />,
      shade(color, 0.08),
    ),
    L(
      <path d="M22 66c6 22 30 38 56 34 16-2 28-12 32-26 1-4-3-6-6-3-10 12-26 16-42 12-16-4-28-14-34-24-2-4-7-2-6 7z" />,
      color,
      { shine: [{ cx: 48, cy: 84, rx: 16, ry: 4, rot: 22 }] },
    ),
  ],
  marks: (
    <g>
      {line("M106 64l8-8", "#6b4a2a", 5)}
      {dot(23, 64, 3, "#6b4a2a")}
    </g>
  ),
});

const cucumber: Draw = ({ color, accent }) => ({
  layers: [
    L(<rect x="18" y="52" width="92" height="30" rx="15" transform="rotate(-18 64 67)" />, color, {
      shine: [{ cx: 54, cy: 62, rx: 22, ry: 4, rot: -18 }],
    }),
  ],
  marks: (
    <g opacity="0.55">
      {[
        [36, 80],
        [52, 70],
        [70, 66],
        [86, 58],
        [46, 86],
        [64, 80],
        [82, 72],
      ].map(([cx, cy]) => dot(cx, cy, 1.8, accent ?? shade(color, 0.4)))}
    </g>
  ),
});

const long: Draw = ({ color, accent }) => ({
  layers: [
    L(<rect x="18" y="52" width="92" height="28" rx="14" transform="rotate(-18 64 66)" />, color, {
      shine: [{ cx: 54, cy: 60, rx: 22, ry: 4, rot: -18 }],
    }),
  ],
  marks: accent ? line("M42 82l-4 -12M62 76l-4 -12M82 70l-4 -12", tint(accent, 0.2), 3) : undefined,
});

const carrot: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(
      <path d="M78 40c-4-10 0-20 8-22 2 8 0 14-2 20 6-6 14-8 20-4-6 6-14 8-20 8 8 0 14 4 14 10-8 0-14-4-18-8z" />,
      accent,
      { flat: true },
    ),
    L(<path d="M56 46c10-8 26-8 34 0s8 24 0 34l-52 30c-3 2-6-1-5-4z" />, color, {
      shine: [{ cx: 62, cy: 56, rx: 12, ry: 5, rot: -35 }],
    }),
  ],
  marks: line("M58 66l8 6M48 82l8 5M68 54l6 5", shade(color, 0.3), 2.5),
});

const root: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(<path d="M50 24h28l-4 34H54z" />, accent),
    L(<rect x="48" y="52" width="32" height="56" rx="14" />, color, { shine: [{ cx: 58, cy: 70, rx: 4, ry: 14 }] }),
  ],
  marks: line("M58 98v8M64 98v10M70 98v8", shade(color, 0.3), 2),
});

const lettuce: Draw = ({ color, accent = "#3aaa4a" }) => ({
  layers: [
    L(
      <path d="M24 78c-4-18 8-34 22-34 4-12 32-14 38-2 16-2 26 14 22 30 6 10 0 30-16 34H40c-16-2-22-16-16-28z" />,
      color,
    ),
    L(<path d="M44 84c-2-14 8-26 20-26s22 12 20 26c-2 10-10 16-20 16s-18-6-20-16z" />, tint(color, 0.35)),
  ],
  marks: line("M64 62v34M64 76l-10-8M64 84l10-8", shade(accent, 0.2), 2.5),
});

const floret: Draw = ({ color, accent = "#6dce73" }) => ({
  layers: [
    L(<path d="M54 74h20l6 32c0 3-2 4-4 4H52c-2 0-4-1-4-4z" />, accent),
    L(
      <>
        <circle cx="44" cy="62" r="18" />
        <circle cx="64" cy="48" r="20" />
        <circle cx="84" cy="62" r="18" />
        <circle cx="64" cy="70" r="16" />
      </>,
      color,
    ),
  ],
  marks: <g>{[[56, 44], [76, 58], [42, 58]].map(([cx, cy]) => dot(cx, cy, 3, tint(color, 0.35)))}</g>,
});

const bread: Draw = ({ color, accent }) => {
  const crust = accent ?? shade(color, 0.2);
  return {
    layers: [
      L(<path d="M22 82c0-26 18-42 42-42s42 16 42 42v12c0 6-4 10-10 10H32c-6 0-10-4-10-10z" />, color),
      L(<path d="M26 76c2-22 18-34 38-34s36 12 38 34c-10-4-24-6-38-6s-28 2-38 6z" />, crust, {
        shine: [{ cx: 48, cy: 52, rx: 12, ry: 4, rot: -18 }],
      }),
    ],
    marks: line("M44 56l8 8M60 50l8 8M76 54l8 8", tint(crust, 0.45), 3.5),
  };
};

const roll: Draw = ({ color }) => ({
  layers: [
    L(
      <>
        <ellipse cx="40" cy="76" rx="20" ry="18" />
        <ellipse cx="88" cy="76" rx="20" ry="18" />
      </>,
      shade(color, 0.06),
    ),
    L(<ellipse cx="64" cy="66" rx="24" ry="22" />, color, { shine: [{ cx: 54, cy: 56, rx: 8, ry: 4, rot: -20 }] }),
  ],
  marks: line("M54 66q10 -6 20 0", shade(color, 0.25), 3),
});

const croissant: Draw = ({ color, accent }) => ({
  layers: [
    L(<path d="M22 88c4-30 22-48 42-48s38 18 42 48c-8 4-18 0-22-6-6 6-14 8-20 8s-14-2-20-8c-4 6-14 10-22 6z" />, color, {
      shine: [{ cx: 56, cy: 52, rx: 12, ry: 4, rot: -10 }],
    }),
  ],
  marks: line("M44 52q6 16 0 34M64 44v40M84 52q-6 16 0 34", accent ?? shade(color, 0.25), 3),
});

/** Stack of wide rectangular crackers — not square knäckebröd. */
const cracker: Draw = ({ color, accent }) => {
  const holes = shade(color, 0.28);
  return {
    layers: [
      L(<rect x="16" y="78" width="96" height="16" rx="3" />, accent ?? shade(color, 0.12)),
      L(<rect x="20" y="58" width="92" height="16" rx="3" />, shade(color, 0.06)),
      L(<rect x="14" y="36" width="98" height="18" rx="3" />, color, {
        shine: [{ cx: 40, cy: 43, rx: 18, ry: 3, rot: -4 }],
      }),
    ],
    marks: (
      <g fill={holes}>
        {[28, 46, 64, 82, 100].map((cx) => (
          <circle key={cx} cx={cx} cy={45} r="2.2" />
        ))}
      </g>
    ),
  };
};

const milk: Draw = ({ color, accent = "#4aa8e0" }) => ({
  layers: [
    L(<path d="M50 30h28l12 16H38z" />, shade(color, 0.08), { flat: true }),
    L(<path d="M38 46h52v58c0 4-3 6-6 6H44c-3 0-6-2-6-6z" />, color, { shine: [{ cx: 46, cy: 70, rx: 3, ry: 18 }] }),
    L(<rect x="38" y="60" width="52" height="28" />, accent, { flat: true }),
    L(<rect x="70" y="32" width="11" height="9" rx="3" />, "#ff6b5e", { flat: true }),
  ],
  marks: <path d="M64 64c-5 7-7 10-7 13a7 7 0 0 0 14 0c0-3-2-6-7-13z" fill="#fff" />,
});

const carton: Draw = ({ color, accent = "#ffd23a" }) => ({
  layers: [
    L(<path d="M50 30h28l12 16H38z" />, shade(color, 0.08), { flat: true }),
    L(<path d="M38 46h52v58c0 4-3 6-6 6H44c-3 0-6-2-6-6z" />, color, { shine: [{ cx: 46, cy: 70, rx: 3, ry: 18 }] }),
    L(<rect x="44" y="62" width="40" height="24" rx="8" />, accent, { flat: true }),
  ],
});

const yogurt: Draw = ({ color, accent = "#ff8fb1" }) => ({
  layers: [
    L(<path d="M34 52h60l-7 50c-1 5-5 8-10 8H51c-5 0-9-3-10-8z" />, color, { shine: [{ cx: 44, cy: 72, rx: 3, ry: 14 }] }),
    L(<path d="M37 66h54l-3 22H40z" />, tint(accent, 0.45), { flat: true }),
    L(<ellipse cx="64" cy="51" rx="32" ry="9" />, accent),
  ],
  marks: (
    <g>
      {dot(64, 77, 6, "#ef3d4a")}
      {line("M62 70l2 2 3 -3", "#3aaa4a", 2.5)}
    </g>
  ),
});

const cup: Draw = ({ color, accent = "#f2b4c8" }) => ({
  layers: [
    L(<path d="M36 52h56l-7 48c-1 5-5 8-10 8H53c-5 0-9-3-10-8z" />, color, { shine: [{ cx: 46, cy: 72, rx: 3, ry: 14 }] }),
    L(<ellipse cx="64" cy="51" rx="30" ry="9" />, accent),
  ],
  marks: line("M44 76h40", shade(color, 0.12), 6),
});

const cheese: Draw = ({ color, accent }) => {
  const side = shade(color, 0.04);
  return {
    layers: [
      L(<path d="M22 72h88v26c0 4-3 6-6 6H28c-3 0-6-2-6-6z" />, side),
      L(<path d="M22 72L84 40l26 32z" />, tint(color, 0.25), { flat: true }),
    ],
    marks: (
      <g fill={accent ?? shade(color, 0.22)}>
        <ellipse cx="40" cy="86" rx="6" ry="5" />
        <ellipse cx="64" cy="94" rx="4" ry="3" />
        <ellipse cx="90" cy="84" rx="7" ry="6" />
        <ellipse cx="78" cy="58" rx="5" ry="2.5" />
      </g>
    ),
  };
};

const eggs: Draw = ({ color, accent }) => ({
  layers: [
    L(
      <>
        <ellipse cx="40" cy="66" rx="15" ry="19" />
        <ellipse cx="64" cy="60" rx="16" ry="21" />
        <ellipse cx="88" cy="66" rx="15" ry="19" />
      </>,
      color,
    ),
    L(<path d="M18 80h92l-6 24c-1 4-4 6-8 6H32c-4 0-7-2-8-6z" />, accent ?? "#cbb49a"),
  ],
  marks: (
    <g>
      {line("M48 84v20M80 84v20", shade(accent ?? "#cbb49a", 0.2), 2.5)}
      {dot(58, 50, 3, "#fff", 0.7)}
      {dot(35, 57, 2.5, "#fff", 0.7)}
    </g>
  ),
});

const jarLayers = (body: string, lid: string, label: string, bodyShine = true): Layer[] => [
  L(<path d="M38 46h52c4 0 6 3 6 6v48c0 6-4 10-10 10H42c-6 0-10-4-10-10V52c0-3 2-6 6-6z" />, body, {
    shine: bodyShine ? [{ cx: 42, cy: 70, rx: 3, ry: 16 }] : undefined,
  }),
  L(<rect x="40" y="30" width="48" height="18" rx="5" />, lid),
  L(<rect x="38" y="62" width="52" height="28" rx="6" />, label, { flat: true }),
];

const peanutButter: Draw = () => ({
  layers: jarLayers("#c98a3a", "#e0442f", "#ffe8b0"),
  marks: (
    <g>
      <path d="M54 72c-6 0-8 9-2 11 3 1 4 3 4 5 0 5 5 7 9 5" fill="none" stroke="#8a5a1a" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="60" cy="76" rx="8" ry="6" fill="#d9a25a" stroke="#8a5a1a" strokeWidth="2.5" />
      <ellipse cx="72" cy="80" rx="8" ry="6" fill="#d9a25a" stroke="#8a5a1a" strokeWidth="2.5" />
    </g>
  ),
});

const jar: Draw = ({ color, accent = "#f2c14a" }) => ({
  layers: jarLayers(color, accent, "#fff4dc"),
  marks: dot(64, 76, 6, color),
});

const box: Draw = ({ color, accent = "#ff8c1a" }) => ({
  layers: [
    L(<rect x="32" y="28" width="64" height="82" rx="10" />, color, { shine: [{ cx: 40, cy: 60, rx: 3, ry: 20 }] }),
    L(<rect x="42" y="46" width="44" height="34" rx="10" />, accent, { flat: true }),
  ],
  marks: line("M46 92h36", tint(color, 0.4), 4),
});

/** Clear pack of spaghetti strands. */
const pasta: Draw = () => ({
  layers: [
    L(<rect x="40" y="18" width="48" height="96" rx="8" />, "#f6ecd4", { shine: [{ cx: 50, cy: 48, rx: 3, ry: 24 }] }),
    L(<rect x="48" y="28" width="32" height="76" rx="4" />, "#fff8e6", { flat: true }),
  ],
  marks: (
    <g fill="none" stroke="#e2b15a" strokeWidth="2.4" strokeLinecap="round">
      {[52, 58, 64, 70, 76].map((x) => (
        <path key={x} d={`M${x} 34v64`} />
      ))}
    </g>
  ),
});

/** Whole avocado with a cut half showing the pit. */
const avocado: Draw = ({ color = "#5a8f3a", accent = "#c9a15b" }) => ({
  layers: [
    L(
      <path d="M86 48c10 8 14 24 8 40-6 18-22 30-36 28-8-1-14-8-14-16 0-22 10-46 24-54 6-4 12-2 18 2z" />,
      shade(color, 0.08),
      { shine: [{ cx: 78, cy: 62, rx: 6, ry: 12, rot: 20 }] },
    ),
    L(
      <path d="M42 44c14-10 30-8 40 6 8 12 8 34-2 48-8 12-22 18-34 14-14-4-22-20-18-36 2-10 8-20 14-32z" />,
      tint(color, 0.35),
      { flat: true },
    ),
    L(<ellipse cx="48" cy="72" rx="14" ry="16" />, accent, { flat: true }),
  ],
  marks: (
    <g>
      {dot(48, 72, 7, shade(accent, 0.18))}
      {line("M70 28l4-10", BROWN, 4)}
      {dot(72, 18, 3, BROWN)}
    </g>
  ),
});

/** Clear bag of mixed cut vegetables (wok / pasta veg). */
const vegBag: Draw = ({ color = "#7dce55", accent = "#ef6a32" }) => ({
  layers: [
    L(<path d="M34 38h60l8 66c0 6-4 10-10 10H36c-6 0-10-4-10-10z" />, "#e8f6ef", {
      shine: [{ cx: 44, cy: 70, rx: 4, ry: 18 }],
    }),
    L(<path d="M32 24h64l-4 16H36z" />, shade(color, 0.06), { flat: true }),
  ],
  marks: (
    <g>
      <rect x="42" y="54" width="16" height="10" rx="4" fill={accent} transform="rotate(-18 50 59)" />
      <rect x="60" y="62" width="18" height="9" rx="4" fill="#f0b15a" transform="rotate(12 69 66)" />
      <circle cx="52" cy="78" r="8" fill={color} />
      <circle cx="70" cy="82" r="7" fill="#6aaa3a" />
      <path d="M74 52c6-2 12 2 14 8 2 6-2 12-8 14-4 2-10 0-12-6-2-6 0-12 6-16z" fill="#ef4540" />
      <path d="M44 88c4-8 14-10 20-4" fill="none" stroke="#3aaa4a" strokeWidth="3" strokeLinecap="round" />
      {line("M40 28v8M52 28v8M64 28v8M76 28v8M88 28v8", tint(color, 0.4), 2)}
    </g>
  ),
});

/** A sleeve of round cookies. */
const cookies: Draw = ({ color = "#f0a03a", accent = "#c47a32" }) => ({
  layers: [
    L(<rect x="28" y="44" width="72" height="40" rx="20" />, color, { shine: [{ cx: 52, cy: 52, rx: 16, ry: 4 }] }),
    L(<ellipse cx="100" cy="64" rx="16" ry="20" />, shade(color, 0.1)),
    L(<ellipse cx="28" cy="64" rx="16" ry="20" />, tint(color, 0.2), { flat: true }),
  ],
  marks: (
    <g fill={accent}>
      {[
        [44, 58],
        [58, 70],
        [72, 56],
        [86, 72],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" />
      ))}
    </g>
  ),
});

/** Loose corn kernels, not a can. */
const cornKernels: Draw = ({ color = "#ffe14a", accent = "#f0b429" }) => ({
  layers: [
    L(<ellipse cx="38" cy="80" rx="14" ry="10" />, shade(color, 0.06)),
    L(<ellipse cx="64" cy="88" rx="16" ry="11" />, color, { shine: [{ cx: 58, cy: 84, rx: 4, ry: 3 }] }),
    L(<ellipse cx="90" cy="78" rx="14" ry="10" />, tint(color, 0.08)),
    L(<ellipse cx="50" cy="60" rx="15" ry="11" />, color, { shine: [{ cx: 44, cy: 56, rx: 4, ry: 3 }] }),
    L(<ellipse cx="78" cy="58" rx="14" ry="10" />, accent),
    L(<ellipse cx="64" cy="42" rx="13" ry="10" />, tint(color, 0.18), { shine: [{ cx: 58, cy: 38, rx: 4, ry: 3 }] }),
  ],
});

/** Clear jar with several gherkins inside. */
const pickleJar: Draw = ({ color = "#7dce55", accent = "#3aaa4a" }) => ({
  layers: [
    L(<path d="M40 50h48c3 0 5 2 5 5v44c0 6-4 9-9 9H44c-5 0-9-3-9-9V55c0-3 2-5 5-5z" />, "#e7f6d8", {
      shine: [{ cx: 48, cy: 74, rx: 3, ry: 16 }],
    }),
    L(<rect x="42" y="34" width="44" height="18" rx="5" />, "#c9a15b"),
  ],
  marks: (
    <g>
      {[
        "M46 66c0 14 3 26 7 26s7-12 7-26-3-14-7-14-7 0-7 14z",
        "M58 70c0 12 3 22 6 22s6-10 6-22-3-12-6-12-6 0-6 12z",
        "M70 64c0 15 3 28 6 28s6-13 6-28-3-15-6-15-6 0-6 15z",
      ].map((d, index) => (
        <path key={d} d={d} fill={index === 1 ? shade(color, 0.08) : color} stroke={accent} strokeWidth="2" />
      ))}
    </g>
  ),
});

const bag: Draw = ({ color, accent = "#ff8c1a" }) => ({
  layers: [
    L(<path d="M40 40h48l6 62c0 5-3 8-8 8H42c-5 0-8-3-8-8z" />, color, { shine: [{ cx: 44, cy: 70, rx: 3, ry: 18 }] }),
    L(<path d="M38 26h52l-2 16H40z" />, shade(color, 0.12), { flat: true }),
    L(<circle cx="64" cy="76" r="13" />, accent, { flat: true }),
  ],
  marks: line("M44 30v8M54 30v8M64 30v8M74 30v8M84 30v8", tint(color, 0.35), 2),
});

const bottle: Draw = ({ color, accent = "#7ec8e8" }) => ({
  layers: [
    L(<rect x="56" y="20" width="16" height="14" rx="4" />, accent),
    L(<path d="M56 32h16l4 12c8 4 12 10 12 18v40c0 5-3 8-8 8H48c-5 0-8-3-8-8V62c0-8 4-14 12-18z" />, color, {
      shine: [{ cx: 50, cy: 74, rx: 3, ry: 16 }],
    }),
    L(<rect x="44" y="70" width="40" height="22" rx="6" />, tint(accent, 0.3), { flat: true }),
  ],
});

const can: Draw = ({ color, accent = "#f2c14a" }) => ({
  layers: [
    L(<path d="M38 40h52v62c0 5-12 9-26 9s-26-4-26-9z" />, color, { shine: [{ cx: 46, cy: 72, rx: 3, ry: 18 }] }),
    L(<ellipse cx="64" cy="40" rx="26" ry="8" />, tint(color, 0.45), { flat: true }),
    L(<rect x="38" y="62" width="52" height="22" />, accent, { flat: true }),
  ],
  marks: line("M44 40h40", shade(color, 0.2), 2),
});

const frozen: Draw = ({ color, accent }) => ({
  layers: [
    L(<path d="M32 30h64l4 74c0 4-3 6-6 6H34c-3 0-6-2-6-6z" />, "#d7eef8", { shine: [{ cx: 40, cy: 66, rx: 3, ry: 20 }] }),
    L(<rect x="42" y="48" width="44" height="34" rx="12" />, color),
  ],
  marks: (
    <g>
      {dot(56, 64, 5, accent ?? tint(color, 0.3))}
      {dot(70, 60, 5, accent ?? tint(color, 0.3))}
      {dot(64, 72, 5, accent ?? tint(color, 0.3))}
      {line("M80 30v14M74 36l6 6 6-6M54 94h20", "#7ec8e8", 3)}
    </g>
  ),
});

const pizza: Draw = ({ color, accent = "#ef4540" }) => ({
  layers: [
    L(<path d="M22 44c28-12 56-12 84 0L64 112z" />, "#ffd36b"),
    L(<path d="M20 42c30-14 58-14 88 0l-4 10c-26-12-54-12-80 0z" />, color, { flat: true }),
  ],
  marks: (
    <g>
      {dot(50, 60, 6, accent)}
      {dot(76, 58, 6, accent)}
      {dot(64, 82, 5, accent)}
      {dot(58, 70, 3, "#3aaa4a")}
      {dot(74, 74, 3, "#3aaa4a")}
    </g>
  ),
});

const fish: Draw = ({ color, accent = "#f2c14a" }) => ({
  layers: [
    L(<path d="M30 68L14 52v32z" />, shade(color, 0.08)),
    L(<ellipse cx="66" cy="68" rx="38" ry="22" />, color, { shine: [{ cx: 62, cy: 56, rx: 18, ry: 4 }] }),
  ],
  marks: (
    <g>
      {dot(88, 62, 4, "#2b3640")}
      {dot(89, 61, 1.4, "#fff")}
      {line("M50 60q6 8 0 16M62 58q6 10 0 20", accent, 2.5)}
    </g>
  ),
});

const fries: Draw = ({ color, accent = "#ef4b3b" }) => ({
  layers: [
    L(
      <>
        <rect x="42" y="26" width="10" height="44" rx="4" transform="rotate(-10 47 48)" />
        <rect x="58" y="20" width="10" height="48" rx="4" />
        <rect x="74" y="26" width="10" height="44" rx="4" transform="rotate(10 79 48)" />
        <rect x="50" y="30" width="10" height="40" rx="4" transform="rotate(4 55 50)" />
        <rect x="66" y="28" width="10" height="42" rx="4" transform="rotate(-4 71 49)" />
      </>,
      color,
      { flat: true },
    ),
    L(<path d="M36 58h56l-8 50H44z" />, accent, { shine: [{ cx: 46, cy: 76, rx: 3, ry: 14 }] }),
  ],
});

const toiletRoll: Draw = ({ color, accent = "#bcd6ef" }) => ({
  layers: [
    L(<path d="M30 44h66v54c0 7-15 12-33 12s-33-5-33-12z" />, color),
    L(<ellipse cx="63" cy="44" rx="33" ry="11" />, "#eef1f5", { flat: true }),
  ],
  marks: (
    <g>
      <ellipse cx="63" cy="44" rx="10" ry="4" fill="#c9cfd6" />
      {line("M32 72c10 5 21 5 31 0s21-5 31 0M32 88c10 5 21 5 31 0s21-5 31 0", accent, 2.5)}
    </g>
  ),
});

const paper: Draw = ({ color, accent = "#f2c14a" }) => ({
  layers: [
    L(<path d="M38 30h52v72c0 6-12 10-26 10s-26-4-26-10z" />, color),
    L(<ellipse cx="64" cy="30" rx="26" ry="9" />, "#eef1f5", { flat: true }),
  ],
  marks: (
    <g>
      <ellipse cx="64" cy="30" rx="8" ry="3.5" fill="#c9cfd6" />
      {line("M40 60c8 4 16 4 24 0s16-4 24 0M40 80c8 4 16 4 24 0s16-4 24 0", accent, 2.5)}
    </g>
  ),
});

const pump: Draw = ({ color, accent = "#3aa0d8" }) => ({
  layers: [
    L(<path d="M60 20h22v8H66v12h-6z" />, "#5d6a74", { flat: true }),
    L(<rect x="40" y="40" width="48" height="70" rx="14" />, color, { shine: [{ cx: 48, cy: 70, rx: 3, ry: 18 }] }),
    L(<rect x="48" y="64" width="32" height="24" rx="8" />, tint(accent, 0.25), { flat: true }),
  ],
});

const tube: Draw = ({ color, accent = "#fffdf8" }) => ({
  layers: [
    L(<path d="M24 50h68l14 10v14l-14 10H24c-4 0-6-2-6-6V56c0-4 2-6 6-6z" />, color, {
      shine: [{ cx: 50, cy: 56, rx: 20, ry: 3 }],
    }),
    L(<rect x="104" y="58" width="10" height="18" rx="3" />, accent),
  ],
  marks: line("M34 58v18M70 62h14", tint(color, 0.5), 4),
});

const patty: Draw = ({ color, accent }) => ({
  layers: [
    L(<path d="M22 70h84v18c0 8-18 14-42 14s-42-6-42-14z" />, "#d9e3ea"),
    L(<ellipse cx="64" cy="68" rx="36" ry="16" />, color, { shine: [{ cx: 54, cy: 62, rx: 12, ry: 3 }] }),
  ],
  marks: <g>{[[48, 66], [64, 72], [78, 64], [58, 60]].map(([cx, cy]) => dot(cx, cy, 2.5, accent ?? tint(color, 0.3)))}</g>,
});

const piece: Draw = ({ color, accent }) => ({
  layers: [
    L(<path d="M28 80c6-30 26-44 48-36 16 6 24 20 20 34-4 16-20 26-40 26-16 0-30-10-28-24z" />, color, {
      shine: [{ cx: 62, cy: 54, rx: 14, ry: 4, rot: -10 }],
    }),
  ],
  marks: line("M46 78q14 6 30 -2", accent ?? shade(color, 0.2), 3),
});

const babyFood: Draw = () => ({
  layers: [
    L(<path d="M46 58h36c3 0 5 2 5 5v34c0 5-4 8-8 8H49c-4 0-8-3-8-8V63c0-3 2-5 5-5z" />, "#fff4dc", {
      shine: [{ cx: 54, cy: 78, rx: 3, ry: 12 }],
    }),
    L(<rect x="48" y="44" width="32" height="16" rx="4" />, "#f0b15a"),
    L(<path d="M52 74h24v14c0 3-2 5-5 5h-14c-3 0-5-2-5-5z" />, "#f2a04a", { flat: true }),
  ],
});

const butterBlock: Draw = () => ({
  layers: [
    L(<rect x="16" y="48" width="96" height="36" rx="4" />, "#ffe14a", { shine: [{ cx: 36, cy: 58, rx: 16, ry: 4 }] }),
    L(<rect x="16" y="58" width="96" height="12" />, "#fff6c2", { flat: true }),
  ],
  marks: line("M26 52v28M102 52v28", "#f0c14a", 2),
});

const crispBag: Draw = () => ({
  layers: [
    L(<path d="M36 36h56l8 64c0 5-4 8-9 8H37c-5 0-9-3-9-8z" />, "#ffd23a", { shine: [{ cx: 46, cy: 72, rx: 3, ry: 16 }] }),
    L(<path d="M34 22h60l-3 16H37z" />, "#ef4b3b", { flat: true }),
    L(<rect x="46" y="58" width="36" height="28" rx="8" />, "#fff3c4", { flat: true }),
  ],
  marks: (
    <g fill="#f0b429" stroke="#c48a3a" strokeWidth="1.5">
      <ellipse cx="56" cy="68" rx="8" ry="5" transform="rotate(-18 56 68)" />
      <ellipse cx="72" cy="74" rx="8" ry="5" transform="rotate(14 72 74)" />
      <ellipse cx="62" cy="80" rx="7" ry="4" transform="rotate(-8 62 80)" />
    </g>
  ),
});

const drinkCarton: Draw = () => ({
  layers: [
    L(<path d="M54 40h20l8 12H46z" />, "#ffb3c7", { flat: true }),
    L(<path d="M46 52h36v44c0 4-3 6-6 6H52c-3 0-6-2-6-6z" />, "#ff8fb1", { shine: [{ cx: 54, cy: 72, rx: 3, ry: 12 }] }),
  ],
  marks: line("M78 28c8 4 12 18 6 32", "#c9a15b", 3.5),
});

const sodaBottle: Draw = () => ({
  layers: [
    L(<rect x="56" y="16" width="16" height="12" rx="3" />, "#c43030"),
    L(<path d="M50 28h28l8 16v52c0 6-7 10-22 10s-22-4-22-10V44z" />, "#ef4b3b", { shine: [{ cx: 58, cy: 68, rx: 3, ry: 16 }] }),
    L(<rect x="50" y="58" width="28" height="20" />, "#fffdf8", { flat: true }),
  ],
});

const sprinkles: Draw = () => ({
  layers: [
    L(<rect x="34" y="28" width="60" height="78" rx="8" />, "#ff8a1a", { shine: [{ cx: 44, cy: 54, rx: 3, ry: 16 }] }),
    L(<rect x="44" y="46" width="40" height="38" rx="6" />, "#fff4dc", { flat: true }),
  ],
  marks: (
    <g>
      <rect x="50" y="54" width="7" height="3" rx="1.5" fill="#5b4636" transform="rotate(-18 53 55)" />
      <rect x="62" y="52" width="7" height="3" rx="1.5" fill="#fffdf8" transform="rotate(16 65 53)" />
      <rect x="70" y="60" width="7" height="3" rx="1.5" fill="#5b4636" transform="rotate(-12 73 61)" />
      <rect x="48" y="66" width="7" height="3" rx="1.5" fill="#fffdf8" transform="rotate(20 51 67)" />
      <rect x="60" y="70" width="7" height="3" rx="1.5" fill="#5b4636" transform="rotate(-8 63 71)" />
      <rect x="72" y="72" width="7" height="3" rx="1.5" fill="#fffdf8" transform="rotate(14 75 73)" />
    </g>
  ),
});

const soapPump: Draw = () => ({
  layers: [
    L(<path d="M56 16h18v8h-6v10h-6z" />, "#ef6a8a", { flat: true }),
    L(<rect x="72" y="16" width="18" height="6" rx="3" />, "#5d6a74", { flat: true }),
    L(<rect x="40" y="34" width="48" height="74" rx="18" />, "#f7c2d4", { shine: [{ cx: 52, cy: 64, rx: 3, ry: 16 }] }),
  ],
});

const iceCream: Draw = () => ({
  layers: [
    L(<path d="M46 64h36L64 112z" />, "#e8c07a", { shine: [{ cx: 56, cy: 80, rx: 3, ry: 10 }] }),
    L(<circle cx="64" cy="52" r="22" />, "#f7c2d4", { shine: [{ cx: 54, cy: 42, rx: 6, ry: 4 }] }),
  ],
  marks: line("M54 72l10 28M74 72l-10 28", "#c48a3a", 2),
});

const honeyJar: Draw = () => ({
  layers: [
    L(<path d="M30 54h40c3 0 5 2 5 5v38c0 6-4 9-8 9H33c-4 0-8-3-8-9V59c0-3 2-5 5-5z" />, "#f0a81a", {
      shine: [{ cx: 40, cy: 76, rx: 3, ry: 12 }],
    }),
    L(<rect x="32" y="40" width="36" height="16" rx="4" />, "#e08a10"),
    L(<rect x="86" y="36" width="8" height="46" rx="3" />, BROWN, { flat: true }),
    L(<circle cx="90" cy="86" r="10" />, "#f2c14a"),
  ],
});

const buttermilk: Draw = () => ({
  layers: [
    L(<path d="M50 30h28l12 16H38z" />, "#c43030", { flat: true }),
    L(<path d="M38 46h52v58c0 4-3 6-6 6H44c-3 0-6-2-6-6z" />, "#e23b3b", { shine: [{ cx: 46, cy: 72, rx: 3, ry: 18 }] }),
    L(<rect x="38" y="62" width="52" height="22" />, "#fffdf8", { flat: true }),
  ],
});

const coffeePack: Draw = () => ({
  layers: [
    L(<path d="M18 46h44l4 50c0 4-3 7-7 7H21c-4 0-7-3-7-7z" />, "#6b4634", { shine: [{ cx: 30, cy: 70, rx: 3, ry: 14 }] }),
    L(<path d="M16 32h48l-2 16H18z" />, "#3d2a22", { flat: true }),
    L(<path d="M74 62h26v18c0 10-6 16-13 16s-13-6-13-16z" />, "#fffdf8", { shine: [{ cx: 82, cy: 70, rx: 4, ry: 3 }] }),
    L(<path d="M100 68h12c3 0 4 4 2 7-3 2-8 2-12-1z" />, "#fffdf8", { flat: true }),
  ],
});

const diaper: Draw = () => ({
  layers: [
    L(
      <path d="M28 50c6-12 18-16 36-16s30 4 36 16c4 18 2 36-8 48-8 8-18 12-28 12s-20-4-28-12c-10-12-12-30-8-48z" />,
      "#fffdf8",
      { shine: [{ cx: 50, cy: 60, rx: 10, ry: 5 }] },
    ),
    L(<rect x="22" y="48" width="16" height="20" rx="4" />, "#7ec8e8", { flat: true }),
    L(<rect x="90" y="48" width="16" height="20" rx="4" />, "#7ec8e8", { flat: true }),
  ],
  marks: line("M42 82h44", "#d7e7f4", 4),
});

const mozzarellaBag: Draw = () => ({
  layers: [
    L(<path d="M34 36h60l6 62c0 5-4 8-9 8H37c-5 0-9-3-9-8z" />, "#eef6f8", { shine: [{ cx: 46, cy: 68, rx: 3, ry: 16 }] }),
    L(<path d="M32 22h64l-3 16H35z" />, "#d9e3ea", { flat: true }),
    L(<circle cx="64" cy="78" r="16" />, "#fffdf8", { shine: [{ cx: 56, cy: 70, rx: 5, ry: 4 }] }),
  ],
});

const muesliBag: Draw = () => ({
  layers: [
    L(<path d="M36 38h56l6 60c0 5-4 8-9 8H39c-5 0-9-3-9-8z" />, "#d8b06a", { shine: [{ cx: 46, cy: 70, rx: 3, ry: 16 }] }),
    L(<path d="M34 24h60l-3 16H37z" />, "#8a5a32", { flat: true }),
    L(<rect x="46" y="56" width="36" height="28" rx="8" />, "#fff4dc", { flat: true }),
  ],
  marks: (
    <g fill="#c48a3a">
      <ellipse cx="56" cy="66" rx="6" ry="3" transform="rotate(-20 56 66)" />
      <ellipse cx="70" cy="72" rx="7" ry="3" transform="rotate(16 70 72)" />
      <ellipse cx="60" cy="78" rx="6" ry="3" />
      <circle cx="74" cy="78" r="3" fill="#8a5a32" />
    </g>
  ),
});

const oliveJar: Draw = () => ({
  layers: [
    L(<path d="M40 48h48c3 0 5 2 5 5v46c0 6-4 9-9 9H44c-5 0-9-3-9-9V53c0-3 2-5 5-5z" />, "#f7fbe8", {
      shine: [{ cx: 48, cy: 74, rx: 3, ry: 16 }],
    }),
    L(<rect x="42" y="32" width="44" height="18" rx="5" />, "#c9a15b"),
  ],
  marks: (
    <g>
      {[
        [54, 72],
        [70, 76],
        [60, 90],
        [76, 92],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="7" fill="#7dce55" stroke="#3aaa4a" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="2.2" fill="#ef6a4a" />
        </g>
      ))}
    </g>
  ),
});

const riceBag: Draw = () => ({
  layers: [
    L(<path d="M36 38h56l6 60c0 5-4 8-9 8H39c-5 0-9-3-9-8z" />, "#f7f1e4", { shine: [{ cx: 46, cy: 70, rx: 3, ry: 16 }] }),
    L(<path d="M34 24h60l-3 16H37z" />, "#e2c9a0", { flat: true }),
  ],
  marks: (
    <g fill="#c4a060">
      {[
        [52, 62],
        [66, 66],
        [78, 60],
        [56, 76],
        [72, 78],
        [60, 88],
        [76, 90],
        [48, 90],
      ].map(([cx, cy]) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="2.2" ry="3.4" />
      ))}
    </g>
  ),
});

const creamCheese: Draw = () => ({
  layers: [
    L(<rect x="20" y="50" width="88" height="34" rx="6" />, "#fffdf8", { shine: [{ cx: 40, cy: 60, rx: 12, ry: 4 }] }),
    L(<path d="M20 50c8 8 12 8 18 0s10-8 18 0 10 8 18 0 10-8 18 0 10 8 16 0v12H20z" />, "#f2d2a0", { flat: true }),
  ],
  marks: line("M20 76c8 6 12 6 18 0s10-6 18 0 10 6 18 0 10-6 18 0", "#e2c4a0", 2),
});

const sprayBottle: Draw = () => ({
  layers: [
    L(<rect x="44" y="42" width="36" height="66" rx="10" />, "#7dce55", { shine: [{ cx: 52, cy: 66, rx: 3, ry: 16 }] }),
    L(<rect x="52" y="28" width="16" height="16" rx="3" />, "#3aaa4a", { flat: true }),
    L(<path d="M68 32h24l-4 8H68z" />, "#5a8f3a", { flat: true }),
    L(<rect x="50" y="60" width="24" height="16" rx="4" />, "#fffdf8", { flat: true }),
  ],
});

const shampooBottle: Draw = () => ({
  layers: [
    L(<path d="M52 18h24l4 12H48z" />, "#9a6ad1", { flat: true }),
    L(<path d="M40 30h48v74c0 6-6 10-14 10H54c-8 0-14-4-14-10z" />, "#d9b4f2", { shine: [{ cx: 50, cy: 64, rx: 3, ry: 18 }] }),
    L(<rect x="50" y="56" width="28" height="20" rx="6" />, "#fffdf8", { flat: true }),
  ],
});

const syrupBottle: Draw = () => ({
  layers: [
    L(<rect x="58" y="10" width="12" height="16" rx="3" />, "#e08a10"),
    L(<path d="M54 26h20l6 14v66c0 6-5 10-16 10s-16-4-16-10V40z" />, "#ef6a2a", { shine: [{ cx: 60, cy: 68, rx: 3, ry: 18 }] }),
  ],
  marks: line("M58 58h12", "#ffe14a", 4),
});

const custardCarton: Draw = () => ({
  layers: [
    L(<path d="M50 28h28l12 16H38z" />, "#f0b429", { flat: true }),
    L(<path d="M38 44h52v60c0 4-3 6-6 6H44c-3 0-6-2-6-6z" />, "#ffe7a8", { shine: [{ cx: 46, cy: 72, rx: 3, ry: 18 }] }),
    L(<rect x="44" y="62" width="40" height="22" rx="8" />, "#f0b429", { flat: true }),
  ],
});

const walnutBag: Draw = () => ({
  layers: [
    L(<path d="M34 38h60l6 60c0 5-4 8-9 8H37c-5 0-9-3-9-8z" />, "#f4e7c8", { shine: [{ cx: 46, cy: 70, rx: 3, ry: 16 }] }),
    L(<path d="M32 24h64l-3 16H35z" />, "#c48a3a", { flat: true }),
  ],
  marks: (
    <g fill="#8a5a22" stroke="#5b3a16" strokeWidth="1.5">
      <ellipse cx="52" cy="70" rx="10" ry="8" />
      <ellipse cx="74" cy="78" rx="11" ry="8" />
      <ellipse cx="60" cy="92" rx="10" ry="8" />
      <path d="M52 64v12M74 72v12M60 86v12" fill="none" />
    </g>
  ),
});

const trashRoll: Draw = () => ({
  layers: [
    L(<rect x="30" y="48" width="68" height="32" rx="6" />, "#243038", { shine: [{ cx: 50, cy: 58, rx: 12, ry: 4 }] }),
    L(<ellipse cx="30" cy="64" rx="14" ry="16" />, "#3a4a52"),
    L(<ellipse cx="98" cy="64" rx="14" ry="16" />, "#1c262c", { flat: true }),
  ],
});

const detergentJug: Draw = () => ({
  layers: [
    L(<path d="M36 44h40l6 12v46c0 6-6 10-14 10H44c-8 0-14-4-14-10V56z" />, "#2f7ed1", { shine: [{ cx: 48, cy: 72, rx: 3, ry: 16 }] }),
    L(<rect x="46" y="26" width="20" height="20" rx="4" />, "#6ec8e0", { flat: true }),
    L(<path d="M76 52h14c8 0 14 8 14 16s-6 16-14 16H76" />, "#6ec8e0", { flat: true }),
    L(<rect x="44" y="64" width="26" height="16" rx="4" />, "#fffdf8", { flat: true }),
  ],
});

const waterBottle: Draw = () => ({
  layers: [
    L(<rect x="56" y="8" width="16" height="16" rx="4" />, "#7ec8e8"),
    L(<path d="M46 24h36l4 12v70c0 6-8 10-22 10s-22-4-22-10V36z" />, "#d7f4ff", { shine: [{ cx: 56, cy: 64, rx: 3, ry: 22 }] }),
  ],
  marks: line("M52 72h24", "#7ec8e8", 5),
});

const soupPouch: Draw = () => ({
  layers: [
    L(<path d="M18 42h40l4 56c0 4-3 6-7 6H21c-4 0-7-2-7-6z" />, "#ef6a32", { shine: [{ cx: 30, cy: 68, rx: 3, ry: 14 }] }),
    L(<path d="M16 28h44l-2 16H18z" />, "#c44820", { flat: true }),
    L(<path d="M68 72h42c3 0 5 3 4 7l-8 20H74c-4 0-8-3-6-8z" />, "#fffdf8"),
    L(<ellipse cx="90" cy="72" rx="22" ry="7" />, "#f2c14a", { flat: true }),
  ],
});

const juiceBottle: Draw = () => ({
  layers: [
    L(<rect x="56" y="14" width="16" height="14" rx="3" />, "#ff9a1f"),
    L(<path d="M44 28h40l4 14v58c0 6-8 10-24 10s-24-4-24-10V42z" />, "#fff6e8", { shine: [{ cx: 54, cy: 64, rx: 3, ry: 16 }] }),
  ],
  marks: (
    <g>
      <circle cx="56" cy="70" r="9" fill="#ff9a1f" />
      <circle cx="74" cy="84" r="9" fill="#ffb23a" />
      <path d="M64 56c4-8 12-8 14-2-6 2-10 2-14 2z" fill="#3aaa4a" />
    </g>
  ),
});

const toothpaste: Draw = () => ({
  layers: [
    L(<path d="M16 60h60l12 8v10l-12 8H16c-3 0-5-2-5-5v-16c0-3 2-5 5-5z" />, "#7ec8e8", {
      shine: [{ cx: 40, cy: 66, rx: 14, ry: 3 }],
    }),
    L(<rect x="86" y="66" width="8" height="12" rx="2" />, "#fffdf8"),
    L(<rect x="96" y="28" width="8" height="40" rx="3" />, "#fffdf8", { flat: true }),
    L(<rect x="90" y="22" width="18" height="10" rx="4" />, "#3aa0d8", { flat: true }),
  ],
  marks: line("M100 34v22", "#7ec8e8", 2),
});

const whippedCream: Draw = () => ({
  layers: [
    L(<rect x="46" y="50" width="36" height="56" rx="8" />, "#f4f7ef", { shine: [{ cx: 54, cy: 72, rx: 3, ry: 14 }] }),
    L(<rect x="54" y="38" width="20" height="14" rx="3" />, "#d9e3ea", { flat: true }),
    L(<path d="M46 48c6-18 14-26 18-26s12 8 18 26c-8-8-14-10-18-10s-10 2-18 10z" />, "#fffdf8"),
    L(<circle cx="64" cy="24" r="8" />, "#fffdf8", { shine: [{ cx: 60, cy: 20, rx: 3, ry: 2 }] }),
  ],
});

const chocolateBar: Draw = () => ({
  layers: [L(<rect x="26" y="36" width="76" height="56" rx="6" />, "#6b3a22", { shine: [{ cx: 42, cy: 48, rx: 12, ry: 4 }] })],
  marks: line("M50 36v56M76 36v56M26 64h76", "#4a2616", 2.5),
});

const spiceCake: Draw = () => ({
  layers: [
    L(<path d="M24 58h62v36c0 4-3 6-6 6H30c-3 0-6-2-6-6z" />, "#c47a3a", { shine: [{ cx: 40, cy: 70, rx: 10, ry: 4 }] }),
    L(<path d="M86 58l22 12v36l-22-8z" />, "#a85e28", { flat: true }),
    L(<path d="M24 58l18-16h64l-20 16z" />, "#e08a32", { flat: true }),
  ],
});

const KIND: Record<ArtKind, Draw> = {
  fruit,
  berry: strawberry,
  cluster: mushrooms,
  banana,
  citrus,
  long,
  root,
  leaf: lettuce,
  floret,
  loaf: bread,
  roll,
  croissant,
  cracker,
  carton,
  cup,
  wedge: cheese,
  egg: eggs,
  jar,
  box,
  bag,
  bottle,
  can,
  frozen,
  pizza,
  fish,
  fries,
  paper,
  pump,
  tube,
  patty,
  piece,
};

const BESPOKE: Record<string, Draw> = {
  appel: apple,
  banaan: banana,
  peer: pear,
  paprika: pepper,
  kiwi: kiwiFruit,
  aardappel: potato,
  aardappeltjes: babyPotatoes,
  sperziebonen: greenBeans,
  knoflook: garlic,
  aubergine: eggplant,
  avocado,
  wokgroenten: vegBag,
  pastagroenten: vegBag,
  brood: bread,
  melk: milk,
  eieren: eggs,
  kaas: cheese,
  yoghurt: yogurt,
  tomaat: tomato,
  komkommer: cucumber,
  wortel: carrot,
  aardbei: strawberry,
  druiven: grapes,
  sinaasappel: orange,
  pasta,
  pindakaas: peanutButter,
  toiletpapier: toiletRoll,
  crackers: cracker,
  koekjes: cookies,
  mais: cornKernels,
  augurk: pickleJar,
  babyvoeding: babyFood,
  boter: butterBlock,
  chips: crispBag,
  drinkpakje: drinkCarton,
  frisdrank: sodaBottle,
  hagelslag: sprinkles,
  handzeep: soapPump,
  ijs: iceCream,
  honing: honeyJar,
  karnemelk: buttermilk,
  koffie: coffeePack,
  luiers: diaper,
  mozzarella: mozzarellaBag,
  muesli: muesliBag,
  olijven: oliveJar,
  rijst: riceBag,
  roomkaas: creamCheese,
  schoonmaakmiddel: sprayBottle,
  shampoo: shampooBottle,
  siroop: syrupBottle,
  vla: custardCarton,
  noten: walnutBag,
  vuilniszakken: trashRoll,
  wasmiddel: detergentJug,
  water: waterBottle,
  soep: soupPouch,
  sinaasappelsap: juiceBottle,
  tandpasta: toothpaste,
  slagroom: whippedCream,
  chocoladereep: chocolateBar,
  ontbijtkoek: spiceCake,
};

export const BESPOKE_IDS = Object.keys(BESPOKE);

const FALLBACK: ArtSpec = { kind: "box", color: "#ffd23f", accent: "#ff8a1f" };

export function ProductArt({ id, className }: { id: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const spec = ART[id] ?? FALLBACK;
  const art = (BESPOKE[id] ?? KIND[spec.kind] ?? box)(spec);

  return (
    <svg className={className ? `product-art ${className}` : "product-art"} viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        {art.layers.map((layer, index) =>
          layer.flat ? null : (
            <clipPath key={index} id={`${uid}-${index}`}>
              {layer.shape}
            </clipPath>
          ),
        )}
      </defs>
      <g fill="#fff" stroke="#fff" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round">
        {art.layers.map((layer, index) => (
          <g key={index}>{layer.shape}</g>
        ))}
      </g>
      {art.layers.map((layer, index) => (
        <g key={index}>
          <g fill={layer.flat ? layer.color : shade(layer.color, 0.16)}>{layer.shape}</g>
          {!layer.flat && (
            <g clipPath={`url(#${uid}-${index})`}>
              <g fill={layer.color} transform="translate(-4 -6)">
                {layer.shape}
              </g>
              {layer.shine?.map((spot, spotIndex) => (
                <ellipse
                  key={spotIndex}
                  cx={spot.cx}
                  cy={spot.cy}
                  rx={spot.rx}
                  ry={spot.ry}
                  transform={spot.rot ? `rotate(${spot.rot} ${spot.cx} ${spot.cy})` : undefined}
                  fill="#fff"
                  opacity="0.5"
                />
              ))}
            </g>
          )}
          <g fill="none" stroke={outline(layer.color)} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
            {layer.shape}
          </g>
        </g>
      ))}
      {art.marks}
    </svg>
  );
}
