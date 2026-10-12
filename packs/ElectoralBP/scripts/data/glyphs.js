// Custom map tiles from the resource pack (font/glyph_E1.png -> U+E100..U+E1FF).

const g = (i) => String.fromCharCode(0xe100 + i);
const CODES = "0123456789abcdef";

/** Solid tile in a Minecraft color code ("§c" -> red). */
export function tile(color, dark = false) {
  const i = Math.max(0, CODES.indexOf((color || "§7").slice(-1)));
  return g(i + (dark ? 16 : 0));
}

export const GLYPH = {
  wild: g(0x20),
  you: g(0x21),
  situation: [g(0x22), g(0x23), g(0x24)], // low, serious, critical
  front: g(0x25),
  opportunity: g(0x26),
};
