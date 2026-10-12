// Electoral Board Table - entry point.
// Interact with a Board Table block (or run /scriptevent electoral:open) to open the board.

import { CommandPermissionLevel, CustomCommandStatus, system, world } from "@minecraft/server";
import { getState } from "./core/storage.js";
import { openBoard } from "./ui/board.js";
import { nightInProgress, startTheme, tick } from "./ui/ticker.js";
import { closeMapView, flushMapEdits, inMapView, MAP_ITEM, mapTick, openMapView, releaseIfStuck } from "./ui/mapscreen.js";
import { exploreTick } from "./ui/explore.js";
import { dropLegacyTerrain } from "./core/terrain.js";
import { diag } from "./ui/diag.js";

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

function toggleMap(player) {
  if (!player) return;
  if (inMapView(player)) closeMapView(player);
  else openMapView(player);
}

// The World Map item: use it to open (or close) the map screen.
world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.typeId === MAP_ITEM) toggleMap(event.source);
});

system.beforeEvents.startup.subscribe(({ blockComponentRegistry, customCommandRegistry }) => {
  // /electoral:map opens the map for anyone
  try {
    customCommandRegistry.registerCommand(
      { name: "electoral:map", description: "Open the ElectoralV2 world map", permissionLevel: CommandPermissionLevel?.Any ?? 0, cheatsRequired: false },
      (origin) => {
        const id = origin?.sourceEntity?.id;
        system.run(() => toggleMap(world.getPlayers().find((p) => p.id === id)));
        return { status: CustomCommandStatus?.Success ?? 0 };
      },
    );
  } catch {
    // custom commands unavailable - the item, the Board Table and /scriptevent electoral:map still work
  }
  blockComponentRegistry.registerCustomComponent("electoral:board_table", {
    onPlayerInteract(event) {
      const player = event.player;
      if (player) system.run(() => openFor(player));
    },
  });
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id === "electoral:diag") {
    const [x, z] = event.message.split(/\s+/).map(Number);
    diag(x || 0, z || 0);
    return;
  }
  if (event.id === "electoral:map") {
    const src = event.sourceEntity;
    if (src && src.typeId === "minecraft:player") toggleMap(src);
    else toggleMap(world.getPlayers({ name: event.message.trim() })[0]);
    return;
  }
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
  dropLegacyTerrain();
  for (const p of world.getPlayers()) releaseIfStuck(p);
  // the map screen and terrain mapping run every tick
  system.runInterval(() => {
    try {
      mapTick();
      flushMapEdits();
      exploreTick();
    } catch (e) {
      console.warn(`[Electoral] map tick failed: ${e}`);
    }
  }, 1);
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
  releaseIfStuck(event.player); // left the game with the map open
  try {
    if (nightInProgress()) system.runTimeout(() => startTheme(event.player), 40);
  } catch {
    // ignore
  }
});
