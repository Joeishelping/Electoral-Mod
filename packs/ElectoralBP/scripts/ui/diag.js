// /scriptevent electoral:diag - prints a health check to the server console and
// chat: which APIs this Minecraft version has, and how long the map takes to draw.

import { system, world, InputButton, InputPermissionCategory } from "@minecraft/server";
import { getState } from "../core/storage.js";
import { terrain } from "../core/terrain.js";
import { compose, cursorPixels, decorations, drawBase, finish, MH, newFrame, W } from "../engine/mapview.js";
import { extraViews, surveying, surveyVersion } from "./survey.js";
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

/** /scriptevent electoral:survey <x> <z> <zoom> - fills in the map around a spot as if someone were looking at it. */
export function diagSurvey(x = 0, z = 0, zoom = 4) {
  const view = { x, z, zoom };
  const start = Date.now();
  const v0 = surveyVersion;
  let n = 0;
  const id = system.runInterval(() => {
    n++;
    extraViews.set("diag", view);
    if (n % 100 === 0) out(`survey: ${surveyVersion - v0} patches read in ${((Date.now() - start) / 1000).toFixed(1)} s (${surveying()} in progress)`);
    if (n >= 1200) {
      system.clearRun(id);
      extraViews.delete("diag");
      const frame = newFrame({ x, z, zoom, mode: "political", persp: null });
      finish(drawBase(getState(), terrain, frame));
      let known = 0;
      for (let i = 0; i < W; i += 4) for (let j = 0; j < MH; j += 4) if (terrain.color(Math.floor((x + (i - W / 2) * zoom) / 4), Math.floor((z + (j - MH / 2) * zoom) / 4)) >= 0) known++;
      out(`survey done: ${surveyVersion - v0} patches; ${Math.round((known / ((W / 4) * (MH / 4))) * 100)}% of the view filled`);
    }
  }, 1);
}
