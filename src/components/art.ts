export type ArtKind =
  | "fruit"
  | "berry"
  | "cluster"
  | "banana"
  | "citrus"
  | "long"
  | "root"
  | "leaf"
  | "floret"
  | "loaf"
  | "roll"
  | "croissant"
  | "cracker"
  | "carton"
  | "cup"
  | "wedge"
  | "egg"
  | "jar"
  | "box"
  | "bag"
  | "bottle"
  | "can"
  | "frozen"
  | "pizza"
  | "fish"
  | "fries"
  | "paper"
  | "pump"
  | "tube"
  | "patty"
  | "piece";

export type ArtSpec = { kind: ArtKind; color: string; accent?: string };

export const ART: Record<string, ArtSpec> = {
  appel: { kind: "fruit", color: "#ef4b3b", accent: "#3aaa4a" },
  banaan: { kind: "banana", color: "#ffe14a", accent: "#f0b429" },
  peer: { kind: "fruit", color: "#d5e27a", accent: "#3aaa4a" },
  sinaasappel: { kind: "citrus", color: "#ff9a1f", accent: "#3aaa4a" },
  aardbei: { kind: "berry", color: "#ef3d4a", accent: "#3aaa4a" },
  druiven: { kind: "cluster", color: "#7b4ec9", accent: "#3aaa4a" },
  mandarijn: { kind: "citrus", color: "#ffb23a", accent: "#3aaa4a" },
  citroen: { kind: "citrus", color: "#ffe14a", accent: "#3aaa4a" },
  kiwi: { kind: "fruit", color: "#8dbe45", accent: "#c06a32" },
  tomaat: { kind: "fruit", color: "#ef4540", accent: "#3aaa4a" },
  komkommer: { kind: "long", color: "#3cbf6e", accent: "#1f8a45" },
  paprika: { kind: "fruit", color: "#ef5a3c", accent: "#2f8f46" },
  wortel: { kind: "root", color: "#ff8a1a", accent: "#3aaa4a" },
  broccoli: { kind: "floret", color: "#2f9a49", accent: "#6dce73" },
  sla: { kind: "leaf", color: "#7dce55", accent: "#3aaa4a" },
  avocado: { kind: "fruit", color: "#5a8f3a", accent: "#c9a15b" },
  aardappel: { kind: "fruit", color: "#e2b15a", accent: "#c48a3a" },
  ui: { kind: "fruit", color: "#f3d7b0", accent: "#c48a3a" },
  champignons: { kind: "cluster", color: "#f4efe4", accent: "#d9c7b0" },
  courgette: { kind: "long", color: "#6aaa3a", accent: "#3d7a28" },
  sperziebonen: { kind: "long", color: "#3cbf6e", accent: "#1f8a45" },
  prei: { kind: "root", color: "#f4f7ef", accent: "#3aaa4a" },
  brood: { kind: "loaf", color: "#f0b15a", accent: "#c47a32" },
  volkorenbrood: { kind: "loaf", color: "#c47a3a", accent: "#8a4e22" },
  bolletjes: { kind: "roll", color: "#f2c27a", accent: "#e0a050" },
  croissant: { kind: "croissant", color: "#f0b15a", accent: "#e08a32" },
  beschuit: { kind: "cracker", color: "#f6e2b8", accent: "#e2c48a" },
  crackers: { kind: "cracker", color: "#e8c07a", accent: "#c48a3a" },
  stokbrood: { kind: "long", color: "#f0b15a", accent: "#c47a32" },
  pita: { kind: "roll", color: "#f3d2a0", accent: "#e0b070" },
  wraps: { kind: "roll", color: "#f6e3c0", accent: "#e2b56a" },
  pasta: { kind: "bag", color: "#f2c14a", accent: "#e08a32" },
  rijst: { kind: "bag", color: "#f7f1e4", accent: "#e2c9a0" },
  havermout: { kind: "bag", color: "#e7d3a4", accent: "#c4a060" },
  pindakaas: { kind: "jar", color: "#e2a04a", accent: "#c47a22" },
  jam: { kind: "jar", color: "#d23b4a", accent: "#f2c14a" },
  hagelslag: { kind: "box", color: "#ff8a1a", accent: "#5b4636" },
  ontbijtgranen: { kind: "box", color: "#ffd23a", accent: "#ef6a2a" },
  muesli: { kind: "bag", color: "#d8b06a", accent: "#8a5a32" },
  tomatenpuree: { kind: "can", color: "#ef4540", accent: "#c43030" },
  soep: { kind: "can", color: "#ef6a32", accent: "#f2c14a" },
  olijfolie: { kind: "bottle", color: "#d7e07a", accent: "#7a8a32" },
  bloem: { kind: "bag", color: "#f7f4ee", accent: "#d9d0c4" },
  suiker: { kind: "bag", color: "#fffdf8", accent: "#e7e0d6" },
  koffie: { kind: "bag", color: "#6b4634", accent: "#3d2a22" },
  thee: { kind: "box", color: "#7dbe6a", accent: "#ef6a4a" },
  koekjes: { kind: "box", color: "#f0a03a", accent: "#c47a32" },
  chips: { kind: "bag", color: "#ffd23a", accent: "#ef4b3b" },
  pastasaus: { kind: "jar", color: "#d23b3b", accent: "#7a9a3a" },
  mais: { kind: "can", color: "#ffe14a", accent: "#f0b429" },
  honing: { kind: "jar", color: "#f0a81a", accent: "#e08a10" },
  sinaasappelsap: { kind: "carton", color: "#ff9a1f", accent: "#ffd23a" },
  water: { kind: "bottle", color: "#d7f4ff", accent: "#7ec8e8" },
  melk: { kind: "carton", color: "#f7f4ee", accent: "#3aa0d8" },
  yoghurt: { kind: "cup", color: "#fffdf8", accent: "#f2b4c8" },
  kwark: { kind: "cup", color: "#fffdf8", accent: "#d9d6f0" },
  kaas: { kind: "wedge", color: "#ffd23a", accent: "#f0a81a" },
  boter: { kind: "box", color: "#ffe14a", accent: "#f0c14a" },
  eieren: { kind: "egg", color: "#f6e7c4", accent: "#e2c48a" },
  slagroom: { kind: "carton", color: "#fffdf8", accent: "#f2c14a" },
  vla: { kind: "cup", color: "#ffe7a8", accent: "#f0b429" },
  karnemelk: { kind: "carton", color: "#f7f4ee", accent: "#7dbe6a" },
  roomkaas: { kind: "cup", color: "#fffdf8", accent: "#f2d2a0" },
  kipfilet: { kind: "piece", color: "#f6c9a8", accent: "#e2a888" },
  gehakt: { kind: "patty", color: "#d06a55", accent: "#a84838" },
  zalm: { kind: "fish", color: "#ff8a6a", accent: "#f2c14a" },
  doperwten: { kind: "frozen", color: "#7dce55", accent: "#3aaa4a" },
  ijs: { kind: "cup", color: "#f7c2d4", accent: "#fffdf8" },
  pizza: { kind: "pizza", color: "#f0b15a", accent: "#ef4540" },
  vissticks: { kind: "frozen", color: "#f0b15a", accent: "#e08a32" },
  spinazie: { kind: "frozen", color: "#3c8a45", accent: "#7dce55" },
  friet: { kind: "fries", color: "#ffe14a", accent: "#ef4b3b" },
  diepvriesbrood: { kind: "frozen", color: "#f2c27a", accent: "#d7e7f4" },
  bessen: { kind: "frozen", color: "#7b4ec9", accent: "#ef3d6a" },
  toiletpapier: { kind: "paper", color: "#fffdf8", accent: "#d7e7f4" },
  keukenpapier: { kind: "paper", color: "#fffdf8", accent: "#f2c14a" },
  afwasmiddel: { kind: "pump", color: "#7ec8e8", accent: "#3aa0d8" },
  wasmiddel: { kind: "bottle", color: "#6ec8e0", accent: "#2f7ed1" },
  vuilniszakken: { kind: "box", color: "#5b8a6a", accent: "#243038" },
  handzeep: { kind: "pump", color: "#f7c2d4", accent: "#ef6a8a" },
  tandpasta: { kind: "tube", color: "#7ec8e8", accent: "#fffdf8" },
  shampoo: { kind: "pump", color: "#d9b4f2", accent: "#9a6ad1" },
  schoonmaakmiddel: { kind: "bottle", color: "#b7e37a", accent: "#3aaa4a" },
  vaatwastabletten: { kind: "box", color: "#7ec8e8", accent: "#2f7ed1" },
};
