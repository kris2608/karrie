function parse(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, (char) => char + char) : value;
  const number = Number.parseInt(full, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function format(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
}

export function shade(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  return format([r * (1 - amount), g * (1 - amount), b * (1 - amount * 0.8)]);
}

export function tint(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  return format([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}

export function outline(hex: string): string {
  const [r, g, b] = parse(hex);
  const light = (r * 299 + g * 587 + b * 114) / 1000;
  return shade(hex, light > 200 ? 0.62 : 0.5);
}
