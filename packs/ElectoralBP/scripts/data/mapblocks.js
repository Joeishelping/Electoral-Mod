// Blocks used to build the War Table map.

// Terrain classes (one character each, stored per explored chunk).
export const TERRAIN = {
  w: { name: "Water", block: "minecraft:light_blue_terracotta" },
  i: { name: "Ice", block: "minecraft:packed_ice" },
  s: { name: "Snow", block: "minecraft:snow" },
  d: { name: "Desert", block: "minecraft:sandstone" },
  r: { name: "Badlands", block: "minecraft:red_sandstone" },
  f: { name: "Forest", block: "minecraft:moss_block" },
  g: { name: "Grassland", block: "minecraft:grass_block" },
  m: { name: "Mountains", block: "minecraft:stone" },
  b: { name: "Dirt & Swamp", block: "minecraft:coarse_dirt" },
  u: { name: "Settlement", block: "minecraft:polished_andesite" },
  l: { name: "Lava", block: "minecraft:magma" },
};
export const UNKNOWN_BLOCK = "minecraft:deepslate_tiles"; // unexplored fog
export const BASE_BLOCK = "minecraft:smooth_stone"; // under the map, keeps blocks supported

const COLOR_NAMES = {
  0: "black", 1: "blue", 2: "green", 3: "cyan", 4: "red", 5: "purple", 6: "orange", 7: "light_gray",
  8: "gray", 9: "light_blue", a: "lime", b: "cyan", c: "red", d: "magenta", e: "yellow", f: "white",
};
// a couple of codes share a dye; nudge them apart
const FILL_OVERRIDE = { b: "minecraft:light_blue_concrete", 9: "minecraft:blue_concrete", 1: "minecraft:blue_terracotta", 4: "minecraft:red_terracotta", c: "minecraft:red_concrete", 3: "minecraft:cyan_concrete" };

/** Solid territory block for a Minecraft color code ("§c"). */
export function fillBlock(color) {
  const code = (color || "§7").slice(-1);
  return FILL_OVERRIDE[code] || `minecraft:${COLOR_NAMES[code] || "light_gray"}_concrete`;
}

/** Border block of the same color (wool reads as an outline next to concrete). */
export function edgeBlock(color) {
  const code = (color || "§7").slice(-1);
  return `minecraft:${COLOR_NAMES[code] || "light_gray"}_wool`;
}

export const FRONT_BLOCK = "minecraft:redstone_block";
// Markers stand one block above the map.
export const MARKERS = {
  0: "minecraft:torch", // minor situation
  1: "minecraft:lantern", // serious
  2: "minecraft:redstone_torch", // critical
  opportunity: "minecraft:end_rod",
};

/** Classifies the topmost block of a chunk. */
export function classify(typeId, y) {
  const t = (typeId || "").replace("minecraft:", "");
  if (!t || t === "air") return null;
  if (t.includes("water") || t === "kelp" || t === "seagrass" || t.includes("coral")) return "w";
  if (t.includes("lava")) return "l";
  if (t.includes("ice")) return "i";
  if (t.includes("snow")) return "s";
  if (t === "red_sand" || t.includes("red_sandstone") || t.includes("terracotta")) return "r";
  if (t.includes("sand") || t === "cactus" || t === "dead_bush") return "d";
  if (t.includes("leaves") || t.includes("log") || t.endsWith("_wood") || t.includes("mangrove") || t.includes("bamboo")) return "f";
  if (t.includes("stone") || t.includes("deepslate") || t.includes("andesite") || t.includes("diorite") || t.includes("granite") || t === "gravel" || t === "tuff" || t === "calcite") return y > 100 ? "m" : "m";
  if (t.includes("grass") || t.includes("flower") || t.includes("tulip") || t.includes("fern") || t === "dandelion" || t === "poppy" || t.includes("daisy") || t.includes("orchid") || t === "allium" || t === "cornflower") return y > 110 ? "m" : "g";
  if (t.includes("dirt") || t === "podzol" || t === "mud" || t === "mycelium" || t.includes("mangrove_roots") || t === "clay" || t.includes("moss")) return "b";
  return "u"; // anything built by players
}
