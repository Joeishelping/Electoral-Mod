// Minimal in-memory stand-in for @minecraft/server, enough to drive the scripts in Node.

const props = new Map();
export const _messages = [];
export const _hooks = { startup: [], scriptEvent: [], worldLoad: [], interval: [] };
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

export const world = {
  scoreboard,
  getDynamicProperty: (k) => props.get(k),
  setDynamicProperty: (k, v) => {
    if (v === undefined) props.delete(k);
    else {
      if (typeof v === "string" && v.length > 32767) throw new Error(`dynamic property too long: ${v.length}`);
      props.set(k, v);
    }
  },
  sendMessage: (m) => _messages.push(m),
  getPlayers: ({ name } = {}) => _players.filter((p) => !name || p.name === name),
  afterEvents: { worldLoad: { subscribe: (cb) => _hooks.worldLoad.push(cb) } },
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
