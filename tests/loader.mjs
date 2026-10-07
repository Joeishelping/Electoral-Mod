// Node module hooks: map @minecraft/* imports to local mocks.
import { register } from "node:module";
register("./resolve-hooks.mjs", import.meta.url);
