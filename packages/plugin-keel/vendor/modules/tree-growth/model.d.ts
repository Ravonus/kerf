import type { OrnamentSpec, Species, SpeciesId } from "./species.js";
export interface TreeModel {
    readonly species: Species;
    readonly seed: number;
    /** Cycles of the whole life; the tree is dead at `cycles`. */
    readonly cycles: number;
    /** Last cycle that adds wood; after it the tree declines. */
    readonly matureAt: number;
    readonly count: number;
    readonly parent: Int32Array;
    /** Grown positions, world units, trunk base at the origin. */
    readonly x: Float32Array;
    readonly y: Float32Array;
    readonly z: Float32Array;
    readonly order: Uint8Array;
    /** An internode starts growing at `birth` and is full length `span` later. */
    readonly birth: Float32Array;
    readonly span: Float32Array;
    readonly deadAt: Float32Array;
    readonly shedAt: Float32Array;
    /** Wind phase per internode. */
    readonly phase: Float32Array;
    readonly leaves: LeafSlots;
    /** Flower places (blossoms, catkins, candles, puffs); empty when the species has none. */
    readonly blossoms: LeafSlots;
    /** Fruit places (cherries, acorns, cones, pods). */
    readonly fruit: LeafSlots;
    /** Root flare: angle and reach of each surface root. */
    readonly roots: readonly {
        readonly angle: number;
        readonly reach: number;
    }[];
}
/** Leaf or blossom places, each tied to a node with a fixed offset and a rank for the year's timing. */
export interface LeafSlots {
    readonly count: number;
    readonly node: Int32Array;
    readonly dx: Float32Array;
    readonly dy: Float32Array;
    readonly dz: Float32Array;
    readonly rank: Float32Array;
    readonly size: Float32Array;
    readonly tone: Uint8Array;
}
export interface GrowInput {
    /** A species id; anything else grows a cherry. */
    readonly species: string;
    readonly seed: number;
    readonly maxNodes?: number;
    /**
     * A hybrid: each species' share of the tree's makeup (any positive weights;
     * they are normalised). The tree grows a form between them by share; the
     * largest share decides what cannot be halved (a palm's way of growing,
     * whorls, flowers, fruit, evergreen). `species` is ignored when it is set.
     */
    readonly mix?: Readonly<Record<string, number>>;
}
/** The species' shares in a mix, largest first, unknown ids and non-positive weights dropped, summing to 1. */
export declare function mixShares(mix: Readonly<Record<string, number>>): [SpeciesId, number][];
/**
 * A hybrid species: every measure of form is the shares' weighted mean (an
 * 80/20 cherry-oak is mostly a cherry's crown with an oak's broader reach and
 * flatter limbs); what has no middle comes from the major share.
 */
export declare function blendSpecies(mix: Readonly<Record<string, number>>): Species;
/** Grows one tree from its seed. The same species and seed always give the same tree. */
export declare function growTree(input: GrowInput): TreeModel;
/** One kind's flowers or fruit: what they are and where they hang. */
export interface KindOrnament {
    readonly spec: OrnamentSpec;
    readonly slots: LeafSlots;
}
/**
 * A hybrid's minor kind bears its own flowers and fruit on the limbs it holds
 * (`kinds` from `sectors`): cherry limbs on an oak blossom though the oak only
 * hangs catkins. Places follow the kind's own spec; a renderer opens them on
 * that kind's calendar. Null where the kind has none.
 */
export declare function kindOrnaments(model: TreeModel, species: string, kinds: ArrayLike<number>, kind: number): {
    readonly flower: KindOrnament | null;
    readonly fruit: KindOrnament | null;
};
/**
 * How a species spends its life, as shares of the lifespan: by `prime` it is
 * most of its way grown, getting there fastest while young (`quick`
 * front-loads it); it then keeps growing, more slowly, until `old`, near the
 * very end, when the decline begins.
 */
export interface Pace {
    readonly prime: number;
    readonly quick: number;
    readonly old: number;
}
export declare const PACE: Readonly<Record<SpeciesId, Pace>>;
/**
 * The growth cycle at an age: a fresh sprout at birth, quick when young, then
 * less and less each year on one curve until old age, then the decline to death.
 * By `prime` most of the crown is there; it never stops filling out before `old`.
 */
export declare function cycleAt(model: TreeModel, ageYears: number, lifespanYears: number): number;
