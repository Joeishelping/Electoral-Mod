// Electoral Board Table - entry point.
// Interact with a Board Table block (or run /scriptevent electoral:open) to open the board.

import { system, world } from "@minecraft/server";
import { getState } from "./core/storage.js";
import { openBoard } from "./ui/board.js";
import { nightInProgress, startTheme, tick } from "./ui/ticker.js";
import { brushOn, renderAll } from "./ui/wartable.js";
import { chooseBrush } from "./ui/map.js";

const open = new Set();

async function openFor(player) {
  if (!player || open.has(player.id)) return;
  open.add(player.id);
  try {
    getState();
    await openBoard(player);
  } catch (e) {
    console.warn(`[Electoral] ${e}\n${e?.stack ?? ""}`);
    try {
      player.sendMessage(`§c[Board] Something went wrong: ${e}`);
    } catch {
      // player left
    }
  } finally {
    open.delete(player.id);
  }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry, itemComponentRegistry }) => {
  // The Map Brush: right-click the air to pick what to paint, right-click a War Table square to paint it.
  itemComponentRegistry.registerCustomComponent("electoral:map_brush", {
    onUse(event) {
      const player = event.source;
      if (player) system.run(() => chooseBrush(player).catch(() => {}));
    },
    onUseOn(event) {
      const player = event.source;
      const block = event.block;
      if (player && block) system.run(() => brushOn(player, block));
    },
  });
  blockComponentRegistry.registerCustomComponent("electoral:board_table", {
    onPlayerInteract(event) {
      const player = event.player;
      if (player) system.run(() => openFor(player));
    },
  });
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== "electoral:open") return;
  const src = event.sourceEntity;
  if (src && src.typeId === "minecraft:player") {
    openFor(src);
    return;
  }
  // From a command block / server console: open for the named player
  const target = world.getPlayers({ name: event.message.trim() })[0];
  if (target) openFor(target);
});

world.afterEvents.worldLoad.subscribe(() => {
  getState();
  system.runTimeout(() => renderAll(true), 100); // rebuild War Tables after a restart
  system.runInterval(() => {
    try {
      tick();
    } catch (e) {
      console.warn(`[Electoral] tick failed: ${e}`);
    }
  }, 20);
});

// Players who join (or respawn into the world) mid-night hear the theme too.
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  try {
    if (nightInProgress()) system.runTimeout(() => startTheme(event.player), 40);
  } catch {
    // ignore
  }
});
