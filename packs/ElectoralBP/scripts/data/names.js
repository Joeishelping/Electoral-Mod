// Fictional name generation for regions, people, parties, clans and nations.

const FIRST = [
  "Aldric", "Bryn", "Cass", "Dorian", "Elra", "Fenn", "Garrick", "Hale", "Isolde", "Joren",
  "Kael", "Lysa", "Maren", "Nolan", "Orrin", "Perrin", "Quill", "Rowan", "Sable", "Tamsin",
  "Ulric", "Vera", "Wren", "Xander", "Yara", "Zeke", "Ansel", "Brielle", "Corwin", "Delia",
  "Edric", "Faye", "Gideon", "Hollis", "Ivo", "Juna", "Kestrel", "Linnea", "Merrick", "Nessa",
  "Oswin", "Petra", "Rhosyn", "Soren", "Thea", "Varek", "Willa", "Yorick", "Zinnia", "Briar",
];
const SUR_A = ["Ash", "Iron", "Stone", "Copper", "Oak", "Raven", "Silver", "Thorn", "Wolf", "Gold", "Frost", "Ember", "Moss", "Storm", "Birch", "Flint", "Lapis", "Redstone", "Obsidian", "Willow"];
const SUR_B = ["wood", "field", "brook", "ridge", "vale", "hart", "mere", "forge", "well", "ford", "crest", "hollow", "shield", "wright", "bane", "son", "more", "gate", "keep", "lock"];
const PLACE_A = ["North", "South", "East", "West", "High", "Low", "Old", "New", "Deep", "Bright", "Grey", "Green", "Red", "Black", "White", "Cold", "Sun", "Moon", "Star", "Mist"];
const PLACE_B = ["haven", "reach", "march", "fell", "shire", "port", "watch", "moor", "glen", "crag", "hold", "barrow", "vale", "water", "wood", "stead", "bridge", "spire", "cliff", "fields"];
const PARTY_A = ["Union", "League", "Front", "Movement", "Alliance", "Assembly", "Coalition", "Society", "Circle", "Bloc"];
const PARTY_B = {
  economy: "Free Market", welfare: "Common Welfare", labor: "Workers'", military: "Shield", order: "Order",
  tradition: "Heritage", environment: "Greenland", trade: "Open Seas", expansion: "Frontier", infrastructure: "Builders'",
  authority: "Unity", settlers: "Open Gate",
};
const NATION_A = ["Republic", "Dominion", "Realm", "Union", "Free State", "Commonwealth", "Confederacy", "Protectorate", "Kingdom", "Federation"];

export const COLORS = ["§c", "§9", "§a", "§6", "§d", "§b", "§e", "§5", "§2", "§3", "§4", "§1"];
export const COLOR_NAMES = { "§c": "Red", "§9": "Blue", "§a": "Green", "§6": "Gold", "§d": "Pink", "§b": "Aqua", "§e": "Yellow", "§5": "Purple", "§2": "Dark Green", "§3": "Teal", "§4": "Crimson", "§1": "Navy" };

export function personName(rng) {
  return `${rng.pick(FIRST)} ${rng.pick(SUR_A)}${rng.pick(SUR_B)}`;
}
export function surname(rng) {
  return `${rng.pick(SUR_A)}${rng.pick(SUR_B)}`;
}
export function firstName(rng) {
  return rng.pick(FIRST);
}
export function placeName(rng) {
  return `${rng.pick(PLACE_A)}${rng.pick(PLACE_B)}`;
}
export function partyName(rng, issueId) {
  const head = PARTY_B[issueId] || rng.pick(Object.values(PARTY_B));
  return `${head} ${rng.pick(PARTY_A)}`;
}
export function nationName(rng) {
  return `${rng.pick(NATION_A)} of ${placeName(rng)}`;
}
export function uniqueName(rng, gen, taken) {
  for (let i = 0; i < 30; i++) {
    const n = gen(rng);
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
  const n = `${gen(rng)} ${taken.size + 1}`;
  taken.add(n);
  return n;
}
