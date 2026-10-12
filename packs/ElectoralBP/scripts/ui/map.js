// Board Table -> World Map: opens the full-screen map (see mapscreen.js).

import { openMapView } from "./mapscreen.js";
import { CLOSE } from "./nav.js";

/** Closes the board's menus and opens the map, optionally in one country's view. */
export function openMap(player, perspective = null) {
  openMapView(player, { persp: perspective });
  return CLOSE;
}
