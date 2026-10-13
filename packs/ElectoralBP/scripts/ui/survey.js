// Fills in the map wherever someone is looking at it, without anyone walking
// there: for each patch of the view that nobody has seen, a ticking area loads
// it for a moment (generating it if the world hasn't yet), the land is read from
// above, and the ticking area is removed again.
//
// Zoomed in, whole 128x128-block patches are read at full detail. Zoomed far
// out, only one chunk in the middle of each patch is loaded for a rough colour,
// which is much faster and is all the map can show at that scale anyway.

import { system, world } from "@minecraft/server";
import { CELL, MH, W } from "../engine/mapview.js";
import { regionInfo, saveTerrain, SIDE } from "../core/terrain.js";
import { sampleCell } from "./explore.js";

const SLOTS = 8; // ticking areas used at once (worlds allow 10)

const AREA = "electoral_survey_";
const PATCH = SIDE * CELL; // 128 blocks
const LOAD_TIMEOUT = 600; // ticks to wait for a patch to load before giving up for a while

const slots = new Array(SLOTS).fill(null);
const queues = new Map(); // viewer id -> { key, gen }
const failed = new Map(); // "rx,rz,mode" -> tick it may be retried
let ticks = 0;
let cleaned = false;
export let surveyVersion = 0; // goes up whenever new land has been read

const dim = () => world.getDimension("minecraft:overworld");

function command(cmd) {
  try {
    const r = dim().runCommand(cmd);
    return (r?.successCount ?? 1) > 0;
  } catch {
    return false;
  }
}

function loaded(job) {
  try {
    const d = dim();
    for (const [x, z] of job.probes) if (!d.getBlock({ x, y: 0, z })) return false;
    return true;
  } catch {
    return false;
  }
}

/** Patches covering a view, nearest the middle first. */
function* patches(view) {
  yield* ring(view, "coarse");
  if (view.zoom < 32) yield* ring(view, "full");
}

// zoomed far out, one rough sample stands in for a 2x2 or 4x4 block of patches
const spreadFor = (zoom) => (zoom >= 128 ? 4 : zoom >= 64 ? 2 : 1);

function* ring(view, mode) {
  const step = mode === "coarse" ? spreadFor(view.zoom) : 1;
  const halfW = (W / 2) * view.zoom;
  const halfH = (MH / 2) * view.zoom;
  const r0x = Math.floor((view.x - halfW) / PATCH);
  const r1x = Math.floor((view.x + halfW) / PATCH);
  const r0z = Math.floor((view.z - halfH) / PATCH);
  const r1z = Math.floor((view.z + halfH) / PATCH);
  const cx = Math.floor(view.x / PATCH);
  const cz = Math.floor(view.z / PATCH);
  const reach = Math.max(cx - r0x, r1x - cx, cz - r0z, r1z - cz);
  const inView = (x, z) => x >= r0x && x <= r1x && z >= r0z && z <= r1z;
  const on = (x, z) => inView(x, z) && x % step === 0 && z % step === 0;
  if (on(cx, cz)) yield [cx, cz, mode];
  for (let r = 1; r <= reach; r++) {
    for (let k = -r; k < r; k++) {
      for (const [x, z] of [[cx + k, cz - r], [cx + r, cz + k], [cx - k, cz + r], [cx - r, cz - k]]) if (on(x, z)) yield [x, z, mode];
    }
  }
}

const needed = (rx, rz, mode) => (mode === "coarse" ? !regionInfo.hasCoarse(rx, rz) && !regionInfo.isFull(rx, rz) : !regionInfo.isFull(rx, rz));
const busyKey = (rx, rz, mode) => `${rx},${rz},${mode}`;
const jobKeys = (j) => j.list.map(([x, z]) => busyKey(x, z, j.mode));

function nextPatch(viewers) {
  const busy = new Set(slots.filter(Boolean).flatMap(jobKeys));
  for (const { id, view } of viewers) {
    const key = `${view.x},${view.z},${view.zoom}`;
    let q = queues.get(id);
    if (!q || q.key !== key) queues.set(id, (q = { key, gen: patches(view) }));
    for (let checks = 0; checks < 200; checks++) {
      const next = q.gen.next();
      if (next.done) {
        // start over later: anything that failed gets another go
        if (ticks % 100 === 0) queues.delete(id);
        break;
      }
      const [rx, rz, mode] = next.value;
      const k = busyKey(rx, rz, mode);
      if (busy.has(k) || (failed.get(k) || 0) > ticks || !needed(rx, rz, mode)) continue;
      return { rx, rz, mode, list: [[rx, rz]], spread: mode === "coarse" ? spreadFor(view.zoom) : 1 };
    }
  }
  return null;
}

function start(slot, p) {
  const x0 = p.rx * PATCH;
  const z0 = p.rz * PATCH;
  const job = { ...p, name: `${AREA}${slot}`, started: ticks, phase: "loading", area: false };
  if (p.mode === "full") {
    job.box = [x0, z0, x0 + PATCH - 1, z0 + PATCH - 1];
    job.probes = [[x0 + 1, z0 + 1], [x0 + PATCH - 2, z0 + 1], [x0 + 1, z0 + PATCH - 2], [x0 + PATCH - 2, z0 + PATCH - 2]];
  } else {
    const m = PATCH / 2;
    job.box = [x0 + m, z0 + m, x0 + m + 15, z0 + m + 15];
    job.probes = [[x0 + m + 2, z0 + m + 2]];
  }
  // already loaded (a player is nearby)? then no ticking area is needed
  if (!loaded(job)) {
    const [a, b, c, d] = job.box;
    command(`tickingarea remove ${job.name}`);
    if (!command(`tickingarea add ${a} 0 ${b} ${c} 0 ${d} ${job.name}`)) {
      for (const k of jobKeys(job)) failed.set(k, ticks + 400);
      return;
    }
    job.area = true;
  }
  slots[slot] = job;
}

function finishJob(slot) {
  const job = slots[slot];
  slots[slot] = null;
  if (job.area) command(`tickingarea remove ${job.name}`);
}

function sample(job) {
  const d = dim();
  job.phase = "reading";
  const run = function* () {
    try {
      const mid = SIDE / 2;
      for (const [rx, rz] of job.list) {
        const centre = sampleCell(d, rx * SIDE + mid, rz * SIDE + mid);
        if (!centre) continue;
        regionInfo.setCoarse(rx, rz, centre.color, centre.y);
        // stand-in colour for the neighbours this sample covers
        for (let dx = 0; dx < job.spread; dx++) for (let dz = 0; dz < job.spread; dz++) if ((dx || dz) && !regionInfo.hasCoarse(rx + dx, rz + dz)) regionInfo.setCoarse(rx + dx, rz + dz, centre.color, centre.y);
      }
      if (job.mode === "full") {
        let n = 0;
        for (let i = 0; i < SIDE; i++) {
          for (let k = 0; k < SIDE; k++) {
            sampleCell(d, job.rx * SIDE + i, job.rz * SIDE + k);
            if (++n % 48 === 0) yield;
          }
        }
        regionInfo.setFull(job.rx, job.rz);
      }
      surveyVersion += job.list.length;
    } finally {
      job.phase = "done";
    }
  };
  system.runJob(run());
}

// extra views to fill in without anyone looking (the diag command): id -> view
export const extraViews = new Map();

/** Called every tick with the views of everyone who has the map open. */
export function surveyTick(viewers) {
  ticks++;
  if (extraViews.size) viewers = [...viewers, ...[...extraViews].map(([id, view]) => ({ id, view }))];
  if (!cleaned) {
    cleaned = true;
    for (let s = 0; s < SLOTS; s++) command(`tickingarea remove ${AREA}${s}`); // left over from a crash
  }
  for (let s = 0; s < SLOTS; s++) {
    const job = slots[s];
    if (!job) continue;
    if (job.phase === "loading") {
      if (loaded(job)) sample(job);
      else if (ticks - job.started > LOAD_TIMEOUT) {
        for (const k of jobKeys(job)) failed.set(k, ticks + 1200);
        finishJob(s);
      }
    } else if (job.phase === "done") finishJob(s);
  }
  if (!viewers.length) {
    queues.clear();
    return;
  }
  if (ticks % 2 === 0) {
    const free = slots.indexOf(null);
    if (free >= 0) {
      const p = nextPatch(viewers);
      if (p) start(free, p);
    }
  }
  if (ticks % 200 === 0) saveTerrain(16);
}

/** How many patches are being read right now (for the map's info bar). */
export const surveying = () => slots.filter(Boolean).reduce((n, j) => n + j.list.length, 0);
