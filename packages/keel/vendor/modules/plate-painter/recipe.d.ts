/** Two numbers: a span on one axis, or a point. */
export type Pair = readonly [number, number];
/** A mountain range, one plane of depth. */
export interface RangeRecipe {
    /** Where it stands across the plate; it tapers away outside. */
    readonly x: Pair;
    /** The y its foot fades out at, into mist or the next plane. */
    readonly base: number;
    /** Peaks as `[x, y of the summit]`; the seed moves each a little and adds smaller ones. */
    readonly peaks: readonly Pair[];
    /** How broken the crest is, 0..1. */
    readonly rough: number;
    /** Depth steps toward the haze: each moves the colour a `hazeStep` of the way. */
    readonly depth: number;
    /** The faces the light falls on, and the faces turned away. */
    readonly lit: string;
    readonly shade: string;
}
/** A row of trees, or a wooded bank of round crowns. */
export interface TreeRecipe {
    readonly kind: "spire" | "crown";
    readonly x: Pair;
    /** The y of their feet: one number for a row, a span for a bank. */
    readonly y: Pair;
    readonly count: number;
    /** Heights as a share of the plate's height. */
    readonly height: Pair;
    readonly color: string;
    readonly lit: string;
    readonly depth: number;
}
/** A small town: flat walls and a few towers on a rise. */
export interface TownRecipe {
    readonly x: Pair;
    /** The y the walls stand on. */
    readonly y: number;
    readonly walls: number;
    readonly towers: number;
    /** Wall heights, then tower heights, as shares of the plate's height. */
    readonly height: Pair;
    readonly tower: Pair;
    readonly lit: string;
    readonly shade: string;
    readonly rock: string;
    readonly depth: number;
}
/** A leafy branch: a curve from `from` through `bend` to `to`, leaves along it. */
export interface BranchRecipe {
    readonly from: Pair;
    readonly bend: Pair;
    readonly to: Pair;
    readonly leaves: number;
    /** Leaf length as a share of the plate's height. */
    readonly size: number;
}
/** A mass of leaves filling a box, darker toward its heart. */
export interface MassRecipe {
    readonly x: Pair;
    readonly y: Pair;
    readonly leaves: number;
    readonly size: number;
}
/** Brush strokes of one region: angle in radians (0 runs right, y down), length and width as shares of the width. */
export interface StrokeRecipe {
    readonly angle: number;
    readonly length: number;
    readonly width: number;
    readonly opacity: number;
}
/** The whole plate. */
export interface PlateRecipe {
    /** Width over height. */
    readonly aspect: number;
    /** The colour of the air, and how far each depth step moves toward it. */
    readonly haze: string;
    readonly hazeStep: number;
    readonly sky: {
        readonly top: string;
        readonly low: string;
        /** The darker, bluer top-left corner. */
        readonly corner: string;
        readonly cloudLit: string;
        readonly cloudShade: string;
        /** The cloud band's top and bottom y, its centre x, and how much sky it covers (0..1). */
        readonly band: Pair;
        readonly centre: number;
        readonly cover: number;
    };
    /** Back to front, at most four. */
    readonly ranges: readonly RangeRecipe[];
    readonly shore: {
        readonly top: number;
        readonly y: number;
        readonly color: string;
        readonly lit: string;
    };
    readonly water: {
        readonly near: number;
        readonly far: string;
        readonly deep: string;
        readonly sheen: string;
    };
    readonly ground: {
        readonly color: string;
        readonly warm: string;
        readonly dark: string;
    };
    readonly trees: readonly TreeRecipe[];
    readonly town?: TownRecipe;
    readonly leaves: {
        readonly lit: string;
        readonly mid: string;
        readonly shadow: string;
        readonly deep: string;
        /** No leaf crosses this x. */
        readonly bound: number;
        readonly branches: readonly BranchRecipe[];
        readonly masses: readonly MassRecipe[];
    };
    readonly strokes: {
        readonly sky: StrokeRecipe;
        readonly ridges: StrokeRecipe;
        readonly shore: StrokeRecipe;
        readonly water: StrokeRecipe;
        readonly ground: StrokeRecipe;
    };
    /** The canvas weave's period as a share of the width, and the corners' darkening (0..1). */
    readonly weave: number;
    readonly vignette: number;
}
/**
 * A lake in a valley under an overcast sky: mauve far peaks on the right, a blue-green range left of centre, low
 * hills, a pale far shore with a small town, a row of dark spires, a still lake, and a leafy branch and mass of
 * broad leaves in the near left.
 */
export declare const LAKE_VALLEY: PlateRecipe;
