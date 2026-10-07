// Electoral Board Table - entry point.
// Interact with a Board Table block (or run /scriptevent electoral:open) to open the board.

import { system, world } from "@minecraft/server";
import { getState } from "./core/storage.js";
import { openBoard } from "./ui/board.js";

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

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
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
  const name = event.message.trim();
  const target = world.getPlayers({ name })[0];
  if (target) openFor(target);
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    getState();
  } catch (e) {
    console.warn(`[Electoral] load failed: ${e}`);
  }
});
