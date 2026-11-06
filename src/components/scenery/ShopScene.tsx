function Shelf({ x, flip }: { x: number; flip?: boolean }) {
  const rows = [210, 330, 450, 570];
  const items = flip ? ["#ffd23f", "#16bfb2", "#ff6b5e"] : ["#ff6b5e", "#ffd23f", "#16bfb2"];
  return (
    <g transform={`translate(${x} 0)`} opacity="0.5">
      <rect x="0" y="150" width="96" height="560" rx="18" fill="#fce9cc" />
      {rows.map((y, row) => (
        <g key={y}>
          {[0, 1, 2].map((index) => (
            <rect
              key={index}
              x={12 + index * 26}
              y={y - 46 + (index % 2) * 8}
              width="20"
              height={38 - (index % 2) * 8}
              rx="6"
              fill={items[(index + row) % 3]}
              opacity="0.35"
            />
          ))}
          <rect x="0" y={y} width="96" height="10" rx="5" fill="#f4d3a4" />
        </g>
      ))}
    </g>
  );
}

export function ShopScene() {
  return (
    <svg className="scene scene-shop" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <Shelf x={-58} />
      <Shelf x={352} flip />
      <ellipse cx="195" cy="470" rx="170" ry="150" fill="#fff" opacity="0.55" />
      <path d="M-10 720C80 700 300 700 400 720V844H-10Z" fill="#fce9cc" opacity="0.7" />
    </svg>
  );
}
