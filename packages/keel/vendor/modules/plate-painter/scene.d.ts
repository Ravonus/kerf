import { type Dab } from "./dab.js";
import type { PlateRecipe } from "./recipe.js";
/** Every dab of the middle distance, reflections first, then far to near. */
export declare function sceneDabs(recipe: PlateRecipe, seed: number): Dab[];
