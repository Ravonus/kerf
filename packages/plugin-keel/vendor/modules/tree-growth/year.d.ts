import type { Hemisphere } from "./species.js";
export type Climate = "temperate" | "maritime" | "alpine" | "monsoon" | "highland" | "desert";
export interface YearInput {
    /** A species id; anything else grows a cherry. */
    readonly species: string;
    /** Day of the year, 1–366, at the tree. */
    readonly day: number;
    readonly year?: number;
    readonly hemisphere?: Hemisphere;
    readonly climate?: string;
}
/** What the year is doing to the crown, every value in [0, 1]. */
export interface YearState {
    /** Share of flowers open. */
    readonly bloom: number;
    /** Share of flowers that have dropped. */
    readonly petals: number;
    /** Share of fruit set and growing. */
    readonly fruit: number;
    /** Share of fruit that has fallen. */
    readonly fruitDrop: number;
    /** Leaves still on the tree are dead and brown (winter-held oak leaves). */
    readonly withered: boolean;
    /** Leaf size: 0 a closed bud, 1 full grown. */
    readonly leaf: number;
    /** Autumn color mix. */
    readonly color: number;
    /** Share of leaves that have fallen. */
    readonly drop: number;
    /** Share of fallen leaves still lying on the ground. */
    readonly litter: number;
    /** Fresh pale green of new growth. */
    readonly flush: number;
    /** The tree is bare and resting. */
    readonly dormant: boolean;
}
/** Where the year stands for a species at a place: bud, blossom, leaf, color and fall. */
export declare function yearState(input: YearInput): YearState;
