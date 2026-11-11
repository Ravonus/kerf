import type { V3 } from "./instances.js";
export interface Offset {
    x: number;
    z: number;
}
/**
 * The breeze at a moment: how hard it blows (0 is dead calm), and the way it blows toward, in radians from +x toward
 * +z.
 */
export interface Breeze {
    readonly wind: number;
    readonly dir: number;
}
/**
 * A breeze that lives: it freshens and slackens over a minute or two, its
 * direction wanders slowly about the way it prevails, and now and then
 * (rarely) it dies away to nothing for a while. `base` is the weather's
 * usual strength; the same seed and time always give the same breeze.
 */
export declare function breezeAt(elapsed: number, base: number, seed?: number): Breeze;
/** The breeze a tree sways in: the moment, its strength, the tree's height, and the way it blows (0, +x). */
export interface Gust {
    readonly elapsed: number;
    readonly wind: number;
    readonly height: number;
    readonly dir?: number | undefined;
}
/** The air a leaf flutters in: the moment and the wind's strength. */
export interface Airflow {
    readonly elapsed: number;
    readonly wind: number;
}
/**
 * Wind bends the tree as one smooth field over space, so a joint moves exactly
 * as both internodes that meet there: the branches flex and never come apart.
 * The crown leans downwind, more as each gust rolls through from upwind and
 * eases back after it; limbs far from the trunk give a little more. In still
 * air it only breathes.
 */
export declare function sway(out: Offset, at: V3, breeze: Gust): Offset;
export interface Flutter {
    readonly droop: number;
    readonly twist: number;
    readonly nod: number;
}
/**
 * How a leaf moves on its own, in radians. In still air it barely stirs; a
 * breeze sets it trembling a little, and a passing gust lifts and flips it to
 * show the paler underside before it settles back.
 */
export declare function leafFlutter(air: Airflow, rank: number, phase: number, along?: number): Flutter;
