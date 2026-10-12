// Map colours for the blocks the map sees from above, as [r, g, b] in 0..1.
// Exact matches first, then rules on the block name, so modded and new blocks
// still get a sensible colour.

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const EXACT = {
  grass_block: 0x6f9b3f, dirt: 0x86603f, coarse_dirt: 0x77553a, rooted_dirt: 0x8a6448, podzol: 0x5f4422, mycelium: 0x76666e,
  farmland: 0x6b4a2c, dirt_path: 0x9a8350, grass_path: 0x9a8350, mud: 0x3c3a3d, clay: 0xa0a6b3, moss_block: 0x5a7a2c,
  sand: 0xdbcf9f, red_sand: 0xbe6a2a, sandstone: 0xd8cb98, red_sandstone: 0xb5622a, gravel: 0x857f7c, suspicious_gravel: 0x857f7c,
  stone: 0x7f7f7f, cobblestone: 0x7a7a7a, mossy_cobblestone: 0x6e7a62, andesite: 0x878787, diorite: 0xbcbcbc, granite: 0x9b6b58,
  deepslate: 0x505053, tuff: 0x6c6d66, calcite: 0xdfe0dc, dripstone_block: 0x866b5d, basalt: 0x4f4f55, blackstone: 0x2b2529,
  snow: 0xf4fbfb, snow_layer: 0xf4fbfb, powder_snow: 0xf0f6f6, ice: 0x8fb4f5, packed_ice: 0x8bade8, blue_ice: 0x74a8f0,
  water: 0x3a5fcf, flowing_water: 0x3a5fcf, lava: 0xe2621b, flowing_lava: 0xe2621b, obsidian: 0x14121d, bedrock: 0x555555,
  terracotta: 0x985e43, hardened_clay: 0x985e43, netherrack: 0x6f3433, soul_sand: 0x513e32, end_stone: 0xdcdf9e,
  cactus: 0x587d2d, pumpkin: 0xc4741b, melon_block: 0x7f9c25, hay_block: 0xb59a1f, bamboo: 0x6d9a2a, sugar_cane: 0x89b45f,
  glass: 0xc8dce6, bookshelf: 0x6b5638, crafting_table: 0x7a5a36, furnace: 0x6a6a6a, chest: 0x9b7136, barrel: 0x7f5d36,
  bricks: 0x965a4b, brick_block: 0x965a4b, stone_bricks: 0x7a7a7a, mud_bricks: 0x8c6a4f, quartz_block: 0xebe5de,
  iron_block: 0xdcdcdc, gold_block: 0xf6d23c, diamond_block: 0x62dbd5, emerald_block: 0x2ac25a, redstone_block: 0xaf1a05,
  lapis_block: 0x1f4699, coal_block: 0x101010, copper_block: 0xc06b4f, amethyst_block: 0x8662bf, slime: 0x6fbf5c,
  board_table: 0x8a5a2b,
};

// colour words in block names (wool, concrete, terracotta, glass, carpet...)
const DYES = {
  white: 0xe9ecec, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919,
  pink: 0xed8dac, gray: 0x3e4447, light_gray: 0x8e8e86, silver: 0x8e8e86, cyan: 0x158991, purple: 0x792aac,
  blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519,
};

const WOOD = {
  oak: 0xa2834f, spruce: 0x725431, birch: 0xc4b37b, jungle: 0xa0734d, acacia: 0xa85a32, dark_oak: 0x4b3219,
  mangrove: 0x763631, cherry: 0xe2b3ac, bamboo: 0xc3ad55, crimson: 0x6a344b, warped: 0x2b6963, pale_oak: 0xe6dcd6,
};

const RULES = [
  [/leaves/, (n) => (n.includes("cherry") ? 0xe7a5c0 : n.includes("azalea") ? 0x5a7d2d : n.includes("birch") ? 0x5f8b3f : n.includes("spruce") ? 0x3f6136 : n.includes("pale") ? 0x8f9a8a : 0x3c7a24)],
  [/snow/, () => 0xf4fbfb],
  [/ice/, () => 0x8fb4f5],
  [/water|bubble_column/, () => 0x3a5fcf],
  [/lava|magma/, () => 0xe2621b],
  [/grass|moss|vine|fern|azalea|lily_pad|leaf_litter/, () => 0x6f9b3f],
  [/sand/, () => 0xdbcf9f],
  [/coral/, () => 0xd8668f],
  [/mushroom/, () => 0x9b2d2d],
  [/netherrack|nylium|wart/, () => 0x6f3433],
  [/deepslate/, () => 0x505053],
  [/copper/, () => 0xc06b4f],
  [/quartz/, () => 0xebe5de],
  [/prismarine/, () => 0x63a796],
  [/purpur/, () => 0xa97ca9],
  [/blackstone/, () => 0x2b2529],
  [/stone|cobble|andesite|tuff|slab|stairs|wall/, () => 0x7f7f7f],
  [/brick/, () => 0x965a4b],
  [/rail/, () => 0x7a6a50],
  [/path|road/, () => 0x9a8350],
];

const cache = new Map();

export function blockColor(typeId) {
  const hit = cache.get(typeId);
  if (hit) return hit;
  const name = String(typeId).replace(/^[a-z0-9_]+:/, "");
  let hex = EXACT[name];
  if (hex === undefined) {
    const dye = Object.keys(DYES).sort((a, b) => b.length - a.length).find((d) => name.startsWith(`${d}_`) || name.includes(`_${d}_`));
    if (dye && /wool|concrete|terracotta|glass|carpet|candle|bed|banner|shulker|glazed/.test(name)) hex = DYES[dye];
  }
  if (hex === undefined) {
    const wood = Object.keys(WOOD).sort((a, b) => b.length - a.length).find((w) => name.startsWith(`${w}_`) || name.includes(`stripped_${w}`));
    if (wood && !name.includes("leaves")) hex = /log|wood|stem|hyphae/.test(name) && !name.includes("stripped") ? darker(WOOD[wood]) : WOOD[wood];
  }
  if (hex === undefined) {
    const rule = RULES.find(([re]) => re.test(name));
    hex = rule ? rule[1](name) : 0x8a8a7a;
  }
  const out = rgb(hex);
  cache.set(typeId, out);
  return out;
}

function darker(hex) {
  const r = Math.round(((hex >> 16) & 255) * 0.7);
  const g = Math.round(((hex >> 8) & 255) * 0.7);
  const b = Math.round((hex & 255) * 0.7);
  return (r << 16) | (g << 8) | b;
}

/** Small plants and decorations the map looks through to the ground below. */
export function seeThrough(typeId) {
  const name = String(typeId).replace(/^[a-z0-9_]+:/, "");
  if (name === "grass_block" || name === "grass_path" || name === "snow_layer") return false;
  return /^(short_grass|tall_grass|grass|fern|large_fern|deadbush|dead_bush|short_dry_grass|tall_dry_grass|bush|firefly_bush|wildflowers|pink_petals|leaf_litter|seagrass|kelp|vine|sapling|torch|.*_torch|lantern|.*_flower|dandelion|poppy|.*_tulip|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|sweet_berry_bush|.*_sapling|.*_carpet|structure_void|light_block.*)$/.test(name);
}
