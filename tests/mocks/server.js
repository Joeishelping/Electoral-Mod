// Minimal in-memory stand-in for @minecraft/server, enough to drive the scripts in Node.

const props = new Map();
export const _messages = [];
export const _hooks = { startup: [], scriptEvent: [], worldLoad: [], interval: [], playerSpawn: [], itemUse: [] };
export const InputButton = { Jump: "Jump", Sneak: "Sneak" };
export const ButtonState = { Pressed: "Pressed", Released: "Released" };
export const InputPermissionCategory = { Camera: 1, Movement: 2, LateralMovement: 4, Sneak: 5, Jump: 6, Mount: 7, Dismount: 8, MoveForward: 9, MoveBackward: 10, MoveLeft: 11, MoveRight: 12 };
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 };
export const CustomCommandStatus = { Success: "Success", Failure: "Failure" };
export const _players = [];

export const DisplaySlotId = { Sidebar: "sidebar", List: "list", BelowName: "belowname" };
export const ObjectiveSortOrder = { Ascending: 0, Descending: 1 };
const objectives = new Map();
export const _sidebar = { objective: null };
const scoreboard = {
  getObjective: (id) => objectives.get(id),
  addObjective: (id, name) => {
    if (objectives.has(id)) throw new Error(`objective ${id} exists`);
    if (typeof name !== "string" || name.length > 32) throw new Error(`bad objective name: ${name}`);
    const scores = new Map();
    const obj = { id, displayName: name, scores, setScore: (p, v) => { if (!Number.isInteger(v)) throw new Error(`score must be int: ${v}`); scores.set(p, v); } };
    objectives.set(id, obj);
    return obj;
  },
  removeObjective: (id) => objectives.delete(id),
  setObjectiveAtDisplaySlot: (slot, { objective }) => { _sidebar.objective = objective; },
};

// A tiny voxel world: blocks the scripts place, plus generated terrain underneath.
export const _blocks = new Map();
export const _entities = [];
function terrainAt(x, z) {
  const t = Math.sin(x / 90) + Math.cos(z / 70);
  return t > 1.2 ? "minecraft:water" : t < -1.3 ? "minecraft:sand" : t > 0.6 ? "minecraft:oak_leaves" : "minecraft:grass_block";
}
function makeBlock(x, y, z) {
  const k = `${x},${y},${z}`;
  return {
    get typeId() { return _blocks.get(k) || (y === 64 ? terrainAt(x, z) : "minecraft:air"); },
    get isAir() { return this.typeId === "minecraft:air"; },
    location: { x, y, z },
    below: (n = 1) => makeBlock(x, y - n, z),
    setType(t) {
      if (typeof t !== "string" || !t.startsWith("minecraft:")) throw new Error(`bad block type ${t}`);
      _blocks.set(k, t);
    },
  };
}
export const _commands = [];
export const _overworld = {
  id: "minecraft:overworld",
  runCommand(cmd) {
    _commands.push(cmd);
    return { successCount: 1 };
  },
  getBlock: ({ x, y, z }) => (Math.abs(x) > 30000 || Math.abs(z) > 30000 ? undefined : makeBlock(Math.floor(x), Math.floor(y), Math.floor(z))),
  getTopmostBlock: ({ x, z }) => makeBlock(Math.floor(x), 64, Math.floor(z)),
  spawnEntity(type, loc) {
    const e = { typeId: type, location: loc, nameTag: "", tags: new Set(), addTag(t) { this.tags.add(t); }, remove() { _entities.splice(_entities.indexOf(this), 1); } };
    _entities.push(e);
    return e;
  },
  getEntities: ({ type, tags = [] } = {}) => _entities.filter((e) => (!type || e.typeId === type) && tags.every((t) => e.tags.has(t))),
};

export class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
  }
}

export const world = {
  getDimension: () => _overworld,
  scoreboard,
  getDynamicProperty: (k) => props.get(k),
  getDynamicPropertyIds: () => [...props.keys()],
  setDynamicProperty: (k, v) => {
    if (v === undefined) props.delete(k);
    else {
      if (typeof v === "string" && v.length > 32767) throw new Error(`dynamic property too long: ${v.length}`);
      props.set(k, v);
    }
  },
  sendMessage: (m) => _messages.push(m),
  getPlayers: ({ name } = {}) => _players.filter((p) => !name || p.name === name),
  afterEvents: { worldLoad: { subscribe: (cb) => _hooks.worldLoad.push(cb) }, playerSpawn: { subscribe: (cb) => _hooks.playerSpawn.push(cb) }, itemUse: { subscribe: (cb) => _hooks.itemUse.push(cb) } },
};

export const system = {
  run: (fn) => setImmediate(fn),
  runTimeout: (fn) => setImmediate(fn),
  runInterval: (fn) => { _hooks.interval.push(fn); return _hooks.interval.length; },
  runJob: (gen) => {
    const step = () => {
      for (let i = 0; i < 10; i++) if (gen.next().done) return;
      setImmediate(step);
    };
    setImmediate(step);
  },
  beforeEvents: { startup: { subscribe: (cb) => _hooks.startup.push(cb) } },
  afterEvents: { scriptEventReceive: { subscribe: (cb) => _hooks.scriptEvent.push(cb) } },
};

export const _props = props;
