import type { LitLike, MaterialLike, OrnamentSpecLike } from "../inputs.js";
/**
 * A standard material whose instances carry living bark. `ground` is the world y where moss gathers; `bareWall` keeps
 * moss off roots below it (on a planter wall).
 */
export declare function barkMaterial(lit: LitLike, ground?: number, uprightMoss?: boolean, bareWall?: boolean): MaterialLike;
/**
 * Flowers and fruit, per kind. Sizes are in leaf units (width, length, depth);
 * `lift` moves them up from the twig (negative hangs below it). Fruit ripens
 * from `green` to its colours; `fall` is how fast a dropped one falls.
 */
export interface OrnamentLook {
    readonly size: readonly [number, number, number];
    readonly lift: number;
    readonly colors?: readonly string[];
    readonly green?: string;
    readonly fall: number;
}
export declare const ORNAMENTS: Readonly<Record<string, OrnamentLook>>;
export declare function ornamentLook(spec: OrnamentSpecLike, speciesId?: string): OrnamentLook;
