// /scriptevent electoral:diag - prints a health check to the server console and
// chat: which APIs this Minecraft version has, and how long the map takes to draw.

import { world, InputButton, InputPermissionCategory } from "@minecraft/server";
import { getState } from "../core/storage.js";
import { terrain } from "../core/terrain.js";
import { compose, cursorPixels, decorations, drawBase, finish, newFrame } from "../engine/mapview.js";
import { sampleCell } from "./explore.js";

function out(line) {
  console.warn(`[Electoral diag] ${line}`);
  try {
    world.sendMessage(`§7[diag] ${line}`);
  } catch {
    // no players
  }
}

export function diag(x = 0, z = 0) {
  const d = world.getDimension("minecraft:overworld");
  out(`InputButton: ${!!InputButton} · InputPermissionCategory: ${!!InputPermissionCategory} · getTopmostBlock: ${typeof d.getTopmostBlock}`);
  let t = Date.now();
  let found = 0;
  for (let cx = -16; cx < 16; cx++) for (let cz = -16; cz < 16; cz++) if (sampleCell(d, Math.floor(x / 4) + cx, Math.floor(z / 4) + cz)) found++;
  out(`sampled ${found}/1024 terrain spots in ${Date.now() - t} ms`);
  // drawn in one go here to time it; the map screen spreads it over several ticks
  const frame = newFrame({ x, z, zoom: 2, mode: "political", persp: null });
  t = Date.now();
  finish(drawBase(getState(), terrain, frame));
  const drawn = Date.now() - t;
  t = Date.now();
  const deco = decorations(getState(), frame);
  const text = compose(frame, [deco, cursorPixels(90, 43)], ["DIAG", "1:2"], ["HELLO", "0 0"]);
  const first = Date.now() - t;
  t = Date.now();
  compose(frame, [deco, cursorPixels(100, 40)], ["DIAG", "1:2"], ["MOVED", "0 0"]);
  out(`map drawn in ${drawn} ms; screen text (${text.length} chars) built in ${first} ms, then ${Date.now() - t} ms per cursor move`);
}
