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

const cracker: Draw = ({ color, accent }) => ({
  layers: [
    L(<ellipse cx="64" cy="58" rx="36" ry="12" />, accent ?? shade(color, 0.12)),
    L(<path d="M28 64c0 7 16 12 36 12s36-5 36-12v14c0 7-16 12-36 12s-36-5-36-12z" />, color),
    L(<ellipse cx="64" cy="64" rx="36" ry="12" />, tint(color, 0.25)),
  ],
  marks: <g>{[[52, 62], [64, 66], [76, 62]].map(([cx, cy]) => dot(cx, cy, 2, shade(color, 0.3)))}</g>,
});

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

const pasta: Draw = () => ({
  layers: [
    L(<rect x="30" y="28" width="68" height="82" rx="10" />, "#2f7ed1", { shine: [{ cx: 38, cy: 60, rx: 3, ry: 20 }] }),
    L(<rect x="40" y="46" width="48" height="40" rx="14" />, "#fff3c8", { flat: true }),
  ],
  marks: (
    <g fill="#f2c14a" stroke="#b8861a" strokeWidth="2">
      <rect x="46" y="56" width="18" height="8" rx="4" transform="rotate(-25 55 60)" />
      <rect x="64" y="52" width="18" height="8" rx="4" transform="rotate(20 73 56)" />
      <rect x="54" y="70" width="18" height="8" rx="4" transform="rotate(-10 63 74)" />
      <rect x="70" y="70" width="12" height="8" rx="4" transform="rotate(30 76 74)" />
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
