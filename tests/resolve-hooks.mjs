const MAP = {
  "@minecraft/server": new URL("./mocks/server.js", import.meta.url).href,
  "@minecraft/server-ui": new URL("./mocks/server-ui.js", import.meta.url).href,
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: MAP[specifier], shortCircuit: true };
  return next(specifier, context);
}
