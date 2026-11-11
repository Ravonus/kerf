import type { TreeGround } from "../inputs.js";
export declare const ROOT_SEGMENTS = 18;
export interface RootPoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly radius: number;
    readonly gone: boolean;
}
/**
 * How one root of an old tree breaks its planter (`rootBreak`). `heave` (0 to 1)
 * grows with the trunk: the root arches higher out of the soil and levers the
 * rim up where it rolls over. `burst` is how far down the wall, as a share of
 * its depth, the root punches out through the side instead (0: over the lip);
 * `hang` is how far below the wall's foot it may then dangle.
 */
export interface RootBreak {
    readonly heave: number;
    readonly burst: number;
    readonly hang: number;
}
export declare const NO_ROOT_BREAK: RootBreak;
/**
 * Plans every root's break for a tree of this trunk on this ground, seeded:
 * an old tree's roots all heave; on a planter whose side they can break (not
 * metal or gems, see `TreeGround.planter.hard`) most old trees, not all, send
 * a root or two out through the wall, the longest first.
 */
export declare function rootBreaks(roots: readonly {
    readonly angle: number;
    readonly reach: number;
}[], trunk: number, ground: TreeGround, seed?: number): RootBreak[];
/**
 * A surface root as ROOT_SEGMENTS + 1 points. It wanders out from the trunk
 * foot, diving under the turf and surfacing again, and on a planter an old
 * tree's longest roots roll over the lip and creep down the wall. Length grows
 * with the trunk, so saplings keep theirs short. A `rootBreaks` plan heaves an
 * old root higher, or sends it out through the planter's side.
 */
export declare function rootPath(root: {
    readonly angle: number;
    readonly reach: number;
}, trunk: number, ground: TreeGround, plan?: RootBreak): RootPoint[];
/** A chunk of planter an old root broke loose. */
export interface RootShard {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly size: readonly [number, number, number];
    readonly angle: number;
    readonly tilt: number;
    readonly roll: number;
    readonly tone: number;
}
/** The most chunks one root breaks off; the shard mesh is this times the root count, fixed. */
export declare const ROOT_SHARDS = 8;
/** A shard tone past the planter's colours: the dark of a hole or crack in its wall. */
export declare const HOLE_TONE = 3;
/**
 * The chunks one root breaks out of its planter, seeded: where it rolls over
 * the lip, two rim pieces levered up either side of it (a hard planter just
 * cracks: smaller pieces); where it bursts through the side, a ring of broken
 * wall round the hole, one fallen lower, and the rim above split.
 */
/** What a root breaks: the trunk it grows from, the ground it breaks, its plan, and the tree's seed (1). */
export interface Breakage {
    readonly trunk: number;
    readonly ground: TreeGround;
    readonly plan: RootBreak;
    readonly seed?: number;
}
export declare function rootShards(root: {
    readonly angle: number;
    readonly reach: number;
}, index: number, breakage: Breakage): RootShard[];
