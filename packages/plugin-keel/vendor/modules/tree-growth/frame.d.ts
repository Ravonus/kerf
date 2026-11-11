import type { SpeciesId } from "./species.js";
import type { TreeModel } from "./model.js";
export interface TreeFrame {
    readonly cycle: number;
    /** 0 not grown yet, rising to 1 as the internode elongates. */
    readonly grow: Float32Array;
    readonly radius: Float32Array;
    /** 0 living wood, 1 long dead and grey. */
    readonly dead: Float32Array;
    /** 0 attached; rises to 1 while a shed branch falls; it then lies and rots. */
    readonly fall: Float32Array;
    /** 0 sound, 1 rotted away. */
    readonly rot: Float32Array;
    /** Living tips carried, the pipe-model weight. Small values are leafy twigs. */
    readonly tips: Float32Array;
    readonly x: Float32Array;
    readonly y: Float32Array;
    readonly z: Float32Array;
    /** Where each internode starts (its parent's posed end). */
    readonly baseX: Float32Array;
    readonly baseY: Float32Array;
    readonly baseZ: Float32Array;
    /** How many internodes are visible. */
    readonly visible: number;
    readonly height: number;
    /**
     * How much bigger than life a grand tree has grown by now (the mean of taller and wider); 1 for a natural tree.
     * Renderers grow leaf clumps with it.
     */
    readonly scale: number;
}
export interface FrameOptions {
    /** World y of the ground where shed limbs come to rest. */
    readonly ground?: number;
    /**
     * Grow a grand tree, a world tree: it keeps getting bigger all its life,
     * slowing with age, until it stands GRAND times taller and wider than the
     * natural tree, in its own species' way. `true` uses the species' own
     * measure; a number scales how far past life it goes (1 is that measure).
     */
    readonly grand?: boolean | number;
}
/**
 * How much bigger a grand tree of each kind grows than the natural one, upward
 * and outward. Conifers and redwoods tower; acacias, oaks and willows spread
 * wide; a palm only climbs; a baobab swells.
 */
export declare const GRAND: Readonly<Record<SpeciesId, {
    readonly up: number;
    readonly out: number;
}>>;
interface Grandeur {
    readonly up: number;
    readonly out: number;
    readonly girth: number;
}
export declare function grandAt(model: TreeModel, cycle: number, grand?: boolean | number): Grandeur;
/** Poses the tree at a cycle: what has grown, how thick it is, what is dead and what lies on the ground. */
export declare function treeFrame(model: TreeModel, cycle: number, options?: FrameOptions): TreeFrame;
export {};
